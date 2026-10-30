import { describe, expect, it } from "vitest";
import { computeMensal, computeSaldos, type Movimento, type Produto } from "./estoque";

const arroz: Produto = { id: "p1", nome: "Arroz", unidade: "kg", categoria: "Cereais", origem_padrao: "mercado", ativo: true, estoque_minimo: 0 };
const mv = (data: string, tipo: "entrada" | "saida", q: number, origem: "mercado" | "agricultura"): Movimento =>
  ({ id: Math.random().toString(), school_id: "s", product_id: "p1", tipo, data, quantidade: q, origem });

describe("planilha mensal", () => {
  const movs = [
    mv("2026-09-05", "entrada", 15, "mercado"),
    mv("2026-09-06", "entrada", 5, "agricultura"),
    mv("2026-10-02", "entrada", 30, "mercado"),
    mv("2026-10-03", "entrada", 10, "agricultura"),
    mv("2026-10-10", "saida", 25, "mercado"),
    mv("2026-11-01", "entrada", 99, "mercado"),
  ];

  it("saldo final = estoque anterior + entradas − saídas, por origem", () => {
    const [l] = computeMensal([arroz], movs, 2026, 10);
    expect(l.ant_t).toBe(20);
    expect(l.ent_m).toBe(30);
    expect(l.ent_a).toBe(10);
    expect(l.sai_t).toBe(25);
    expect(l.fim_m).toBe(20);
    expect(l.fim_a).toBe(15);
    expect(l.fim_t).toBe(35);
  });

  it("saldo final de um mês vira estoque anterior do mês seguinte", () => {
    const [out] = computeMensal([arroz], movs, 2026, 10);
    const [nov] = computeMensal([arroz], movs, 2026, 11);
    expect(nov.ant_m).toBe(out.fim_m);
    expect(nov.ant_a).toBe(out.fim_a);
  });

  it("saldos atuais separados por origem", () => {
    const s = computeSaldos(movs).get("p1")!;
    expect(s.mercado).toBe(119);
    expect(s.agricultura).toBe(15);
  });
});
