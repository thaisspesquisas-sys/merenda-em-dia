import { loadHeaderImage } from "./report-header";

export interface DocInfo {
  titulo: string;
  escola: string;
  mes: string;
  ano: number;
  responsavel?: string;
  headerImage?: string | undefined;
}

export type Cell = string | number;

function headerLines(info: DocInfo) {
  return [
    "PREFEITURA MUNICIPAL",
    "SECRETARIA MUNICIPAL DE EDUCAÇÃO",
    info.titulo.toUpperCase(),
    `Unidade escolar: ${info.escola}   |   Período de referência: ${info.mes}   |   Ano: ${info.ano}   |   Responsável pelo estoque: ${info.responsavel || "________________"}`,
  ];
}

export async function exportExcel(
  info: DocInfo,
  columns: string[],
  rows: Cell[][],
  filename: string,
) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Relatório", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  ws.columns = columns.map((c, i) => ({ width: i === 0 ? 28 : Math.max(12, c.length + 2) }));
  let row = 1;
  if (info.headerImage) {
    const img = await loadHeaderImage(info.headerImage);
    const width = Math.min(
      1000,
      columns.reduce((sum, c, i) => sum + (i === 0 ? 28 : Math.max(12, c.length + 2)) * 7 + 5, 0),
    );
    const height = Math.min(140, (width * img.naturalHeight) / img.naturalWidth);
    const actualWidth = (height * img.naturalWidth) / img.naturalHeight;
    const id = wb.addImage({ base64: info.headerImage, extension: "png" });
    const imageRows = Math.ceil(height / 20) + 1;
    for (let i = 1; i <= imageRows; i++) ws.getRow(i).height = 15;
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: actualWidth, height } });
    row = imageRows + 1;
  } else {
    for (const text of headerLines(info).slice(0, 2)) {
      ws.getCell(row, 1).value = text;
      ws.mergeCells(row, 1, row, columns.length);
      ws.getRow(row).font = { name: "Arial", bold: true, size: 11 };
      ws.getRow(row).alignment = { horizontal: "center" };
      row++;
    }
  }
  for (const text of headerLines(info).slice(2)) {
    ws.getCell(row, 1).value = text;
    ws.mergeCells(row, 1, row, columns.length);
    ws.getRow(row).alignment = { horizontal: "center", wrapText: true };
    ws.getRow(row).height = 28;
    row++;
  }
  row++;
  const headingRow = row;
  ws.getRow(row).values = columns;
  ws.getRow(row).font = { name: "Arial", bold: true, size: 10 };
  ws.getRow(row).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(row).height = 36;
  row++;
  for (const values of rows) {
    ws.getRow(row).values = values;
    ws.getRow(row).font = { name: "Arial", size: 10 };
    row++;
  }
  ws.pageSetup.printTitlesRow = `1:${headingRow}`;
  const data = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(data)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPDF(
  info: DocInfo,
  columns: string[],
  rows: Cell[][],
  filename: string,
  observacoes?: string,
  dataFechamento?: string,
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const lines = headerLines(info);
  let headingY = 24;
  let imageDimensions: { width: number; height: number } | undefined;
  if (info.headerImage) {
    const img = await loadHeaderImage(info.headerImage);
    const h = Math.min(35, ((w - 20) * img.naturalHeight) / img.naturalWidth);
    imageDimensions = { width: (h * img.naturalWidth) / img.naturalHeight, height: h };
    headingY = 10 + h + 6;
  }
  function drawHeader() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    if (info.headerImage && imageDimensions) {
      doc.addImage(
        info.headerImage,
        "PNG",
        (w - imageDimensions.width) / 2,
        10,
        imageDimensions.width,
        imageDimensions.height,
      );
    } else {
      doc.text(lines[0] ?? "", w / 2, 12, { align: "center" });
      doc.text(lines[1] ?? "", w / 2, 18, { align: "center" });
    }
    doc.setFontSize(11);
    doc.text(lines[2] ?? "", w / 2, headingY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(lines[3] ?? "", w / 2, headingY + 6, { align: "center" });
  }
  autoTable(doc, {
    startY: headingY + 10,
    didDrawPage: drawHeader,
    head: [columns],
    body: rows.map((r) => r.map(String)),
    styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [120, 120, 120], lineWidth: 0.1 },
    headStyles: { fillColor: [222, 235, 222], textColor: 20, fontStyle: "bold", halign: "center" },
    columnStyles: Object.fromEntries(
      columns.map((_, i) => [i, { halign: i === 0 ? "left" : "right" }]),
    ),
    margin: { left: 10, right: 10, top: headingY + 10 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY ?? 40) + 10;
  if (y > 170) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(9);
  doc.text(`Data do fechamento: ${dataFechamento || "____/____/________"}`, 10, y);
  doc.text(`Observações: ${observacoes || ""}`, 10, y + 6, { maxWidth: w - 20 });
  const sy = y + 26;
  doc.line(25, sy, 120, sy);
  doc.line(w - 120, sy, w - 25, sy);
  doc.text("Responsável pelo estoque", 72, sy + 5, { align: "center" });
  doc.text("Direção escolar", w - 72, sy + 5, { align: "center" });
  doc.save(`${filename}.pdf`);
}

export async function exportWord(
  info: DocInfo,
  columns: string[],
  rows: Cell[][],
  filename: string,
  observacoes?: string,
  dataFechamento?: string,
) {
  const D = await import("docx");
  const lines = headerLines(info);
  const headerParagraphs: InstanceType<typeof D.Paragraph>[] = [];
  if (info.headerImage) {
    const img = await loadHeaderImage(info.headerImage);
    const b64 = info.headerImage.split(",")[1] ?? "";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    headerParagraphs.push(
      new D.Paragraph({
        alignment: D.AlignmentType.CENTER,
        children: [
          new D.ImageRun({
            type: "png",
            data: bytes,
            transformation: {
              width: 650,
              height: Math.min(100, (650 * img.naturalHeight) / img.naturalWidth),
            },
          }),
        ],
      }),
    );
  } else {
    headerParagraphs.push(
      new D.Paragraph({ text: lines[0] ?? "", alignment: D.AlignmentType.CENTER }),
      new D.Paragraph({ text: lines[1] ?? "", alignment: D.AlignmentType.CENTER }),
    );
  }
  const tableRows = [columns, ...rows.map((r) => r.map((c) => String(c)))].map(
    (r, idx) =>
      new D.TableRow({
        tableHeader: idx === 0,
        children: r.map((cell) => new D.TableCell({ children: [new D.Paragraph(cell)] })),
      }),
  );
  const doc = new D.Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: D.PageOrientation.LANDSCAPE },
          },
        },
        headers: { default: new D.Header({ children: headerParagraphs }) },
        children: [
          new D.Paragraph({ text: lines[2] ?? "", heading: D.HeadingLevel.HEADING_2 }),
          new D.Paragraph({ text: lines[3] ?? "" }),
          new D.Table({
            width: { size: 100, type: D.WidthType.PERCENTAGE },
            rows: tableRows,
          }),
          new D.Paragraph({
            text: `Data do fechamento: ${dataFechamento || "____/____/________"}`,
          }),
          new D.Paragraph({
            text: `Observações: ${observacoes || "________________________________________"}`,
          }),
          new D.Paragraph({
            text: "Responsável pelo estoque: _____________________      Direção escolar: _____________________",
          }),
        ],
      },
    ],
  });
  const blob = await D.Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
