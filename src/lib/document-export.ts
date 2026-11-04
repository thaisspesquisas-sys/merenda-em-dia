import type { DocumentContent } from "./document-model";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportDocument(content: DocumentContent, format: "pdf" | "excel" | "word", filename: string) {
  if (format === "excel") {
    const { default: ExcelJS } = await import("exceljs"); const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet("Documento", { pageSetup: { paperSize: 9, orientation: content.orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    s.columns = content.columns.map(() => ({ width: 24 }));
    let row = 1;
    if (content.headerImage) { const id = wb.addImage({ base64: content.headerImage, extension: "png" }); s.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 750, height: 100 } }); row = 7; }
    for (const line of content.header.split("\n").filter(Boolean)) { s.getCell(row, 1).value = line; s.mergeCells(row, 1, row, Math.max(1, content.columns.length)); row++; }
    s.getCell(row, 1).value = content.title; row += 2; s.getRow(row).values = content.columns; s.getRow(row).font = { name: "Arial", bold: true }; s.pageSetup.printTitlesRow = `1:${row}`; row++;
    const offset = row;
    content.rows.forEach(r => { s.getRow(row).values = r; s.getRow(row).alignment = { wrapText: true, vertical: "top" }; row++; });
    for (const m of content.merges) if (m.r + m.rowspan <= content.rows.length && m.c + m.colspan <= content.columns.length) s.mergeCells(offset + m.r, m.c + 1, offset + m.r + m.rowspan - 1, m.c + m.colspan);
    s.getCell(row + 2, 1).value = content.notes;
    const data = await wb.xlsx.writeBuffer(); download(new Blob([new Uint8Array(data)]), `${filename}.xlsx`); return;
  }
  if (format === "word") {
    const D = await import("docx");
    const paragraphs = content.header.split("\n").filter(Boolean).map(line => new D.Paragraph({ text: line, alignment: D.AlignmentType.CENTER }));
    if (content.headerImage) {
      const { loadHeaderImage } = await import("./report-header"); const img = await loadHeaderImage(content.headerImage);
      paragraphs.unshift(new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.ImageRun({ type: "png", data: Uint8Array.from(atob(content.headerImage.split(",")[1] ?? ""), c => c.charCodeAt(0)), transformation: { width: 650, height: Math.min(100, 650 * img.height / img.width) } })] }));
    }
    const table = new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [content.columns, ...content.rows].map((r, index) => new D.TableRow({ tableHeader: index === 0, children: r.map(cell => new D.TableCell({ children: [new D.Paragraph(cell)] })) })) });
    const doc = new D.Document({ sections: [{ properties: { page: { size: { orientation: content.orientation === "landscape" ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT }, margin: { top: content.margin * 57, bottom: content.margin * 57, left: content.margin * 57, right: content.margin * 57 } } }, headers: { default: new D.Header({ children: paragraphs }) }, children: [new D.Paragraph({ text: content.title, heading: D.HeadingLevel.HEADING_1 }), table, new D.Paragraph(content.notes), new D.Paragraph("Responsável: __________________    Assinatura: __________________")] }] });
    download(await D.Packer.toBlob(doc), `${filename}.docx`); return;
  }
  const { jsPDF } = await import("jspdf"); const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: content.orientation, unit: "mm", format: "a4" }); const width = doc.internal.pageSize.getWidth();
  let imageHeight = 0;
  if (content.headerImage) { const { loadHeaderImage } = await import("./report-header"); const img = await loadHeaderImage(content.headerImage); imageHeight = Math.min(30, (width - content.margin * 2) * img.height / img.width); }
  const lines = content.header.split("\n").filter(Boolean); const titleY = content.margin + imageHeight + lines.length * 5 + 6;
  autoTable(doc, { startY: titleY + 6, margin: { top: titleY + 6, left: content.margin, right: content.margin, bottom: content.margin }, head: [content.columns], body: content.rows, styles: { fontSize: 8, overflow: "linebreak" }, didDrawPage: () => {
    if (content.headerImage) doc.addImage(content.headerImage, "PNG", content.margin, content.margin, width - content.margin * 2, imageHeight);
    doc.setFontSize(10); lines.forEach((line, i) => doc.text(line, width / 2, content.margin + imageHeight + (i + 1) * 5, { align: "center" })); doc.setFontSize(12); doc.text(content.title, width / 2, titleY, { align: "center" });
  } });
  doc.save(`${filename}.pdf`);
}