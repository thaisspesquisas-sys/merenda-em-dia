import { validateHeaderFile } from "./report-header";

function fileData(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export async function renderHeaderFile(file: File): Promise<string> {
  validateHeaderFile(file);
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) return fileData(file);
  const bytes = await file.arrayBuffer();
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    try {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      return canvas.toDataURL("image/png");
    } finally { await pdf.destroy(); }
  }
  if (ext === "docx") {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-20000px;top:0;width:1000px;background:white;color:black;";
    document.body.append(host);
    try {
      const { renderAsync } = await import("docx-preview");
      await renderAsync(bytes, host, undefined, { inWrapper: false, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: false, useBase64URL: true });
      const page = host.querySelector<HTMLElement>("section.docx");
      if (!page) throw new Error("O Word não contém uma página legível.");
      await document.fonts.ready;
      await Promise.all(Array.from(page.querySelectorAll("img")).map(img => img.decode().catch(() => undefined)));
      const { toPng } = await import("html-to-image");
      return await toPng(page, { pixelRatio: 2, backgroundColor: "white", skipFonts: true });
    } finally { host.remove(); }
  }
  return renderExcel(bytes, ext === "xls");
}

async function renderExcel(bytes: ArrayBuffer, legacy: boolean) {
  if (legacy) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(bytes);
    const name = wb.SheetNames[0];
    if (!name) throw new Error("A planilha está vazia.");
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0, defval: "" }).slice(0, 20);
    const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = Math.max(300, rows.length * 35);
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Não foi possível ler a planilha.");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "black"; ctx.font = "18px Arial";
    rows.forEach((row, i) => ctx.fillText(row.join("    "), 24, 30 + i * 35, 1350));
    return canvas.toDataURL("image/png");
  }
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes);
  const sheet = wb.worksheets[0]; if (!sheet) throw new Error("A planilha está vazia.");
  const count = Math.min(20, Math.max(8, sheet.rowCount));
  const cols = Math.min(20, Math.max(8, sheet.columnCount));
  const xs = [0], ys = [0];
  for (let i = 1; i <= cols; i++) xs.push((xs[i - 1] ?? 0) + (sheet.getColumn(i).width ?? 12) * 7 + 5);
  for (let i = 1; i <= count; i++) ys.push((ys[i - 1] ?? 0) + (sheet.getRow(i).height ?? 24) * 1.333);
  const canvas = document.createElement("canvas"); canvas.width = xs[cols] ?? 1000; canvas.height = ys[count] ?? 700;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Não foi possível ler a planilha.");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const merges = (sheet.model.merges ?? []).map(range => {
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    const col = (s: string) => Array.from(s).reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    return match ? { c1: col(match[1]), r1: Number(match[2]), c2: col(match[3]), r2: Number(match[4]) } : null;
  }).filter(x => x !== null);
  for (let r = 1; r <= count; r++) for (let c = 1; c <= cols; c++) {
    const cell = sheet.getCell(r, c); if (cell.isMerged && cell.master.address !== cell.address) continue;
    const merge = merges.find(m => m.r1 === r && m.c1 === c);
    const x = xs[c - 1] ?? 0, y = ys[r - 1] ?? 0;
    const w = (xs[Math.min(cols, merge?.c2 ?? c)] ?? x) - x;
    const h = (ys[Math.min(count, merge?.r2 ?? r)] ?? y) - y;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (cell.fill?.type === "pattern" && cell.fill.fgColor?.argb) { ctx.fillStyle = `#${cell.fill.fgColor.argb.slice(-6)}`; ctx.fillRect(x, y, w, h); }
    ctx.fillStyle = cell.font?.color?.argb ? `#${cell.font.color.argb.slice(-6)}` : "black";
    ctx.font = `${cell.font?.italic ? "italic " : ""}${cell.font?.bold ? "bold " : ""}${(cell.font?.size ?? 12) * 1.333}px ${cell.font?.name ?? "Arial"}`;
    const align = cell.alignment?.horizontal;
    ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
    ctx.textBaseline = "middle";
    const text = cell.text;
    text.split(/\r?\n/).forEach((line, i, all) => ctx.fillText(line, align === "center" ? x + w / 2 : align === "right" ? x + w - 4 : x + 4, y + h / 2 + (i - (all.length - 1) / 2) * 18, w - 8));
    ctx.restore();
  }
  for (const entry of sheet.getImages()) {
    const image = wb.getImage(Number(entry.imageId));
    if (!image) continue;
    const data = image.base64 ?? (image.buffer ? await fileData(new Blob([new Uint8Array(image.buffer as ArrayBuffer)], { type: `image/${image.extension}` })) : "");
    if (!data) continue;
    const img = new Image(); img.src = data; await img.decode();
    const anchor = (col: number, row: number) => ({ x: (xs[Math.floor(col)] ?? canvas.width) + (col % 1) * ((xs[Math.floor(col) + 1] ?? canvas.width) - (xs[Math.floor(col)] ?? canvas.width)), y: (ys[Math.floor(row)] ?? canvas.height) + (row % 1) * ((ys[Math.floor(row) + 1] ?? canvas.height) - (ys[Math.floor(row)] ?? canvas.height)) });
    const start = anchor(entry.range.tl.col, entry.range.tl.row);
    const end = entry.range.br ? anchor(entry.range.br.col, entry.range.br.row) : null;
    const ext = entry.range.ext;
    ctx.drawImage(img, start.x, start.y, end ? end.x - start.x : ext?.width ?? img.width, end ? end.y - start.y : ext?.height ?? img.height);
  }
  return canvas.toDataURL("image/png");
}