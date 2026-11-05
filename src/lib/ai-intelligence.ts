import {
  computeMensal,
  computeSaldos,
  computeSemanal,
  fmtData,
  fmtQ,
  hoje,
  isSaldoInicial,
  monthRange,
  parseMovObservacoes,
  weekRangesOfMonth,
  type Movimento,
  type Origem,
  type Produto,
  type UnidadeApresentacao,
} from "./estoque";

export type SemanticFieldKey =
  | "produto"
  | "unidade"
  | "categoria"
  | "origem"
  | "estoque_anterior"
  | "entrada"
  | "saida"
  | "saldo"
  | "validade"
  | "lote"
  | "fornecedor"
  | "nota_fiscal"
  | "responsavel"
  | "destino"
  | "escola"
  | "data"
  | "observacoes";

export interface ColumnSemanticMatch {
  columnIndex: number;
  originalHeader: string;
  mappedField: SemanticFieldKey | null;
  fieldLabel: string;
  mandatory: boolean;
  confidence: number;
}

export interface DetectedFormula {
  cell: string;
  formula: string;
  value: string;
  meaning: string;
}

export interface DocumentAIAnalysis {
  detectedCategory: string;
  periodType: "mensal" | "semanal" | "estoque_inicial" | "movimentacao" | "geral";
  detectedSchoolName: string | null;
  detectedReferenceDate: string | null;
  sheets: string[];
  selectedSheet: string;
  columnMappings: ColumnSemanticMatch[];
  mandatoryFields: string[];
  optionalFields: string[];
  formulas: DetectedFormula[];
  productRowsCount: number;
  secretariatPatternRecognized: boolean;
  summary: string;
}

const SYNONYM_PATTERNS: {
  key: SemanticFieldKey;
  label: string;
  mandatory: boolean;
  patterns: RegExp[];
}[] = [
  {
    key: "produto",
    label: "Produto / Gênero Alimentício",
    mandatory: true,
    patterns: [
      /\b(produto|produtos|descri[cç][aã]o|g[eê]nero|g[eê]neros|alimento|alimentos|item|itens|mercadoria|ingrediente|especifica[cç][aã]o)\b/i,
    ],
  },
  {
    key: "unidade",
    label: "Unidade de Medida",
    mandatory: true,
    patterns: [/\b(unid\.?|unidade|und\.?|medida|apresenta[cç][aã]o|emb\.?|embalagem)\b/i],
  },
  {
    key: "estoque_anterior",
    label: "Estoque Anterior / Saldo Inicial",
    mandatory: false,
    patterns: [
      /\b(estoque\s*anterior|est\.?\s*ant\.?|saldo\s*anterior|saldo\s*inicial|anterior|transporte)\b/i,
    ],
  },
  {
    key: "entrada",
    label: "Entrada / Quantidade Recebida",
    mandatory: false,
    patterns: [
      /\b(entrada|entradas|recebimento|recebido|recebida|qtd\.?\s*recebida|quant\.?\s*recebida|compra|aquisi[cç][aã]o)\b/i,
    ],
  },
  {
    key: "saida",
    label: "Saída / Consumo / Retirada",
    mandatory: false,
    patterns: [
      /\b(sa[ií]da|sa[ií]das|consumo|consumido|utilizado|utilizada|qtd\.?\s*utilizada|retirada|retirado|baixa|distribui[cç][aã]o)\b/i,
    ],
  },
  {
    key: "saldo",
    label: "Estoque Atual / Saldo Disponível",
    mandatory: true,
    patterns: [
      /\b(saldo|saldo\s*atual|saldo\s*final|estoque\s*atual|estoque\s*existente|qtd\.?\s*dispon[ií]vel|quantidade\s*dispon[ií]vel|quantidade\s*existente|restante|total\s*dispon[ií]vel|total\s*restante|quant\.?|qtd\.?|quantidade|estoque)\b/i,
    ],
  },
  {
    key: "origem",
    label: "Origem (Agricultura Familiar / Mercado)",
    mandatory: false,
    patterns: [/\b(origem|fonte|recurso|proced[eê]ncia|agricultura|mercado|pnae)\b/i],
  },
  {
    key: "categoria",
    label: "Categoria do Produto",
    mandatory: false,
    patterns: [/\b(categoria|grupo|tipo\s*de\s*alimento|classifica[cç][aã]o)\b/i],
  },
  {
    key: "validade",
    label: "Data de Validade / Vencimento",
    mandatory: false,
    patterns: [/\b(validade|vencimento|venc\.?|val\.?|data\s*de\s*validade|expira[cç][aã]o)\b/i],
  },
  {
    key: "lote",
    label: "Lote",
    mandatory: false,
    patterns: [/\b(lote|n[uú]mero\s*do\s*lote)\b/i],
  },
  {
    key: "fornecedor",
    label: "Fornecedor / Produtor",
    mandatory: false,
    patterns: [/\b(fornecedor|produtor|empresa|cooperativa)\b/i],
  },
  {
    key: "nota_fiscal",
    label: "Nota Fiscal / Documento",
    mandatory: false,
    patterns: [/\b(nota\s*fiscal|nf|n\.?f\.?|documento|guia|recibo|romaneio)\b/i],
  },
  {
    key: "responsavel",
    label: "Responsável",
    mandatory: false,
    patterns: [/\b(respons[aá]vel|recebedor|servidor|merendeira|assinatura)\b/i],
  },
  {
    key: "destino",
    label: "Finalidade / Destino",
    mandatory: false,
    patterns: [/\b(finalidade|destino|refei[cç][aã]o|uso|prepar[oa])\b/i],
  },
  {
    key: "escola",
    label: "Unidade Escolar",
    mandatory: false,
    patterns: [/\b(escola|unidade\s*escolar|u\.?e\.?|creche|cemei|emei|emef)\b/i],
  },
  {
    key: "data",
    label: "Data de Referência",
    mandatory: false,
    patterns: [/\b(data|per[ií]odo|refer[eê]ncia|dia|m[eê]s)\b/i],
  },
  {
    key: "observacoes",
    label: "Observações",
    mandatory: false,
    patterns: [/\b(obs\.?|observa[cç][oõ]es|nota|detalhe|ocorrencia)\b/i],
  },
];

export function detectColumnMapping(headers: string[]): ColumnSemanticMatch[] {
  return headers.map((raw, idx) => {
    const clean = raw.trim();
    for (const def of SYNONYM_PATTERNS) {
      if (def.patterns.some((rx) => rx.test(clean))) {
        return {
          columnIndex: idx,
          originalHeader: clean || `Coluna ${idx + 1}`,
          mappedField: def.key,
          fieldLabel: def.label,
          mandatory: def.mandatory,
          confidence: 0.94,
        };
      }
    }
    return {
      columnIndex: idx,
      originalHeader: clean || `Coluna ${idx + 1}`,
      mappedField: null,
      fieldLabel: "Campo complementar (preservado)",
      mandatory: false,
      confidence: 0.6,
    };
  });
}

export function interpretFormulaMeaning(formula: string): string {
  const f = formula.toUpperCase();
  if (f.includes("SUM") || f.includes("SOMA")) {
    return "Soma automática de quantidades da coluna/linha";
  }
  if (f.includes("+") && f.includes("-")) {
    return "Cálculo de saldo: Estoque Anterior + Entradas − Saídas";
  }
  if (f.includes("-")) {
    return "Diferença entre entradas/estoque e saídas/consumo";
  }
  if (f.includes("+")) {
    return "Totalização de Mercado + Agricultura Familiar ou entradas";
  }
  return "Fórmula de cálculo da planilha preservada";
}

export function parseSmartNumber(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val !== "string") return null;
  const s = val
    .trim()
    .replace(/\s+/g, "")
    .replace(/^(kg|l|un|und|pct|cx|fd)$/i, "");
  if (!s) return null;
  // Handle pt-BR numbers like "1.250,50" or "12,5" or "12.5"
  let normalized = s.replace(/[^\d.,-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === ",") return null;
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function parseSmartDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (br) {
    const day = br[1]!.padStart(2, "0");
    const month = br[2]!.padStart(2, "0");
    let year = br[3]!;
    if (year.length === 2) year = Number(year) > 50 ? `19${year}` : `20${year}`;
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

export function normalizeUnidadeApresentacao(raw: string): {
  apresentacao: UnidadeApresentacao | null;
  reconhecida: boolean;
} {
  const s = raw.trim().toLowerCase();
  if (!s) return { apresentacao: null, reconhecida: false };
  if (/^(kg|quilo|quilograma|quilos|kilo|kilos|g|gr|grama|gramas)$/.test(s)) {
    return { apresentacao: "kg", reconhecida: true };
  }
  if (/^(l|lt|litro|litros|ml|mililitro)$/.test(s)) {
    return { apresentacao: "L", reconhecida: true };
  }
  if (/^(un|und|unid|unidade|unidades|pç|peca|peça)$/.test(s)) {
    return { apresentacao: "un", reconhecida: true };
  }
  if (/^(pct|pacote|pacotes)$/.test(s)) {
    return { apresentacao: "pacote", reconhecida: true };
  }
  if (/^(cx|caixa|caixas)$/.test(s)) {
    return { apresentacao: "caixa", reconhecida: true };
  }
  if (/^(fd|fardo|fardos)$/.test(s)) {
    return { apresentacao: "fardo", reconhecida: true };
  }
  if (/^(lt|lata|latas)$/.test(s)) {
    return { apresentacao: "lata", reconhecida: true };
  }
  if (/^(sc|saco|sacos)$/.test(s)) {
    return { apresentacao: "saco", reconhecida: true };
  }
  if (/^(bdj|bandeja|bandejas)$/.test(s)) {
    return { apresentacao: "bandeja", reconhecida: true };
  }
  if (/^(gf|garrafa|garrafas)$/.test(s)) {
    return { apresentacao: "garrafa", reconhecida: true };
  }
  return { apresentacao: null, reconhecida: false };
}

export function normalizeOrigem(raw: string): Origem | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/agricultura|familiar|af|produtor\s*rural|cooperativa/i.test(s)) return "agricultura";
  if (/mercado|comercial|licitac|fornecedor|atacado|varejo/i.test(s)) return "mercado";
  return null;
}

export function inferCategoryByName(nome: string): string {
  const s = nome.toLowerCase();
  if (/arroz|feij[aã]o|macarr[aã]o|farinha|fub[aá]|aveia|milho|trigo|cereal|amפּido/i.test(s))
    return "Cereais";
  if (/carne|frango|peixe|bovina|su[ií]na|ovo|lingui[cç]a|músculo|ac[eé]m|fil[eé]/i.test(s))
    return "Carnes";
  if (/banana|ma[cç][aã]|laranja|melancia|mam[aã]o|abacaxi|manga|fruta|lim[aã]o|uva/i.test(s))
    return "Frutas";
  if (/alface|couve|cheiro[\s-]*verde|repolho|espinafre|r[uú]cula|verdura|salsa|cebolinha/i.test(s))
    return "Verduras";
  if (
    /batata|mandioca|aipim|cenoura|beterraba|ab[oó]bora|chuchu|tomate|cebola|alho|legume/i.test(s)
  )
    return "Legumes";
  if (/leite|queijo|iogurte|manteiga|requeij[aã]o|latic[ií]nio/i.test(s)) return "Laticínios";
  if (/p[aã]o|biscoito|bolacha|bolo|torrada/i.test(s)) return "Panificação";
  if (/suco|polpa|bebida|cacau|achocolatado/i.test(s)) return "Bebidas";
  if (/sal|a[cç][uú]car|[oó]leo|vinagre|colorau|tempero|extrato|molho|caf[eé]/i.test(s))
    return "Mercearia";
  return "Mercearia";
}

export function detectSchoolFromText(
  textAndFilename: string,
  escolas: { id: string; nome: string }[],
): { id: string; nome: string } | null {
  const normText = textAndFilename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const e of escolas) {
    const normSchool = e.nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (normSchool.length >= 3 && normText.includes(normSchool)) {
      return e;
    }
    // Also check meaningful tokens of school name
    const tokens = normSchool
      .split(/\s+/)
      .filter(
        (t) =>
          t.length > 3 &&
          !["escola", "municipal", "estadual", "unidade", "ensino", "creche"].includes(t),
      );
    if (tokens.length > 0 && tokens.every((t) => normText.includes(t))) {
      return e;
    }
  }
  return null;
}

export interface ExpirationItem {
  product_id: string;
  nome: string;
  unidade: string;
  validade: string;
  lote?: string;
  origem: Origem;
  saldoAtual: number;
  diasParaVencer: number;
  situacao: "vencido" | "proximo_vencimento" | "regular";
}

export interface DuplicateAlert {
  id1: string;
  id2: string;
  product_id: string;
  produtoNome: string;
  tipo: "entrada" | "saida";
  data: string;
  quantidade: number;
  origem: Origem;
  motivo: string;
}

export interface IncompleteFieldAlert {
  id: string;
  entidade: "entrada" | "saida" | "produto";
  titulo: string;
  data?: string;
  camposFaltantes: string[];
}

export interface WeeklyMonthlyComparisonItem {
  product_id: string;
  nome: string;
  unidade: string;
  entradasSemanas: number;
  entradasMensal: number;
  saidasSemanas: number;
  saidasMensal: number;
  saldoFinalSemanal: number;
  saldoFinalMensal: number;
  consistente: boolean;
  diferenca: number;
}

export interface SchoolConsumptionSummary {
  school_id: string;
  escolaNome: string;
  entradasMes: number;
  saidasMes: number;
  estoqueAtual: number;
  percAgriculturaFamiliar: number;
  itensConsumidos: number;
  resumoTexto: string;
}

export function computeExpirationAlerts(produtos: Produto[], movs: Movimento[]): ExpirationItem[] {
  const saldos = computeSaldos(movs);
  const todayMs = new Date(`${hoje()}T00:00:00`).getTime();
  const items: ExpirationItem[] = [];

  // Map latest validade/lote per product from product meta or movement observations
  const movValidadeMap = new Map<string, { validade: string; lote?: string; origem: Origem }>();
  for (const m of movs) {
    if (m.tipo !== "entrada") continue;
    const parsed = parseMovObservacoes(m.observacoes);
    if (parsed.validade) {
      movValidadeMap.set(m.product_id, {
        validade: parsed.validade,
        lote: parsed.lote,
        origem: m.origem,
      });
    }
  }

  for (const p of produtos) {
    const s = saldos.get(p.id);
    const saldoTotal = s?.total ?? 0;
    const movInfo = movValidadeMap.get(p.id);
    const validade = p.validade || movInfo?.validade;
    if (!validade) continue;

    const valMs = new Date(`${validade.slice(0, 10)}T00:00:00`).getTime();
    if (!Number.isFinite(valMs)) continue;
    const dias = Math.ceil((valMs - todayMs) / (1000 * 60 * 60 * 24));
    const situacao: ExpirationItem["situacao"] =
      dias < 0 ? "vencido" : dias <= 30 ? "proximo_vencimento" : "regular";

    items.push({
      product_id: p.id,
      nome: p.nome,
      unidade: p.unidade_apresentacao ?? p.unidade,
      validade: validade.slice(0, 10),
      lote: p.lote || movInfo?.lote,
      origem: movInfo?.origem ?? p.origem_padrao,
      saldoAtual: saldoTotal,
      diasParaVencer: dias,
      situacao,
    });
  }

  return items.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
}

export function detectDuplicateMovements(movs: Movimento[], produtos: Produto[]): DuplicateAlert[] {
  const pmap = new Map(produtos.map((p) => [p.id, p]));
  const alerts: DuplicateAlert[] = [];
  const seen = new Map<string, Movimento>();

  for (const m of movs) {
    if (isSaldoInicial(m)) continue;
    const key = `${m.school_id}|${m.product_id}|${m.tipo}|${m.data}|${m.quantidade}|${m.origem}`;
    const prev = seen.get(key);
    if (prev && prev.id !== m.id) {
      alerts.push({
        id1: prev.id,
        id2: m.id,
        product_id: m.product_id,
        produtoNome: pmap.get(m.product_id)?.nome ?? "Produto",
        tipo: m.tipo,
        data: m.data,
        quantidade: m.quantidade,
        origem: m.origem,
        motivo: `Dois lançamentos de ${m.tipo} no mesmo dia (${fmtData(m.data)}) com a mesma quantidade (${fmtQ(m.quantidade)}) e origem.`,
      });
    } else {
      seen.set(key, m);
    }
  }
  return alerts;
}

export function detectIncompleteFields(
  movs: Movimento[],
  produtos: Produto[],
): IncompleteFieldAlert[] {
  const pmap = new Map(produtos.map((p) => [p.id, p]));
  const alerts: IncompleteFieldAlert[] = [];

  for (const m of movs.slice(-100)) {
    if (isSaldoInicial(m)) continue;
    const pNome = pmap.get(m.product_id)?.nome ?? "Produto";
    if (m.tipo === "entrada") {
      const missing: string[] = [];
      if (!m.fornecedor?.trim()) missing.push("Fornecedor");
      if (!m.nota_fiscal?.trim()) missing.push("Nota fiscal / documento");
      if (!m.responsavel?.trim()) missing.push("Responsável pelo recebimento");
      if (missing.length > 0) {
        alerts.push({
          id: m.id,
          entidade: "entrada",
          titulo: `Entrada de ${pNome}`,
          data: m.data,
          camposFaltantes: missing,
        });
      }
    } else {
      const missing: string[] = [];
      if (!m.destino?.trim()) missing.push("Finalidade da saída");
      if (!m.responsavel?.trim()) missing.push("Responsável pela retirada");
      if (missing.length > 0) {
        alerts.push({
          id: m.id,
          entidade: "saida",
          titulo: `Saída de ${pNome}`,
          data: m.data,
          camposFaltantes: missing,
        });
      }
    }
  }

  for (const p of produtos) {
    if (!p.ativo) continue;
    const missing: string[] = [];
    if (!p.fornecedor?.trim()) missing.push("Fornecedor habitual");
    if (!p.validade?.trim()) missing.push("Data de validade de referência");
    if (p.estoque_minimo <= 0) missing.push("Estoque mínimo");
    if (missing.length > 0) {
      alerts.push({
        id: p.id,
        entidade: "produto",
        titulo: `Cadastro: ${p.nome}`,
        camposFaltantes: missing,
      });
    }
  }

  return alerts;
}

export function compareWeeklyAndMonthly(
  produtos: Produto[],
  movs: Movimento[],
  ano: number,
  mes: number,
): WeeklyMonthlyComparisonItem[] {
  const mensal = computeMensal(produtos, movs, ano, mes);
  const weeks = weekRangesOfMonth(ano, mes);
  const semanaisPorSemana = weeks.map((w) =>
    computeSemanal(produtos, movs, w.start, w.end, w.endInclusive),
  );

  return mensal.map((m) => {
    let entSemanas = 0;
    let saiSemanas = 0;
    let ultimoSaldoSemanal = m.ant_t;
    for (const sem of semanaisPorSemana) {
      const row = sem.find((x) => x.product_id === m.product_id);
      if (row) {
        entSemanas = Math.round((entSemanas + row.ent_t) * 1000) / 1000;
        saiSemanas = Math.round((saiSemanas + row.sai_t) * 1000) / 1000;
        ultimoSaldoSemanal = row.fim_t;
      }
    }
    const diff = Math.round(Math.abs(ultimoSaldoSemanal - m.fim_t) * 1000) / 1000;
    return {
      product_id: m.product_id,
      nome: m.nome,
      unidade: m.unidade,
      entradasSemanas: entSemanas,
      entradasMensal: m.ent_t,
      saidasSemanas: saiSemanas,
      saidasMensal: m.sai_t,
      saldoFinalSemanal: ultimoSaldoSemanal,
      saldoFinalMensal: m.fim_t,
      consistente:
        diff < 0.001 &&
        Math.abs(entSemanas - m.ent_t) < 0.001 &&
        Math.abs(saiSemanas - m.sai_t) < 0.001,
      diferenca: diff,
    };
  });
}

export function generateConsumptionSummaryBySchool(
  escolas: { id: string; nome: string }[],
  movsBySchool: Map<string, Movimento[]>,
  ano: number,
  mes: number,
): SchoolConsumptionSummary[] {
  const { start, end } = monthRange(ano, mes);
  return escolas.map((e) => {
    const ms = movsBySchool.get(e.id) ?? [];
    const saldos = computeSaldos(ms);
    let totalEstoque = 0;
    for (const s of saldos.values()) totalEstoque += s.total;

    let entMes = 0;
    let saiMes = 0;
    let entAgric = 0;
    let entTotal = 0;
    const prodsConsumidos = new Set<string>();

    for (const m of ms) {
      if (m.tipo === "entrada") {
        entTotal += m.quantidade;
        if (m.origem === "agricultura") entAgric += m.quantidade;
        if (m.data >= start && m.data < end && !isSaldoInicial(m)) {
          entMes += m.quantidade;
        }
      } else if (m.data >= start && m.data < end) {
        saiMes += m.quantidade;
        prodsConsumidos.add(m.product_id);
      }
    }

    const percAf = entTotal > 0 ? Math.round((entAgric / entTotal) * 100) : 0;
    const resumoTexto =
      saiMes > 0
        ? `Consumo de ${fmtQ(saiMes)} distribuídos em ${prodsConsumidos.size} gênero(s) no período; ${percAf}% de participação da Agricultura Familiar.`
        : totalEstoque > 0
          ? `Estoque ativo (${fmtQ(totalEstoque)}) sem baixas de consumo registradas no mês selecionado.`
          : `Unidade sem movimentações registradas no período.`;

    return {
      school_id: e.id,
      escolaNome: e.nome,
      entradasMes: Math.round(entMes * 1000) / 1000,
      saidasMes: Math.round(saiMes * 1000) / 1000,
      estoqueAtual: Math.round(totalEstoque * 1000) / 1000,
      percAgriculturaFamiliar: percAf,
      itensConsumidos: prodsConsumidos.size,
      resumoTexto,
    };
  });
}
