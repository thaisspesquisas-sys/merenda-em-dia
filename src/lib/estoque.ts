export type Origem = "mercado" | "agricultura";
export type Unidade = "kg" | "L" | "un";
export type UnidadeApresentacao =
  "kg" | "L" | "un" | "pacote" | "caixa" | "fardo" | "lata" | "saco" | "bandeja" | "garrafa";

export interface ProdutoMeta {
  unidade_apresentacao?: UnidadeApresentacao;
  fornecedor?: string;
  validade?: string; // YYYY-MM-DD
  lote?: string;
  observacoes?: string;
}

export interface Produto {
  id: string;
  nome: string;
  unidade: Unidade;
  categoria: string;
  origem_padrao: Origem;
  ativo: boolean;
  estoque_minimo: number;
  unidade_apresentacao?: UnidadeApresentacao;
  fornecedor?: string | null;
  validade?: string | null;
  lote?: string | null;
  observacoes?: string | null;
}

export interface Movimento {
  id: string;
  school_id: string;
  product_id: string;
  tipo: "entrada" | "saida";
  data: string; // YYYY-MM-DD
  quantidade: number;
  origem: Origem;
  fornecedor?: string | null;
  nota_fiscal?: string | null;
  destino?: string | null;
  responsavel?: string | null;
  observacoes?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface LinhaMensal {
  product_id: string;
  nome: string;
  unidade: string;
  ant_m: number;
  ant_a: number;
  ant_t: number;
  ent_m: number;
  ent_a: number;
  ent_t: number;
  sai_m: number;
  sai_a: number;
  sai_t: number;
  fim_m: number;
  fim_a: number;
  fim_t: number;
}

export interface LinhaSemanal extends LinhaMensal {
  semana_inicio: string;
  semana_fim: string;
}

export interface Saldo {
  product_id: string;
  mercado: number;
  agricultura: number;
  total: number;
}

export const SALDO_INICIAL_TAG = "SALDO INICIAL IMPORTADO";

export function isSaldoInicial(
  m: Pick<Movimento, "nota_fiscal" | "destino" | "fornecedor" | "observacoes">,
): boolean {
  const nf = (m.nota_fiscal ?? "").toUpperCase();
  const dest = (m.destino ?? "").toUpperCase();
  const forn = (m.fornecedor ?? "").toUpperCase();
  const obs = (m.observacoes ?? "").toUpperCase();
  return (
    nf.includes("SALDO INICIAL") ||
    nf === "SALDO_INICIAL_IMPORTADO" ||
    dest === "SALDO_INICIAL" ||
    forn.includes("SALDO INICIAL IMPORTADO") ||
    obs.includes("[SALDO_INICIAL_IMPORTADO]")
  );
}

const PRODUCT_META_STORAGE_KEY = "merenda_product_meta_v1";

export function getAllProductMeta(): Record<string, ProdutoMeta> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PRODUCT_META_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ProdutoMeta>;
  } catch {
    return {};
  }
}

export function getProductMeta(productId: string): ProdutoMeta {
  return getAllProductMeta()[productId] ?? {};
}

export function setProductMeta(productId: string, meta: ProdutoMeta) {
  if (typeof window === "undefined") return;
  try {
    const all = getAllProductMeta();
    all[productId] = { ...all[productId], ...meta };
    window.localStorage.setItem(PRODUCT_META_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

export function enrichProduto(p: Produto): Produto {
  const meta = getProductMeta(p.id);
  return {
    ...p,
    unidade_apresentacao: meta.unidade_apresentacao ?? p.unidade_apresentacao ?? p.unidade,
    fornecedor: meta.fornecedor ?? p.fornecedor ?? null,
    validade: meta.validade ?? p.validade ?? null,
    lote: meta.lote ?? p.lote ?? null,
    observacoes: meta.observacoes ?? p.observacoes ?? null,
  };
}

export function mapToDbUnidade(u: string): Unidade {
  const norm = u.trim().toLowerCase();
  if (
    norm === "kg" ||
    norm.startsWith("quil") ||
    norm === "quilo" ||
    norm === "grama" ||
    norm === "g"
  )
    return "kg";
  if (norm === "l" || norm.startsWith("litr")) return "L";
  return "un";
}

export function formatUnidade(p: Pick<Produto, "unidade" | "unidade_apresentacao">): string {
  const u = p.unidade_apresentacao ?? p.unidade;
  return UNIDADE_APRESENTACAO_LABEL[u] ?? (p.unidade === "un" ? "unidade" : p.unidade);
}

const r = (n: number) => Math.round(n * 1000) / 1000;
const pad = (n: number) => String(n).padStart(2, "0");

export function monthRange(ano: number, mes: number) {
  const start = `${ano}-${pad(mes)}-01`;
  const ny = mes === 12 ? ano + 1 : ano;
  const nm = mes === 12 ? 1 : mes + 1;
  const end = `${ny}-${pad(nm)}-01`;
  return { start, end };
}

export function weekRangesOfMonth(
  ano: number,
  mes: number,
): { label: string; start: string; end: string; endInclusive: string }[] {
  const daysInMonth = new Date(ano, mes, 0).getDate();
  const ranges: { label: string; start: string; end: string; endInclusive: string }[] = [];
  const splits = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, 28],
    ...(daysInMonth > 28 ? [[29, daysInMonth]] : []),
  ];
  splits.forEach(([d1, d2], idx) => {
    const start = `${ano}-${pad(mes)}-${pad(d1)}`;
    const endInclusive = `${ano}-${pad(mes)}-${pad(d2)}`;
    let nextDate: string;
    if (d2 < daysInMonth) {
      nextDate = `${ano}-${pad(mes)}-${pad(d2 + 1)}`;
    } else {
      const ny = mes === 12 ? ano + 1 : ano;
      const nm = mes === 12 ? 1 : mes + 1;
      nextDate = `${ny}-${pad(nm)}-01`;
    }
    ranges.push({
      label: `${idx + 1}ª Semana (${pad(d1)}/${pad(mes)} a ${pad(d2)}/${pad(mes)})`,
      start,
      end: nextDate,
      endInclusive,
    });
  });
  return ranges;
}

/** Saldos atuais (ou até uma data exclusiva) por produto e origem.
 * Fórmula: Estoque atual = Estoque anterior + Entradas - Saídas
 */
export function computeSaldos(movs: Movimento[], ateExclusive?: string): Map<string, Saldo> {
  const map = new Map<string, Saldo>();
  for (const m of movs) {
    if (ateExclusive && m.data >= ateExclusive) continue;
    const s = map.get(m.product_id) ?? {
      product_id: m.product_id,
      mercado: 0,
      agricultura: 0,
      total: 0,
    };
    const q = Number(m.quantidade) * (m.tipo === "entrada" ? 1 : -1);
    s[m.origem] = r(s[m.origem] + q);
    s.total = r(s.mercado + s.agricultura);
    map.set(m.product_id, s);
  }
  return map;
}

/** Planilha por período arbitrário [start, endExclusive): estoque anterior + entradas − saídas, separado por origem.
 * Lançamentos marcados como "Saldo Inicial Importado" dentro do período são contabilizados no Estoque Anterior
 * para evitar duplicidade com novas compras/entradas do período.
 */
export function computePeriodo(
  produtos: Produto[],
  movs: Movimento[],
  start: string,
  endExclusive: string,
): LinhaMensal[] {
  const rows = new Map<string, LinhaMensal>();
  for (const p of produtos) {
    rows.set(p.id, {
      product_id: p.id,
      nome: p.nome,
      unidade: p.unidade_apresentacao ?? p.unidade,
      ant_m: 0,
      ant_a: 0,
      ant_t: 0,
      ent_m: 0,
      ent_a: 0,
      ent_t: 0,
      sai_m: 0,
      sai_a: 0,
      sai_t: 0,
      fim_m: 0,
      fim_a: 0,
      fim_t: 0,
    });
  }
  for (const m of movs) {
    const row = rows.get(m.product_id);
    if (!row || m.data >= endExclusive) continue;
    const q = Number(m.quantidade);
    const o = m.origem === "mercado" ? "m" : "a";
    if (m.data < start || (m.tipo === "entrada" && isSaldoInicial(m))) {
      row[`ant_${o}`] = r(row[`ant_${o}`] + (m.tipo === "entrada" ? q : -q));
    } else if (m.tipo === "entrada") {
      row[`ent_${o}`] = r(row[`ent_${o}`] + q);
    } else {
      row[`sai_${o}`] = r(row[`sai_${o}`] + q);
    }
  }
  const out: LinhaMensal[] = [];
  for (const row of rows.values()) {
    row.ant_t = r(row.ant_m + row.ant_a);
    row.ent_t = r(row.ent_m + row.ent_a);
    row.sai_t = r(row.sai_m + row.sai_a);
    row.fim_m = r(row.ant_m + row.ent_m - row.sai_m);
    row.fim_a = r(row.ant_a + row.ent_a - row.sai_a);
    row.fim_t = r(row.fim_m + row.fim_a);
    if (row.ant_t || row.ent_t || row.sai_t) out.push(row);
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Planilha mensal: estoque anterior + entradas − saídas, separado por origem. */
export function computeMensal(
  produtos: Produto[],
  movs: Movimento[],
  ano: number,
  mes: number,
): LinhaMensal[] {
  const { start, end } = monthRange(ano, mes);
  return computePeriodo(produtos, movs, start, end);
}

/** Planilha semanal: estoque anterior + entradas − saídas na semana selecionada. */
export function computeSemanal(
  produtos: Produto[],
  movs: Movimento[],
  start: string,
  endExclusive: string,
  endInclusive?: string,
): LinhaSemanal[] {
  return computePeriodo(produtos, movs, start, endExclusive).map((l) => ({
    ...l,
    semana_inicio: start,
    semana_fim: endInclusive ?? endExclusive,
  }));
}

export const ORIGEM_LABEL: Record<Origem, string> = {
  mercado: "Mercado",
  agricultura: "Agricultura Familiar",
};

export const UNIDADE_LABEL: Record<Unidade, string> = { kg: "kg", L: "L", un: "unidade" };

export const UNIDADE_APRESENTACAO_LABEL: Record<UnidadeApresentacao, string> = {
  kg: "Quilo (kg)",
  L: "Litro (L)",
  un: "Unidade (un)",
  pacote: "Pacote (pct)",
  caixa: "Caixa (cx)",
  fardo: "Fardo",
  lata: "Lata",
  saco: "Saco",
  bandeja: "Bandeja",
  garrafa: "Garrafa",
};

export const UNIDADES_APRESENTACAO: UnidadeApresentacao[] = [
  "kg",
  "L",
  "un",
  "pacote",
  "caixa",
  "fardo",
  "lata",
  "saco",
  "bandeja",
  "garrafa",
];

export const CATEGORIAS = [
  "Cereais",
  "Carnes",
  "Frutas",
  "Verduras",
  "Legumes",
  "Laticínios",
  "Mercearia",
  "Panificação",
  "Bebidas",
  "Temperos e Condimentos",
  "Outros",
];

export const FINALIDADES_SAIDA = [
  "Preparação de Almoço",
  "Lanche da Manhã",
  "Lanche da Tarde",
  "Jantar / EJA",
  "Creche / Berçário",
  "Cardápio Especial / Restrição Alimentar",
  "Descarte por Avaria / Vencimento",
  "Outros",
];

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function fmtQ(n: number) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function fmtData(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Extrai metadados opcionais (validade, lote) salvos em observações estruturadas de entradas */
export function parseMovObservacoes(obs?: string | null): {
  texto: string;
  validade?: string;
  lote?: string;
  saldoInicial?: boolean;
} {
  if (!obs) return { texto: "" };
  const validadeMatch = obs.match(/\[VALIDADE:(\d{4}-\d{2}-\d{2})\]/i);
  const loteMatch = obs.match(/\[LOTE:([^\]]+)\]/i);
  const saldoInicial = /\[SALDO_INICIAL_IMPORTADO\]/i.test(obs);
  const texto = obs
    .replace(/\[VALIDADE:[^\]]+\]/gi, "")
    .replace(/\[LOTE:[^\]]+\]/gi, "")
    .replace(/\[SALDO_INICIAL_IMPORTADO\]/gi, "")
    .trim();
  return {
    texto,
    validade: validadeMatch?.[1],
    lote: loteMatch?.[1]?.trim(),
    saldoInicial,
  };
}

export function formatMovObservacoes(params: {
  texto?: string;
  validade?: string;
  lote?: string;
  saldoInicial?: boolean;
}): string {
  const tags: string[] = [];
  if (params.saldoInicial) tags.push("[SALDO_INICIAL_IMPORTADO]");
  if (params.lote?.trim()) tags.push(`[LOTE:${params.lote.trim()}]`);
  if (params.validade?.trim()) tags.push(`[VALIDADE:${params.validade.trim()}]`);
  if (params.texto?.trim()) tags.push(params.texto.trim());
  return tags.join(" ");
}
