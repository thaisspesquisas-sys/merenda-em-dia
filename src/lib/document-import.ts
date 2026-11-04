import { emptyContent, type DocumentContent } from "./document-model";
import { renderHeaderFile } from "./import-header";

export interface ImportResult { content: DocumentContent; preview: string; warnings: string[] }
export async function interpretDocument(file: File): Promise<ImportResult> {
  if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter até 10 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!/^(pdf|xlsx|xls|docx|doc|csv|jpg|jpeg|png)$/.test(ext ?? "")) throw new Error("Formato não aceito.");
  const content = emptyContent(file.name.replace(/\.[^.]+$/, ""));
  const warnings: string[] = [];
  let preview = "";
  const bytes = await file.arrayBuffer();
  if (["xlsx", "xls", "csv"].includes(ext ?? "")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(ext === "csv" ? await file.text() : bytes, { type: ext === "csv" ? "string" : "array", cellStyles: true });
    const sheetName = wb.SheetNames[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) throw new Error("A planilha não contém dados.");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }).map(row => row.map(String));
    if (rows.length > 500 || rows.some(r => r.length > 40)) throw new Error("Importe uma área com até 500 linhas e 40 colunas.");
    const width = Math.max(1, ...rows.map(r => r.length));
    content.columns = Array.from({ length: width }, (_, i) => `Coluna ${i + 1}`);
    content.rows = rows.map(r => Array.from({ length: width }, (_, i) => r[i] ?? ""));
    content.header = "";
    content.merges = (sheet["!merges"] ?? []).map(m => ({ r: m.s.r, c: m.s.c, rowspan: m.e.r - m.s.r + 1, colspan: m.e.c - m.s.c + 1 }));
    warnings.push("Todas as linhas foram preservadas. Confirme quais linhas pertencem ao cabeçalho e ajuste os títulos das colunas.", "Cores e fontes podem variar na versão editável; o arquivo original permanece intacto.");
    if (ext !== "csv") preview = await renderHeaderFile(file);
  } else if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer: bytes });
    const dom = new DOMParser().parseFromString(result.value, "text/html");
    const table = dom.querySelector("table");
    const rows = table ? Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent ?? "")) : [];
    content.header = Array.from(dom.querySelectorAll("body > p")).map(p => p.textContent ?? "").join("\n");
    content.columns = rows.shift() ?? ["Campo", "Informação"];
    content.rows = rows;
    content.notes = result.messages.map(m => m.message).join("\n");
    preview = await renderHeaderFile(file);
    warnings.push("Confirme os títulos e a tabela reconhecida. A disposição editável pode diferir do Word original.");
  } else if (ext === "doc") {
    throw new Error("O formato Word antigo (.doc) requer conversão: salve uma cópia como .docx ou PDF. Nenhum arquivo foi alterado.");
  } else {
    preview = await renderHeaderFile(file);
    let text = "";
    if (ext === "pdf") {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      const task = pdfjs.getDocument({ data: bytes.slice(0) });
      const pdf = await task.promise;
      try {
        if (pdf.numPages > 20) throw new Error("Importe documentos de até 20 páginas.");
        for (let i = 1; i <= pdf.numPages; i++) {
          const p = await pdf.getPage(i); const result = await p.getTextContent();
          text += result.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("") + "\n";
        }
      } finally { await task.destroy(); }
    }
    if (!text.trim()) {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("por");
      try { const result = await worker.recognize(preview); text = result.data.text; warnings.push(`Leitura por OCR: confiança aproximada ${Math.round(result.data.confidence)}%. Confirme todo o texto antes de aprovar.`); }
      finally { await worker.terminate(); }
      if (ext === "pdf") warnings.push("O OCR leu a primeira página digitalizada. Outras páginas devem ser revisadas separadamente.");
    }
    content.header = "";
    content.columns = ["Texto identificado", "Informação confirmada"];
    content.rows = text.split(/\r?\n/).filter(line => line.trim()).map(line => [line, ""]);
    warnings.push("Tabelas digitalizadas exigem confirmação manual de linhas, colunas, datas e assinaturas. Nenhuma informação ausente foi preenchida.");
  }
  return { content, preview, warnings };
}