import type { LinhaMensal } from "./estoque";
import type { Cell } from "./export";

export const COLS_MENSAL = [
  "Produto", "Unid.", "Est. ant. Mercado", "Est. ant. Agric. Fam.", "Total est. anterior",
  "Entrada Mercado", "Entrada Agric. Fam.", "Total entradas", "Saídas do mês",
  "Saldo final Mercado", "Saldo final Agric. Fam.", "Total restante",
];

export function rowsMensal(linhas: LinhaMensal[]): Cell[][] {
  return linhas.map((l) => [l.nome, l.unidade, l.ant_m, l.ant_a, l.ant_t, l.ent_m, l.ent_a, l.ent_t, l.sai_t, l.fim_m, l.fim_a, l.fim_t]);
}
