import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  computeSaldos,
  formatMovObservacoes,
  hoje,
  mapToDbUnidade,
  SALDO_INICIAL_TAG,
  setProductMeta,
  type Movimento,
  type Origem,
  type Produto,
  type UnidadeApresentacao,
} from "./estoque";
import {
  detectColumnMapping,
  detectSchoolFromText,
  inferCategoryByName,
  normalizeOrigem,
  normalizeUnidadeApresentacao,
  parseSmartDate,
  parseSmartNumber,
} from "./ai-intelligence";
import { interpretDocument } from "./document-import";

export type RowIssueType =
  | "ok"
  | "conferencia"
  | "duplicado_planilha"
  | "unidade_incompativel"
  | "quantidade_ausente"
  | "divergencia_estoque"
  | "produto_novo";

export type DivergenceAction =
  "registrar_saldo_inicial" | "ajustar_diferenca" | "somar_ao_existente" | "ignorar";

export interface ExtractedStockRow {
  rowId: string;
  originalRowIndex: number;
  selected: boolean;
  produtoNome: string;
  matchedProductId: string | null;
  quantidadeRaw: string;
  quantidade: number | null;
  unidadeRaw: string;
  unidade: UnidadeApresentacao;
  unidadeReconhecida: boolean;
  categoria: string;
  origem: Origem;
  origemInformada: boolean;
  lote: string;
  validade: string;
  fornecedor: string;
  estoqueSistemaAtual: number;
  divergenciaValor: number;
  issues: RowIssueType[];
  situacaoLabel: string;
  acaoDivergencia: DivergenceAction;
}

export interface ParsedStockFileBatchItem {
  batchItemId: string;
  fileName: string;
  fileSize: number;
  fileRef?: File;
  schoolId: string;
  schoolDetectedAuto: boolean;
  referenceDate: string;
  modelVersionUsed: string;
  alreadyImportedBefore: boolean;
  previewImage: string;
  warnings: string[];
  rawColumns: string[];
  rawRows: string[][];
  rows: ExtractedStockRow[];
  status: "pendente_conferencia" | "aprovado" | "erro";
  errorMessage?: string;
}

export interface MigrationHistoryRecord {
  id: string;
  fileName: string;
  schoolId: string;
  schoolName: string;
  importedAt: string;
  referenceDate: string;
  responsibleUser: string;
  totalIdentified: number;
  totalImported: number;
  totalPending: number;
  conferenceResult: "aprovado_integral" | "aprovado_parcial" | "pendente_conferencia";
  modelVersionUsed: string;
  previewImage?: string;
  rawColumns: string[];
  rawRows: string[][];
  importedItems: {
    produtoNome: string;
    quantidade: number;
    unidade: string;
    origem: Origem;
    categoria: string;
    lote?: string;
    validade?: string;
    acao: string;
  }[];
}

const MIGRATION_HISTORY_KEY = "merenda_stock_migration_history_v1";

export function getLocalMigrationHistory(): MigrationHistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MIGRATION_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MigrationHistoryRecord[];
  } catch {
    return [];
  }
}

export function saveLocalMigrationRecord(record: MigrationHistoryRecord) {
  if (typeof window === "undefined") return;
  try {
    const current = getLocalMigrationHistory().filter((r) => r.id !== record.id);
    current.unshift(record);
    window.localStorage.setItem(MIGRATION_HISTORY_KEY, JSON.stringify(current.slice(0, 200)));
  } catch {
    // ignore storage errors
  }
}

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function evaluateStockRows(
  rows: ExtractedStockRow[],
  produtosExistentes: Produto[],
  movsDaEscola: Movimento[],
): ExtractedStockRow[] {
  const saldos = computeSaldos(movsDaEscola);
  const prodByNorm = new Map<string, Produto>();
  for (const p of produtosExistentes) {
    prodByNorm.set(normName(p.nome), p);
  }

  const nameCounts = new Map<string, number>();
  for (const r of rows) {
    const k = `${normName(r.produtoNome)}|${r.origem}`;
    if (r.produtoNome.trim()) {
      nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    const issues: RowIssueType[] = [];
    const cleanName = normName(row.produtoNome);
    const matched = prodByNorm.get(cleanName) ?? null;
    const matchedProductId = matched?.id ?? null;

    if (!matched) {
      issues.push("produto_novo");
    } else {
      const dbUnid = mapToDbUnidade(row.unidade);
      if (dbUnid !== matched.unidade) {
        issues.push("unidade_incompativel");
      }
    }

    if (row.quantidade === null || !(row.quantidade >= 0) || row.quantidadeRaw.trim() === "") {
      issues.push("quantidade_ausente");
    }

    if (!row.unidadeReconhecida) {
      issues.push("conferencia");
    }

    const dupKey = `${cleanName}|${row.origem}`;
    if ((nameCounts.get(dupKey) ?? 0) > 1) {
      issues.push("duplicado_planilha");
    }

    const saldoExistente = matchedProductId ? (saldos.get(matchedProductId)?.total ?? 0) : 0;
    const diff =
      row.quantidade !== null ? Math.round((row.quantidade - saldoExistente) * 1000) / 1000 : 0;

    if (saldoExistente > 0 && row.quantidade !== null && Math.abs(diff) > 0.001) {
      issues.push("divergencia_estoque");
    }

    const hasBlockingIssue =
      issues.includes("quantidade_ausente") ||
      issues.includes("unidade_incompativel") ||
      issues.includes("duplicado_planilha") ||
      issues.includes("divergencia_estoque");

    if (!hasBlockingIssue && issues.length === 0) {
      issues.push("ok");
    } else if (!hasBlockingIssue && issues.length === 1 && issues[0] === "produto_novo") {
      issues.push("ok");
    }

    let situacaoLabel = "Identificado corretamente";
    if (issues.includes("quantidade_ausente")) {
      situacaoLabel = "Quantidade ausente — informar manualmente";
    } else if (issues.includes("unidade_incompativel")) {
      situacaoLabel = `Unidade incompatível com cadastro (${matched?.unidade})`;
    } else if (issues.includes("divergencia_estoque")) {
      situacaoLabel = `Divergência: sistema possui ${saldoExistente} vs planilha ${row.quantidade}`;
    } else if (issues.includes("duplicado_planilha")) {
      situacaoLabel = "Produto repetido na planilha — conferir";
    } else if (issues.includes("conferencia")) {
      situacaoLabel = "Requer conferência de unidade/campos";
    } else if (issues.includes("produto_novo")) {
      situacaoLabel = "Novo produto (será cadastrado na aprovação)";
    }

    return {
      ...row,
      matchedProductId,
      estoqueSistemaAtual: saldoExistente,
      divergenciaValor: diff,
      issues,
      situacaoLabel,
    };
  });
}

export async function parseStockFileForMigration(
  file: File,
  defaultSchoolId: string,
  escolas: { id: string; nome: string }[],
  produtosExistentes: Produto[],
  movsPorEscola: Map<string, Movimento[]>,
  historicoImportacoes: MigrationHistoryRecord[],
): Promise<ParsedStockFileBatchItem> {
  const imported = await interpretDocument(file);
  const { content, preview, warnings, aiAnalysis } = imported;

  const fullText = `${file.name}\n${content.title}\n${content.header}\n${content.rows
    .slice(0, 8)
    .map((r) => r.join(" "))
    .join("\n")}`;

  const detectedSchool = detectSchoolFromText(fullText, escolas);
  const schoolId = detectedSchool?.id ?? defaultSchoolId;
  const schoolDetectedAuto = Boolean(detectedSchool);

  const referenceDate = aiAnalysis?.detectedReferenceDate ?? parseSmartDate(fullText) ?? hoje();
  const alreadyImportedBefore = historicoImportacoes.some(
    (h) => h.fileName.toLowerCase() === file.name.toLowerCase() && h.schoolId === schoolId,
  );
  if (alreadyImportedBefore) {
    warnings.unshift(
      `Atenção: O arquivo "${file.name}" já consta no histórico de importações desta unidade escolar. Confira para evitar duplicidade.`,
    );
  }

  const mappings = detectColumnMapping(content.columns);
  const idxOf = (key: string) => mappings.find((m) => m.mappedField === key)?.columnIndex ?? -1;

  let prodIdx = idxOf("produto");
  let saldoIdx = idxOf("saldo");
  const entIdx = idxOf("entrada");
  const saiIdx = idxOf("saida");
  const antIdx = idxOf("estoque_anterior");
  const unidIdx = idxOf("unidade");
  const catIdx = idxOf("categoria");
  const origIdx = idxOf("origem");
  const valIdx = idxOf("validade");
  const loteIdx = idxOf("lote");
  const fornIdx = idxOf("fornecedor");

  // Fallback heuristics if headers were generic ("Coluna 1", "Coluna 2"...)
  if (prodIdx === -1) prodIdx = 0;
  if (saldoIdx === -1) {
    // Find first predominantly numeric column after prodIdx
    for (let c = 1; c < content.columns.length; c++) {
      if (c === unidIdx) continue;
      const numericCount = content.rows.filter((r) => parseSmartNumber(r[c]) !== null).length;
      if (numericCount > 0) {
        saldoIdx = c;
        break;
      }
    }
    if (saldoIdx === -1 && content.columns.length > 1) saldoIdx = 1;
  }

  const rawExtracted: ExtractedStockRow[] = [];

  content.rows.forEach((r, rowIdx) => {
    const rawName = (r[prodIdx] ?? "").trim();
    if (!rawName) return;
    // Skip summary/footer/header repetition rows
    if (
      /^(total|subtotal|assinatura|respons[aá]vel|observa[cç][aã]o|data|produto|descri[cç][aã]o|item|g[eê]nero|p[aá]gina)$/i.test(
        rawName,
      )
    ) {
      return;
    }

    let quantidadeRaw = saldoIdx >= 0 ? (r[saldoIdx] ?? "").trim() : "";
    let quantidade = parseSmartNumber(quantidadeRaw);

    // If saldo is not directly filled, check if Estoque Anterior + Entrada - Saída are present
    if (quantidade === null && (antIdx >= 0 || entIdx >= 0)) {
      const ant = antIdx >= 0 ? parseSmartNumber(r[antIdx]) : null;
      const ent = entIdx >= 0 ? parseSmartNumber(r[entIdx]) : null;
      const sai = saiIdx >= 0 ? parseSmartNumber(r[saiIdx]) : null;
      if (ant !== null || ent !== null) {
        quantidade = Math.max(0, (ant ?? 0) + (ent ?? 0) - (sai ?? 0));
        quantidadeRaw = String(quantidade);
      }
    }

    // Try extracting unit from product name or quantity string if unit column is absent
    let unidadeRaw = unidIdx >= 0 ? (r[unidIdx] ?? "").trim() : "";
    if (!unidadeRaw && quantidadeRaw) {
      const unitInQty = quantidadeRaw.match(
        /(kg|quilo|l|litro|un|und|unidade|pct|pacote|cx|caixa|fardo|lata|saco)/i,
      );
      if (unitInQty?.[1]) unidadeRaw = unitInQty[1];
    }

    const normUnid = normalizeUnidadeApresentacao(unidadeRaw);
    const matchedExisting = produtosExistentes.find((p) => normName(p.nome) === normName(rawName));

    const unidadeFinal: UnidadeApresentacao =
      normUnid.apresentacao ??
      matchedExisting?.unidade_apresentacao ??
      matchedExisting?.unidade ??
      "kg";
    const unidadeReconhecida = normUnid.reconhecida || Boolean(matchedExisting);

    const catRaw = catIdx >= 0 ? (r[catIdx] ?? "").trim() : "";
    const categoria = catRaw || matchedExisting?.categoria || inferCategoryByName(rawName);

    const origRaw = origIdx >= 0 ? (r[origIdx] ?? "").trim() : "";
    const normOrig = normalizeOrigem(origRaw);
    const origem: Origem = normOrig ?? matchedExisting?.origem_padrao ?? "mercado";

    const validadeRaw = valIdx >= 0 ? (r[valIdx] ?? "").trim() : "";
    const validade = parseSmartDate(validadeRaw) ?? "";

    const lote = loteIdx >= 0 ? (r[loteIdx] ?? "").trim() : "";
    const fornecedor = fornIdx >= 0 ? (r[fornIdx] ?? "").trim() : "";

    rawExtracted.push({
      rowId: `${rowIdx}-${Math.random().toString(36).slice(2, 7)}`,
      originalRowIndex: rowIdx + 1,
      selected: true,
      produtoNome: rawName,
      matchedProductId: matchedExisting?.id ?? null,
      quantidadeRaw,
      quantidade,
      unidadeRaw: unidadeRaw || unidadeFinal,
      unidade: unidadeFinal,
      unidadeReconhecida,
      categoria,
      origem,
      origemInformada: Boolean(normOrig),
      lote,
      validade,
      fornecedor,
      estoqueSistemaAtual: 0,
      divergenciaValor: 0,
      issues: [],
      situacaoLabel: "",
      acaoDivergencia: "registrar_saldo_inicial",
    });
  });

  const movsEscola = movsPorEscola.get(schoolId) ?? [];
  const evaluated = evaluateStockRows(rawExtracted, produtosExistentes, movsEscola);

  return {
    batchItemId: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    fileRef: file,
    schoolId,
    schoolDetectedAuto,
    referenceDate,
    modelVersionUsed: aiAnalysis?.detectedCategory
      ? `${aiAnalysis.detectedCategory} (IA v1)`
      : "Padrão Institucional (IA v1)",
    alreadyImportedBefore,
    previewImage: preview,
    warnings,
    rawColumns: content.columns,
    rawRows: content.rows,
    rows: evaluated,
    status: "pendente_conferencia",
  };
}

export function computeMigrationIndicators(rows: ExtractedStockRow[]) {
  const active = rows.filter((r) => r.selected);
  return {
    total: rows.length,
    selecionados: active.length,
    identificadosCorretamente: active.filter(
      (r) =>
        r.quantidade !== null &&
        r.quantidade > 0 &&
        !r.issues.includes("unidade_incompativel") &&
        !r.issues.includes("duplicado_planilha") &&
        !r.issues.includes("divergencia_estoque"),
    ).length,
    precisamConferencia: active.filter(
      (r) =>
        r.issues.includes("conferencia") ||
        r.issues.includes("quantidade_ausente") ||
        r.issues.includes("unidade_incompativel") ||
        r.issues.includes("duplicado_planilha") ||
        r.issues.includes("divergencia_estoque"),
    ).length,
    duplicados: active.filter((r) => r.issues.includes("duplicado_planilha")).length,
    unidadeIncompativel: active.filter((r) => r.issues.includes("unidade_incompativel")).length,
    quantidadesAusentes: active.filter((r) => r.issues.includes("quantidade_ausente")).length,
    divergencias: active.filter((r) => r.issues.includes("divergencia_estoque")).length,
    novosProdutos: active.filter((r) => r.issues.includes("produto_novo")).length,
  };
}

export async function approveAndCommitStockMigration(params: {
  batchItem: ParsedStockFileBatchItem;
  schoolName: string;
  responsibleUser: string;
  produtosExistentes: Produto[];
}): Promise<{
  record: MigrationHistoryRecord;
  createdProductsCount: number;
  importedMovementsCount: number;
}> {
  const { batchItem, schoolName, responsibleUser, produtosExistentes } = params;
  if (!batchItem.schoolId) {
    throw new Error("Selecione a unidade escolar antes de confirmar a importação.");
  }

  const selectedRows = batchItem.rows.filter(
    (r) => r.selected && r.acaoDivergencia !== "ignorar" && r.produtoNome.trim().length > 0,
  );
  if (selectedRows.length === 0) {
    throw new Error("Nenhum item válido selecionado para importação.");
  }

  const missingQty = selectedRows.find((r) => r.quantidade === null || !(r.quantidade > 0));
  if (missingQty) {
    throw new Error(
      `O produto "${missingQty.produtoNome}" está sem quantidade válida. Preencha ou desmarque antes de confirmar.`,
    );
  }

  const prodMap = new Map<string, Produto>();
  for (const p of produtosExistentes) {
    prodMap.set(normName(p.nome), p);
  }

  let createdProductsCount = 0;
  let importedMovementsCount = 0;
  const importedItems: MigrationHistoryRecord["importedItems"] = [];

  for (const row of selectedRows) {
    const cleanKey = normName(row.produtoNome);
    let prod = prodMap.get(cleanKey);

    if (!prod) {
      const dbUnidade = mapToDbUnidade(row.unidade);
      const { data: created, error: prodErr } = await supabase
        .from("products")
        .insert({
          nome: row.produtoNome.trim(),
          unidade: dbUnidade,
          categoria: row.categoria || "Mercearia",
          origem_padrao: row.origem,
          ativo: true,
          estoque_minimo: 0,
        })
        .select("*")
        .single();
      if (prodErr)
        throw new Error(`Erro ao criar produto "${row.produtoNome}": ${prodErr.message}`);
      prod = {
        ...created,
        estoque_minimo: Number(created.estoque_minimo),
        unidade_apresentacao: row.unidade,
      } as Produto;
      prodMap.set(cleanKey, prod);
      createdProductsCount++;
    }

    setProductMeta(prod.id, {
      unidade_apresentacao: row.unidade,
      ...(row.fornecedor ? { fornecedor: row.fornecedor } : {}),
      ...(row.validade ? { validade: row.validade } : {}),
      ...(row.lote ? { lote: row.lote } : {}),
    });

    const targetQty = Number(row.quantidade ?? 0);
    let qtyToInsert = targetQty;
    let tipoMov: "entrada" | "saida" = "entrada";

    if (row.estoqueSistemaAtual > 0 && row.acaoDivergencia === "ajustar_diferenca") {
      const diff = Math.round((targetQty - row.estoqueSistemaAtual) * 1000) / 1000;
      if (Math.abs(diff) < 0.001) continue;
      tipoMov = diff > 0 ? "entrada" : "saida";
      qtyToInsert = Math.abs(diff);
    }

    if (qtyToInsert <= 0) continue;

    const obs = formatMovObservacoes({
      saldoInicial: true,
      lote: row.lote,
      validade: row.validade,
      texto: `Saldo Inicial Importado (${batchItem.fileName})`,
    });

    const { error: movErr } = await supabase.from("movements").insert({
      school_id: batchItem.schoolId,
      product_id: prod.id,
      tipo: tipoMov,
      data: batchItem.referenceDate || hoje(),
      quantidade: qtyToInsert,
      origem: row.origem,
      fornecedor: row.fornecedor || "Saldo Inicial Importado",
      nota_fiscal: SALDO_INICIAL_TAG,
      destino: "SALDO_INICIAL",
      responsavel: responsibleUser,
      observacoes: obs,
    });
    if (movErr)
      throw new Error(`Erro ao registrar saldo inicial de "${row.produtoNome}": ${movErr.message}`);

    importedMovementsCount++;
    importedItems.push({
      produtoNome: prod.nome,
      quantidade: qtyToInsert,
      unidade: row.unidade,
      origem: row.origem,
      categoria: row.categoria,
      lote: row.lote || undefined,
      validade: row.validade || undefined,
      acao: "Saldo Inicial Importado",
    });
  }

  const pendingCount = batchItem.rows.length - selectedRows.length;
  const record: MigrationHistoryRecord = {
    id: batchItem.batchItemId,
    fileName: batchItem.fileName,
    schoolId: batchItem.schoolId,
    schoolName,
    importedAt: new Date().toISOString(),
    referenceDate: batchItem.referenceDate,
    responsibleUser,
    totalIdentified: batchItem.rows.length,
    totalImported: importedMovementsCount,
    totalPending: pendingCount,
    conferenceResult: pendingCount === 0 ? "aprovado_integral" : "aprovado_parcial",
    modelVersionUsed: batchItem.modelVersionUsed,
    previewImage: batchItem.previewImage,
    rawColumns: batchItem.rawColumns,
    rawRows: batchItem.rawRows,
    importedItems,
  };

  saveLocalMigrationRecord(record);

  // Also persist in school_documents so the original extracted data and history are safely stored in the database
  try {
    await supabase.from("school_documents").insert({
      school_id: batchItem.schoolId,
      name: `Migração de Estoque Inicial — ${batchItem.fileName}`,
      category: "Controle de estoque",
      reference_date: batchItem.referenceDate,
      responsible: responsibleUser,
      content: {
        title: `Saldo Inicial Importado — ${schoolName}`,
        header:
          "PREFEITURA MUNICIPAL\nSECRETARIA MUNICIPAL DE EDUCAÇÃO\nHISTÓRICO DE MIGRAÇÃO DE ESTOQUE INICIAL",
        headerImage: batchItem.previewImage || "",
        columns: [
          "Produto",
          "Quantidade Importada",
          "Unidade",
          "Categoria",
          "Origem",
          "Lote",
          "Validade",
          "Lançamento",
        ],
        rows: importedItems.map((i) => [
          i.produtoNome,
          String(i.quantidade),
          i.unidade,
          i.categoria,
          i.origem === "agricultura" ? "Agricultura Familiar" : "Mercado",
          i.lote ?? "",
          i.validade ?? "",
          i.acao,
        ]),
        notes: JSON.stringify({
          migrationRecordId: record.id,
          fileName: record.fileName,
          importedAt: record.importedAt,
          totalIdentified: record.totalIdentified,
          totalImported: record.totalImported,
          totalPending: record.totalPending,
          modelVersionUsed: record.modelVersionUsed,
        }),
        orientation: "landscape",
        margin: 10,
        allowColumns: false,
        merges: [],
      } as unknown as Json,
    });
  } catch {
    // Non-blocking if user only has movement write permission
  }

  return { record, createdProductsCount, importedMovementsCount };
}
