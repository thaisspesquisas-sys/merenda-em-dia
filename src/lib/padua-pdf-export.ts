import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { RelatorioOficialPaduaData } from "./padua-relatorio-oficial";

function fmtNumPdf(n: number): string {
  if (n === 0 || Number.isNaN(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
}

/** Desenha o Brasão institucional de Santo Antônio de Pádua (ou a logo esquerda personalizada enviada pelo usuário) no PDF */
function drawCoatOfArms(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  customDataUrl?: string | null,
) {
  if (customDataUrl) {
    try {
      doc.addImage(customDataUrl, "PNG", x, y, w, h);
      return;
    } catch {
      // fallback para o brasão vetorial caso a imagem falhe
    }
  }
  // Coroa mural no topo
  doc.setFillColor(160, 140, 90);
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.25);
  doc.rect(x + w * 0.15, y, w * 0.7, h * 0.16, "FD");

  // Escudo principal dividido em azul e verde com faixa diagonal amarela
  doc.setFillColor(30, 110, 180);
  doc.rect(x + w * 0.12, y + h * 0.16, w * 0.76, h * 0.58, "FD");
  doc.setFillColor(35, 145, 75);
  doc.triangle(
    x + w * 0.12,
    y + h * 0.74,
    x + w * 0.88,
    y + h * 0.74,
    x + w * 0.88,
    y + h * 0.25,
    "F",
  );
  doc.setDrawColor(235, 195, 45);
  doc.setLineWidth(1.2);
  doc.line(x + w * 0.16, y + h * 0.7, x + w * 0.84, y + h * 0.22);

  // Faixa inferior
  doc.setLineWidth(0.25);
  doc.setDrawColor(40, 40, 40);
  doc.setFillColor(245, 220, 120);
  doc.rect(x + w * 0.05, y + h * 0.78, w * 0.9, h * 0.14, "FD");
}

/** Desenha o logotipo da Secretaria de Educação (ou a logo direita personalizada enviada pelo usuário) */
function drawLogoSecretaria(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  customDataUrl?: string | null,
) {
  if (customDataUrl) {
    try {
      doc.addImage(customDataUrl, "PNG", x, y, w, h);
      return;
    } catch {
      // fallback para a logo vetorial caso a imagem falhe
    }
  }
  // Blocos coloridos do ícone
  doc.setFillColor(25, 65, 145);
  doc.rect(x + w * 0.15, y, w * 0.16, h * 0.45, "F");
  doc.setFillColor(235, 115, 35);
  doc.rect(x + w * 0.34, y + h * 0.12, w * 0.22, h * 0.33, "F");
  doc.setFillColor(245, 190, 30);
  doc.rect(x + w * 0.59, y + h * 0.05, w * 0.2, h * 0.4, "F");

  // Texto SECRETARIA DE EDUCAÇÃO
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.setTextColor(25, 110, 175);
  doc.text("SECRETARIA", x + w * 0.5, y + h * 0.62, { align: "center" });
  doc.text("DE EDUCAÇÃO", x + w * 0.5, y + h * 0.76, { align: "center" });

  doc.setFont("times", "italic");
  doc.setFontSize(4.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Escrevendo um novo futuro!", x + w * 0.5, y + h * 0.91, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

/** Gera e faz download do PDF de 4 páginas reproduzindo fielmente o PDF original anexado */
export function exportarPdfRelatorioPadua4Paginas(
  data: RelatorioOficialPaduaData,
  filename = `mapa-controle-merenda-padua-${data.pag2.mes.toLowerCase()}-${data.pag2.ano}.pdf`,
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // ==========================================================================
  // PÁGINA 1 — CONTROLE SEMANAL (RETRATO A4: 210mm x 297mm)
  // ==========================================================================
  drawCoatOfArms(doc, 14, 9, 13, 15, data.logoEsquerdaDataUrl);
  drawLogoSecretaria(doc, 133, 9, 22, 15, data.logoDireitaDataUrl);

  doc.setFont("times", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.text(data.prefeitura, 82, 13, { align: "center" });
  doc.text(data.secretaria, 82, 17.5, { align: "center" });
  doc.text(data.departamento, 82, 22, { align: "center" });

  // ESCOLA/CRECHE e Nº DE ALUNOS
  doc.setFont("times", "normal");
  doc.setFontSize(9.5);
  doc.text(`ESCOLA/CRECHE: ${data.pag1.escolaCreche}`, 14, 31.5);
  doc.text(`Nº DE ALUNOS: ${data.pag1.numAlunos}`, 14, 36);

  // Quadro Mês / Semana / Dias à direita
  autoTable(doc, {
    startY: 32.5,
    margin: { left: 99, right: 66 },
    tableWidth: 45,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 0.9,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    body: [
      ["Mês:", { content: data.pag1.mes, styles: { halign: "center" } }],
      ["Semana:", { content: data.pag1.semana, styles: { halign: "center" } }],
      ["Dias:", { content: data.pag1.dias, styles: { halign: "center" } }],
    ],
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 31 },
    },
  });

  // Tabela Principal de Gêneros (Página 1 — 43 linhas)
  autoTable(doc, {
    startY: 50,
    margin: { left: 14, right: 66 },
    tableWidth: 130,
    theme: "grid",
    head: [
      ["GÊNEROS", "Estoque\nAnterior", "Entrada", "Estoque\nAtual", "Saída", "Estoque\nFinal"],
    ],
    body: data.pag1.linhas.map((l) => [
      l.genero,
      fmtNumPdf(l.estoqueAnterior),
      fmtNumPdf(l.entrada),
      fmtNumPdf(l.estoqueAtual),
      fmtNumPdf(l.saida),
      fmtNumPdf(l.estoqueFinal),
    ]),
    styles: {
      font: "helvetica",
      fontSize: 7.4,
      cellPadding: { top: 0.55, bottom: 0.55, left: 1.2, right: 1.2 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.22,
    },
    headStyles: {
      fillColor: [232, 232, 232],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 6.5,
      halign: "center",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 59, halign: "left" },
      1: { cellWidth: 14.2, halign: "center" },
      2: { cellWidth: 14.2, halign: "center" },
      3: { cellWidth: 14.2, halign: "center" },
      4: { cellWidth: 14.2, halign: "center" },
      5: { cellWidth: 14.2, halign: "center" },
    },
  });

  // Caixa de Observações da Página 1
  const finalY1 =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 232;
  const obsY = finalY1 + 2.5;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(14, obsY, 130, 14);
  doc.line(14, obsY + 7, 144, obsY + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Observações:", 34, obsY + 4.8);
  doc.setFont("helvetica", "normal");
  if (data.pag1.observacoesLinha1) {
    doc.text(data.pag1.observacoesLinha1, 56, obsY + 4.8);
  }
  if (data.pag1.observacoesLinha2) {
    doc.text(data.pag1.observacoesLinha2, 16, obsY + 11.8);
  }

  // Rodapé de 4 assinaturas na Página 1
  const sigY1 = obsY + 23;
  doc.setLineWidth(0.2);
  doc.line(14, sigY1, 71, sigY1);
  doc.line(86, sigY1, 144, sigY1);
  doc.setFontSize(6.2);
  doc.text("Diretor", 42.5, sigY1 + 3, { align: "center" });
  doc.text("Manipulador de Alimentos", 115, sigY1 + 3, { align: "center" });

  const sigY2 = sigY1 + 12;
  doc.line(14, sigY2, 71, sigY2);
  doc.line(86, sigY2, 144, sigY2);
  doc.text("Supervisora", 42.5, sigY2 + 3, { align: "center" });
  doc.text("Nutricionista", 115, sigY2 + 3, { align: "center" });

  // ==========================================================================
  // PÁGINA 2 — MAPA DE CONTROLE DA MERENDA ESCOLAR / ESCOLAS (RETRATO A4)
  // ==========================================================================
  doc.addPage("a4", "portrait");

  drawCoatOfArms(doc, 18, 12, 16, 20, data.logoEsquerdaDataUrl);
  drawLogoSecretaria(doc, 155, 11, 26, 20, data.logoDireitaDataUrl);

  doc.setFont("times", "normal");
  doc.setFontSize(13.5);
  doc.text(data.prefeitura, 38, 16);
  doc.setFontSize(12);
  doc.text(data.estado, 38, 22);
  doc.text(data.secretaria, 38, 28);
  doc.text(data.departamento, 38, 34);

  // Título Principal
  doc.setFont("times", "bold");
  doc.setFontSize(13.5);
  doc.text("MAPA DE CONTROLE DA MERENDA ESCOLAR", 105, 50, { align: "center" });
  doc.text("ESCOLAS", 105, 56, { align: "center" });

  // Dados da Escola
  doc.setFont("times", "normal");
  doc.setFontSize(10.5);
  doc.text(`Município: ${data.pag2.municipio}`, 21, 72);
  doc.text(`Escola: ${data.pag2.escola}`, 21, 77.5);
  doc.text(`Endereço: ${data.pag2.endereco}`, 21, 83);
  doc.text(`E-mail:${data.pag2.email}`, 21, 88.5);

  // Mês / Ano / Nº de dias letivos
  doc.text(`Mês: ${data.pag2.mes}`, 22, 99);
  doc.text(`Ano: ${data.pag2.ano}`, 62, 99);
  doc.text(`Nº de dias letivos:${data.pag2.diasLetivos}`, 119, 99);

  // Caixas de Horário e Turno
  const drawCheck = (label: string, lx: number, ly: number, bx: number, checked: boolean) => {
    doc.setFont("times", "normal");
    doc.setFontSize(10.5);
    doc.text(label, lx, ly);
    doc.setLineWidth(0.3);
    doc.rect(bx, ly - 5.5, 9, 8.2);
    if (checked) {
      doc.setFont("times", "normal");
      doc.text("X", bx + 4.5, ly, { align: "center" });
    }
  };

  drawCheck("Horário integral", 25, 114, 56.5, data.pag2.horarioIntegral);
  drawCheck("Horário parcial", 25, 124, 56.5, data.pag2.horarioParcial);
  drawCheck("Turno manhã", 108, 113.5, 139, data.pag2.turnoManha);
  drawCheck("Turno tarde", 108, 123.5, 139, data.pag2.turnoTarde);

  // Tabela Modalidade de Ensino / Aluno / Total de refeições Servidas
  autoTable(doc, {
    startY: 143,
    margin: { left: 20, right: 22 },
    tableWidth: 168,
    theme: "grid",
    head: [
      [
        {
          content: "Modalidade de Ensino",
          rowSpan: 2,
          styles: { valign: "middle", halign: "center" },
        },
        { content: "Aluno", colSpan: 2, styles: { halign: "center" } },
        {
          content: "Total de refeições\nServidas",
          rowSpan: 2,
          styles: { valign: "middle", halign: "center" },
        },
      ],
      [
        { content: "Matrícula", styles: { halign: "center" } },
        { content: "Atendimento", styles: { halign: "center" } },
      ],
    ],
    body: [
      ...data.pag2.modalidades.map((m) => [
        m.modalidade,
        { content: m.matricula, styles: { halign: "center" as const } },
        { content: m.atendimento, styles: { halign: "center" as const } },
        { content: m.totalRefeicoes, styles: { halign: "center" as const } },
      ]),
      [
        { content: "Total", styles: { fontStyle: "bold" as const, fontSize: 11.5 } },
        { content: data.pag2.totalMatricula, styles: { halign: "center" as const } },
        { content: data.pag2.totalAtendimento, styles: { halign: "center" as const } },
        { content: data.pag2.totalRefeicoesServidas, styles: { halign: "center" as const } },
      ],
    ],
    styles: {
      font: "times",
      fontSize: 10,
      cellPadding: 1.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 57 },
      1: { cellWidth: 35 },
      2: { cellWidth: 35 },
      3: { cellWidth: 41 },
    },
  });

  // Nº de merendeiras, Local e Data, Assinaturas
  doc.setFont("times", "normal");
  doc.setFontSize(10.5);
  doc.text("Nº de merendeiras na Unidade Escolar: ", 35, 193.5);
  doc.setFont("times", "bold");
  doc.text(data.pag2.numMerendeiras || "00", 98, 193.5);

  doc.setFont("times", "normal");
  doc.text(
    `${data.pag2.cidadeData}, ${data.pag2.diaData} de ${data.pag2.mesData} de ${data.pag2.anoData}.`,
    105,
    212,
    { align: "center" },
  );

  doc.setLineWidth(0.3);
  doc.line(68, 241, 148, 241);
  doc.text("Diretor da Escola", 108, 245.5, { align: "center" });

  doc.line(53, 270, 165, 270);
  doc.text("Departamento de Alimentação Escolar", 109, 274.5, { align: "center" });

  // ==========================================================================
  // PÁGINA 3 — MAPA MENSAL DETALHADO (PAISAGEM A4: 297mm x 210mm — PARTE 1)
  // ==========================================================================
  doc.addPage("a4", "landscape");

  drawCoatOfArms(doc, 14, 8, 13, 14, data.logoEsquerdaDataUrl);
  drawLogoSecretaria(doc, 260, 8, 22, 14, data.logoDireitaDataUrl);

  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text(data.prefeitura, 148.5, 12, { align: "center" });
  doc.text(data.secretaria, 148.5, 16.5, { align: "center" });
  doc.text(data.departamento, 148.5, 21, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.text(`ESCOLA :${data.pag3e4.escola}`, 14, 29);
  doc.setFont("helvetica", "normal");
  doc.text(`Mês : ${data.pag3e4.mes}`, 205, 25);
  doc.text(`Dias letivos: ${data.pag3e4.diasLetivos}`, 205, 29.5);

  const headPag3e4 = [
    [
      {
        content: "GÊNERO",
        rowSpan: 2,
        styles: { valign: "bottom" as const, halign: "left" as const, fontSize: 9.5 },
      },
      { content: "Estoque do mês anterior", colSpan: 2, styles: { halign: "center" as const } },
      { content: "Entrada", colSpan: 2, styles: { halign: "center" as const } },
      { content: "Estoque", colSpan: 2, styles: { halign: "center" as const } },
      { content: "Saída", colSpan: 2, styles: { halign: "center" as const } },
      { content: "Estoque", colSpan: 2, styles: { halign: "center" as const } },
    ],
    [
      "MERCADO",
      "AGRICULT. FAM.",
      "MERCADO",
      "AGRICULT. FAM.",
      "MERCADO",
      "AGRICULT. FAM.",
      "MERCADO",
      "AGRICULT. FAM.",
      "MERCADO",
      "AGRICULT. FAM.",
    ],
  ];

  autoTable(doc, {
    startY: 32,
    margin: { left: 14, right: 14 },
    tableWidth: 269,
    theme: "grid",
    head: headPag3e4,
    body: data.pag3e4.linhasPag3.map((l) => [
      l.genero,
      fmtNumPdf(l.antMercado),
      fmtNumPdf(l.antAgric),
      fmtNumPdf(l.entMercado),
      fmtNumPdf(l.entAgric),
      fmtNumPdf(l.estMercado),
      fmtNumPdf(l.estAgric),
      fmtNumPdf(l.saiMercado),
      fmtNumPdf(l.saiAgric),
      fmtNumPdf(l.fimMercado),
      fmtNumPdf(l.fimAgric),
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 1.35, bottom: 1.35, left: 1.5, right: 1.5 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 69, fontStyle: "bold" },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 20, halign: "center" },
      6: { cellWidth: 20, halign: "center" },
      7: { cellWidth: 20, halign: "center" },
      8: { cellWidth: 20, halign: "center" },
      9: { cellWidth: 20, halign: "center" },
      10: { cellWidth: 20, halign: "center" },
    },
  });

  // ==========================================================================
  // PÁGINA 4 — MAPA MENSAL DETALHADO (PAISAGEM A4: 297mm x 210mm — PARTE 2)
  // ==========================================================================
  doc.addPage("a4", "landscape");

  autoTable(doc, {
    startY: 12,
    margin: { left: 14, right: 14 },
    tableWidth: 269,
    theme: "grid",
    body: data.pag3e4.linhasPag4.map((l) => [
      l.genero,
      fmtNumPdf(l.antMercado),
      fmtNumPdf(l.antAgric),
      fmtNumPdf(l.entMercado),
      fmtNumPdf(l.entAgric),
      fmtNumPdf(l.estMercado),
      fmtNumPdf(l.estAgric),
      fmtNumPdf(l.saiMercado),
      fmtNumPdf(l.saiAgric),
      fmtNumPdf(l.fimMercado),
      fmtNumPdf(l.fimAgric),
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 1.35, bottom: 1.35, left: 1.5, right: 1.5 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 69, fontStyle: "bold" },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 20, halign: "center" },
      6: { cellWidth: 20, halign: "center" },
      7: { cellWidth: 20, halign: "center" },
      8: { cellWidth: 20, halign: "center" },
      9: { cellWidth: 20, halign: "center" },
      10: { cellWidth: 20, halign: "center" },
    },
  });

  // Observações (3 linhas contínuas) e Assinaturas na Página 4
  const finalY4 =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 150;
  const obsY4 = finalY4 + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Observações:", 14, obsY4);
  doc.setFont("helvetica", "normal");
  if (data.pag3e4.observacoes1) doc.text(data.pag3e4.observacoes1, 38, obsY4 - 0.5);
  doc.setLineWidth(0.25);
  doc.line(36, obsY4 + 0.5, 283, obsY4 + 0.5);

  if (data.pag3e4.observacoes2) doc.text(data.pag3e4.observacoes2, 14, obsY4 + 6.5);
  doc.line(14, obsY4 + 7.5, 283, obsY4 + 7.5);

  if (data.pag3e4.observacoes3) doc.text(data.pag3e4.observacoes3, 14, obsY4 + 13.5);
  doc.line(14, obsY4 + 14.5, 283, obsY4 + 14.5);

  const sigY4 = obsY4 + 28;
  doc.line(14, sigY4, 120, sigY4);
  doc.line(160, sigY4, 283, sigY4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Diretor", 67, sigY4 + 4.5, { align: "center" });
  doc.text("Supervisor de Alimentação Escolar", 221.5, sigY4 + 4.5, { align: "center" });

  doc.save(filename);
}
