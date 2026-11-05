import { emptyContent, type DocumentContent } from "./document-model";
import { renderHeaderFile } from "./import-header";
import {
  detectColumnMapping,
  interpretFormulaMeaning,
  parseSmartDate,
  type DetectedFormula,
  type DocumentAIAnalysis,
} from "./ai-intelligence";

export interface ImportResult {
  content: DocumentContent;
  preview: string;
  warnings: string[];
  aiAnalysis?: DocumentAIAnalysis;
}

function classifyDocumentCategory(
  titleAndText: string,
  headers: string[],
): {
  category: string;
  periodType: DocumentAIAnalysis["periodType"];
} {
  const full = `${titleAndText} ${headers.join(" ")}`.toLowerCase();
  if (/semanal|semana\b/i.test(full)) {
    return {
      category: /card[aá]pio/i.test(full) ? "Cardápio semanal" : "Planilha semanal",
      periodType: "semanal",
    };
  }
  if (/mensal|m[eê]s\b|fechamento/i.test(full)) {
    return {
      category: /card[aá]pio/i.test(full) ? "Cardápio mensal" : "Planilha mensal",
      periodType: "mensal",
    };
  }
  if (
    /estoque\s*inicial|invent[aá]rio|saldo\s*atual|estoque\s*existente|levantamento/i.test(full)
  ) {
    return { category: "Controle de estoque", periodType: "estoque_inicial" };
  }
  if (/recebimento|nota\s*fiscal|entrada\s*de\s*g[eê]neros/i.test(full)) {
    return { category: "Recebimento de gêneros", periodType: "movimentacao" };
  }
  return { category: "Planilha mensal", periodType: "mensal" };
}

function extractTextFromLegacyDoc(bytes: ArrayBuffer): string[][] {
  const decoderLatin = new TextDecoder("windows-1252", { fatal: false });
  const rawLatin = decoderLatin.decode(bytes);
  // Check if it's actually an HTML/RTF/XML saved with .doc extension (very common in municipal secretariats)
  if (/<table[\s>]/i.test(rawLatin) && typeof DOMParser !== "undefined") {
    const dom = new DOMParser().parseFromString(rawLatin, "text/html");
    const table = dom.querySelector("table");
    if (table) {
      return Array.from(table.rows).map((r) =>
        Array.from(r.cells).map((c) => (c.textContent ?? "").trim()),
      );
    }
  }
  // Extract printable lines from binary .doc (UTF-16LE and ASCII runs)
  const decoderUtf16 = new TextDecoder("utf-16le", { fatal: false });
  const rawUtf16 = decoderUtf16.decode(bytes);
  const combined = `${rawLatin}\n${rawUtf16}`;
  const matches = combined.match(/[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s.,;:/()-]{3,140}/g) ?? [];
  const cleanLines = matches
    .map((m) => m.replace(/\s+/g, " ").trim())
    .filter(
      (m) =>
        m.length >= 4 &&
        !/^(Microsoft|Word\.Document|Normal\.dot|Times New Roman|Arial|Calibri|Root Entry|SummaryInformation)/i.test(
          m,
        ),
    );
  const unique = Array.from(new Set(cleanLines)).slice(0, 200);
  return unique.map((line) => {
    const parts = line
      .split(/\t+|\s{2,}|;/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 1 ? parts : [line, ""];
  });
}

export async function interpretDocument(
  file: File,
  requestedSheetIndex = 0,
): Promise<ImportResult> {
  if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter até 10 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!/^(pdf|xlsx|xls|docx|doc|csv|jpg|jpeg|png)$/.test(ext ?? ""))
    throw new Error("Formato não aceito.");
  const content = emptyContent(file.name.replace(/\.[^.]+$/, ""));
  const warnings: string[] = [];
  let preview = "";
  let sheets: string[] = ["Página 1"];
  let selectedSheet = "Página 1";
  const formulas: DetectedFormula[] = [];
  const bytes = await file.arrayBuffer();

  if (["xlsx", "xls", "csv"].includes(ext ?? "")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(ext === "csv" ? await file.text() : bytes, {
      type: ext === "csv" ? "string" : "array",
      cellStyles: true,
      cellFormula: true,
    });
    sheets = wb.SheetNames.length > 0 ? wb.SheetNames : ["Planilha1"];
    const safeIdx = Math.min(Math.max(0, requestedSheetIndex), sheets.length - 1);
    const sheetName = sheets[safeIdx];
    selectedSheet = sheetName ?? "Planilha1";
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) throw new Error("A planilha não contém dados.");

    // Extract formulas from sheet
    for (const [cellAddr, cellObj] of Object.entries(sheet)) {
      if (cellAddr.startsWith("!")) continue;
      const c = cellObj as { f?: string; v?: unknown; w?: string };
      if (c && typeof c.f === "string" && c.f.trim()) {
        formulas.push({
          cell: cellAddr,
          formula: `=${c.f}`,
          value: String(c.w ?? c.v ?? ""),
          meaning: interpretFormulaMeaning(c.f),
        });
      }
    }

    const rawRows = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false })
      .map((row) => row.map((v) => String(v ?? "").trim()));
    if (rawRows.length > 500 || rawRows.some((r) => r.length > 40)) {
      throw new Error("Importe uma área com até 500 linhas e 40 colunas.");
    }
    const width = Math.max(1, ...rawRows.map((r) => r.length));
    const paddedRows = rawRows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));

    // Smart detection of institutional header rows vs table column header row
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(12, paddedRows.length); i++) {
      const row = paddedRows[i] ?? [];
      const nonEmpty = row.filter((c) => c.trim().length > 0);
      if (nonEmpty.length >= 2) {
        const mappings = detectColumnMapping(row);
        const mappedCount = mappings.filter((m) => m.mappedField !== null).length;
        if (mappedCount >= 2) {
          headerRowIndex = i;
          break;
        }
      }
    }

    if (headerRowIndex >= 0) {
      const institutionalLines = paddedRows
        .slice(0, headerRowIndex)
        .map((r) => r.filter(Boolean).join(" — "))
        .filter(Boolean);
      content.header =
        institutionalLines.join("\n") || "PREFEITURA MUNICIPAL\nSECRETARIA MUNICIPAL DE EDUCAÇÃO";
      content.columns = paddedRows[headerRowIndex]!.map((c, i) => c.trim() || `Coluna ${i + 1}`);
      content.rows = paddedRows.slice(headerRowIndex + 1);
    } else {
      content.columns = Array.from({ length: width }, (_, i) => `Coluna ${i + 1}`);
      content.rows = paddedRows;
      content.header = "";
    }

    content.merges = (sheet["!merges"] ?? [])
      .map((m) => ({
        r: Math.max(0, m.s.r - (headerRowIndex >= 0 ? headerRowIndex + 1 : 0)),
        c: m.s.c,
        rowspan: m.e.r - m.s.r + 1,
        colspan: m.e.c - m.s.c + 1,
      }))
      .filter((m) => m.r >= 0);

    if (sheets.length > 1) {
      warnings.push(
        `Planilha com múltiplas abas detectada (${sheets.length} abas: ${sheets.join(", ")}). Aba ativa: "${selectedSheet}".`,
      );
    }
    if (formulas.length > 0) {
      warnings.push(
        `${formulas.length} fórmula(s) de cálculo foram identificadas na planilha e preservadas para conferência.`,
      );
    }
    warnings.push(
      "Todas as linhas foram preservadas. Confirme quais linhas pertencem ao cabeçalho e ajuste os títulos das colunas.",
      "Cores e fontes podem variar na versão editável; o arquivo original permanece intacto.",
    );
    if (ext !== "csv") {
      try {
        preview = await renderHeaderFile(file);
      } catch {
        preview = "";
      }
    }
  } else if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer: bytes });
    const dom = new DOMParser().parseFromString(result.value, "text/html");
    const table = dom.querySelector("table");
    const rows = table
      ? Array.from(table.rows).map((r) =>
          Array.from(r.cells).map((c) => (c.textContent ?? "").trim()),
        )
      : [];
    content.header =
      Array.from(dom.querySelectorAll("body > p"))
        .map((p) => (p.textContent ?? "").trim())
        .filter(Boolean)
        .join("\n") || "PREFEITURA MUNICIPAL\nSECRETARIA MUNICIPAL DE EDUCAÇÃO";
    content.columns = rows.shift() ?? ["Campo", "Informação"];
    content.rows = rows;
    content.notes = result.messages.map((m) => m.message).join("\n");
    try {
      preview = await renderHeaderFile(file);
    } catch {
      preview = "";
    }
    warnings.push(
      "Confirme os títulos e a tabela reconhecida. A disposição editável pode diferir do Word original.",
    );
  } else if (ext === "doc") {
    const extractedRows = extractTextFromLegacyDoc(bytes);
    if (extractedRows.length === 0) {
      content.columns = ["Texto identificado", "Informação confirmada"];
      content.rows = [];
      warnings.push(
        "Arquivo Word (.doc) sem tabela estruturada legível. Confirme manualmente os campos ou salve como .docx.",
      );
    } else {
      const firstRow = extractedRows[0] ?? ["Produto", "Quantidade"];
      const mappings = detectColumnMapping(firstRow);
      if (mappings.some((m) => m.mappedField !== null)) {
        content.columns = firstRow;
        content.rows = extractedRows.slice(1);
      } else {
        const width = Math.max(2, ...extractedRows.map((r) => r.length));
        content.columns = Array.from({ length: width }, (_, i) => `Coluna ${i + 1}`);
        content.rows = extractedRows.map((r) =>
          Array.from({ length: width }, (_, i) => r[i] ?? ""),
        );
      }
      warnings.push(
        "Documento Word (.doc) interpretado automaticamente. Revise os títulos e linhas antes de aprovar.",
      );
    }
  } else {
    try {
      preview = await renderHeaderFile(file);
    } catch {
      preview = "";
    }
    let text = "";
    const structuredPdfRows: string[][] = [];
    if (ext === "pdf") {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = (
        await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
      ).default;
      const task = pdfjs.getDocument({ data: bytes.slice(0) });
      const pdf = await task.promise;
      try {
        if (pdf.numPages > 20) throw new Error("Importe documentos de até 20 páginas.");
        sheets = Array.from({ length: pdf.numPages }, (_, idx) => `Página ${idx + 1}`);
        for (let i = 1; i <= pdf.numPages; i++) {
          const p = await pdf.getPage(i);
          const result = await p.getTextContent();
          // Group items by Y coordinate to reconstruct table rows in PDFs
          const lineBuckets = new Map<number, { x: number; str: string }[]>();
          for (const item of result.items) {
            if (!("str" in item) || !item.str.trim()) continue;
            const y = Math.round((item.transform?.[5] ?? 0) / 4) * 4;
            const x = Math.round(item.transform?.[4] ?? 0);
            const bucket = lineBuckets.get(y) ?? [];
            bucket.push({ x, str: item.str.trim() });
            lineBuckets.set(y, bucket);
          }
          const sortedYs = Array.from(lineBuckets.keys()).sort((a, b) => b - a);
          for (const y of sortedYs) {
            const cells = (lineBuckets.get(y) ?? []).sort((a, b) => a.x - b.x).map((c) => c.str);
            if (cells.length > 0) {
              structuredPdfRows.push(cells);
              text += cells.join("   ") + "\n";
            }
          }
        }
      } finally {
        await task.destroy();
      }
    }
    if (!text.trim() && preview) {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("por");
      try {
        const result = await worker.recognize(preview);
        text = result.data.text;
        warnings.push(
          `Leitura por OCR: confiança aproximada ${Math.round(result.data.confidence)}%. Confirme todo o texto antes de aprovar.`,
        );
      } finally {
        await worker.terminate();
      }
      if (ext === "pdf") {
        warnings.push(
          "O OCR leu a primeira página digitalizada. Outras páginas devem ser revisadas separadamente.",
        );
      }
    }
    content.header = "";
    if (structuredPdfRows.length >= 2 && structuredPdfRows.some((r) => r.length >= 3)) {
      let headerIdx = 0;
      for (let i = 0; i < Math.min(10, structuredPdfRows.length); i++) {
        const m = detectColumnMapping(structuredPdfRows[i] ?? []);
        if (m.filter((x) => x.mappedField !== null).length >= 2) {
          headerIdx = i;
          break;
        }
      }
      const maxCols = Math.min(
        15,
        Math.max(2, ...structuredPdfRows.slice(headerIdx).map((r) => r.length)),
      );
      content.header = structuredPdfRows
        .slice(0, headerIdx)
        .map((r) => r.join(" "))
        .join("\n");
      content.columns = Array.from(
        { length: maxCols },
        (_, i) => structuredPdfRows[headerIdx]?.[i] || `Coluna ${i + 1}`,
      );
      content.rows = structuredPdfRows
        .slice(headerIdx + 1)
        .map((r) => Array.from({ length: maxCols }, (_, i) => r[i] ?? ""));
    } else {
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const splitLines = lines.map((l) =>
        l
          .split(/\t+|\s{2,}|;/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
      if (splitLines.some((r) => r.length >= 3)) {
        const maxCols = Math.min(12, Math.max(2, ...splitLines.map((r) => r.length)));
        content.columns = Array.from({ length: maxCols }, (_, i) => `Coluna ${i + 1}`);
        content.rows = splitLines.map((r) => Array.from({ length: maxCols }, (_, i) => r[i] ?? ""));
      } else {
        content.columns = ["Texto identificado", "Informação confirmada"];
        content.rows = lines.map((line) => [line, ""]);
      }
    }
    warnings.push(
      "Tabelas digitalizadas exigem confirmação manual de linhas, colunas, datas e assinaturas. Nenhuma informação ausente foi preenchida.",
    );
  }

  // Build AI Analysis summary
  const columnMappings = detectColumnMapping(content.columns);
  const fullText = `${content.title}\n${content.header}\n${content.rows
    .slice(0, 10)
    .map((r) => r.join(" "))
    .join("\n")}`;
  const { category, periodType } = classifyDocumentCategory(fullText, content.columns);
  const mandatoryFields = columnMappings.filter((m) => m.mandatory).map((m) => m.fieldLabel);
  const optionalFields = columnMappings
    .filter((m) => !m.mandatory && m.mappedField !== null)
    .map((m) => m.fieldLabel);
  const secretariatPatternRecognized =
    /secretaria|prefeitura|merenda|pnae|educa[cç][aã]o|agricultura\s*familiar|escola/i.test(
      fullText,
    ) || columnMappings.filter((m) => m.mappedField !== null).length >= 2;
  const detectedReferenceDate = parseSmartDate(fullText);
  const productRowsCount = content.rows.filter((r) => r.some((c) => c.trim().length > 0)).length;

  const aiAnalysis: DocumentAIAnalysis = {
    detectedCategory: category,
    periodType,
    detectedSchoolName: null,
    detectedReferenceDate,
    sheets,
    selectedSheet,
    columnMappings,
    mandatoryFields:
      mandatoryFields.length > 0 ? mandatoryFields : ["Produto / Gênero Alimentício", "Quantidade"],
    optionalFields:
      optionalFields.length > 0
        ? optionalFields
        : ["Fornecedor", "Nota Fiscal", "Validade", "Lote", "Observações"],
    formulas: formulas.slice(0, 30),
    productRowsCount,
    secretariatPatternRecognized,
    summary: `Reconhecido padrão "${category}" (${periodType}) com ${content.columns.length} coluna(s), ${productRowsCount} linha(s) de dados e ${formulas.length} fórmula(s).`,
  };

  return { content, preview, warnings, aiAnalysis };
}
