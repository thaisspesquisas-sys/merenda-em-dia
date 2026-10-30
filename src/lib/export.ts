export interface DocInfo {
  titulo: string;
  escola: string;
  mes: string;
  ano: number;
  responsavel?: string;
}

export type Cell = string | number;

function headerLines(info: DocInfo) {
  return [
    "PREFEITURA MUNICIPAL",
    "SECRETARIA MUNICIPAL DE EDUCAÇÃO",
    info.titulo.toUpperCase(),
    `Unidade escolar: ${info.escola}   |   Mês de referência: ${info.mes}   |   Ano: ${info.ano}   |   Responsável pelo estoque: ${info.responsavel || "________________"}`,
  ];
}

export async function exportExcel(info: DocInfo, columns: string[], rows: Cell[][], filename: string) {
  const XLSX = await import("xlsx");
  const aoa: Cell[][] = [...headerLines(info).map((l) => [l]), [], columns, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c, i) => ({ wch: i === 0 ? 28 : Math.max(12, c.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function exportPDF(info: DocInfo, columns: string[], rows: Cell[][], filename: string, observacoes?: string, dataFechamento?: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const lines = headerLines(info);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(lines[0], w / 2, 12, { align: "center" });
  doc.text(lines[1], w / 2, 18, { align: "center" });
  doc.setFontSize(11);
  doc.text(lines[2], w / 2, 24, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(lines[3], w / 2, 30, { align: "center" });
  autoTable(doc, {
    startY: 34,
    head: [columns],
    body: rows.map((r) => r.map(String)),
    styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [120, 120, 120], lineWidth: 0.1 },
    headStyles: { fillColor: [222, 235, 222], textColor: 20, fontStyle: "bold", halign: "center" },
    columnStyles: Object.fromEntries(columns.map((_, i) => [i, { halign: i === 0 ? "left" : "right" }])),
    margin: { left: 10, right: 10 },
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
