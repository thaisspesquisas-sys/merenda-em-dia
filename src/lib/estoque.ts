export type Origem = "mercado" | "agricultura";
export type Unidade = "kg" | "L" | "un";

export interface Produto {
  id: string;
  nome: string;
  unidade: Unidade;
  categoria: string;
  origem_padrao: Origem;
  ativo: boolean;
  estoque_minimo: number;
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
  created_at?: string;
}

export interface LinhaMensal {
  product_id: string;
  nome: string;
  unidade: Unidade;
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

export interface Saldo {
  product_id: string;
  mercado: number;
  agricultura: number;
  total: number;
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

/** Saldos atuais (ou até uma data exclusiva) por produto e origem. */
export function computeSaldos(movs: Movimento[], ateExclusive?: string): Map<string, Saldo> {
  const map = new Map<string, Saldo>();
  for (const m of movs) {
    if (ateExclusive && m.data >= ateExclusive) continue;
    const s = map.get(m.product_id) ?? { product_id: m.product_id, mercado: 0, agricultura: 0, total: 0 };
    const q = Number(m.quantidade) * (m.tipo === "entrada" ? 1 : -1);
    s[m.origem] = r(s[m.origem] + q);
    s.total = r(s.mercado + s.agricultura);
    map.set(m.product_id, s);
  }
  return map;
}

/** Planilha mensal: estoque anterior + entradas − saídas, separado por origem. */
export function computeMensal(produtos: Produto[], movs: Movimento[], ano: number, mes: number): LinhaMensal[] {
  const { start, end } = monthRange(ano, mes);
  const rows = new Map<string, LinhaMensal>();
  for (const p of produtos) {
    rows.set(p.id, {
      product_id: p.id, nome: p.nome, unidade: p.unidade,
      ant_m: 0, ant_a: 0, ant_t: 0, ent_m: 0, ent_a: 0, ent_t: 0,
      sai_m: 0, sai_a: 0, sai_t: 0, fim_m: 0, fim_a: 0, fim_t: 0,
    });
  }
  for (const m of movs) {
    const row = rows.get(m.product_id);
    if (!row || m.data >= end) continue;
    const q = Number(m.quantidade);
    const o = m.origem === "mercado" ? "m" : "a";
    if (m.data < start) {
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

export const ORIGEM_LABEL: Record<Origem, string> = {
  mercado: "Mercado",
  agricultura: "Agricultura Familiar",
};

export const UNIDADE_LABEL: Record<Unidade, string> = { kg: "kg", L: "L", un: "unidade" };

export const CATEGORIAS = [
  "Carnes", "Frutas", "Verduras", "Legumes", "Cereais", "Laticínios", "Mercearia", "Bebidas", "Outros",
];

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function fmtQ(n: number) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function fmtData(d: string) {
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

export function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
