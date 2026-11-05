import { describe, expect, it } from "vitest";
import {
  computeMensal,
  computeSaldos,
  computeSemanal,
  isSaldoInicial,
  SALDO_INICIAL_TAG,
  type Movimento,
  type Produto,
} from "./estoque";
import {
  compareWeeklyAndMonthly,
  detectColumnMapping,
  detectDuplicateMovements,
  normalizeUnidadeApresentacao,
  parseSmartDate,
  parseSmartNumber,
} from "./ai-intelligence";
import { evaluateStockRows } from "./stock-migration";

const arroz: Produto = {
  id: "p1",
  nome: "Arroz",
  unidade: "kg",
  categoria: "Cereais",
  origem_padrao: "mercado",
  ativo: true,
  estoque_minimo: 0,
};
const mv = (
  data: string,
  tipo: "entrada" | "saida",
  q: number,
  origem: "mercado" | "agricultura",
): Movimento => ({
  id: Math.random().toString(),
  school_id: "s",
  product_id: "p1",
  tipo,
  data,
  quantidade: q,
  origem,
});

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
    const l = computeMensal([arroz], movs, 2026, 10)[0]!;
    expect(l.ant_t).toBe(20);
    expect(l.ent_m).toBe(30);
    expect(l.ent_a).toBe(10);
    expect(l.sai_t).toBe(25);
    expect(l.fim_m).toBe(20);
    expect(l.fim_a).toBe(15);
    expect(l.fim_t).toBe(35);
  });

  it("saldo final de um mês vira estoque anterior do mês seguinte", () => {
    const out = computeMensal([arroz], movs, 2026, 10)[0]!;
    const nov = computeMensal([arroz], movs, 2026, 11)[0]!;
    expect(nov.ant_m).toBe(out.fim_m);
    expect(nov.ant_a).toBe(out.fim_a);
  });

  it("saldos atuais separados por origem", () => {
    const s = computeSaldos(movs).get("p1")!;
    expect(s.mercado).toBe(119);
    expect(s.agricultura).toBe(15);
  });

  it("trata Saldo Inicial Importado como estoque anterior sem duplicar novas compras", () => {
    const movsComSaldoInicial: Movimento[] = [
      {
        ...mv("2026-10-01", "entrada", 50, "mercado"),
        nota_fiscal: SALDO_INICIAL_TAG,
        destino: "SALDO_INICIAL",
      },
      mv("2026-10-05", "entrada", 20, "mercado"),
      mv("2026-10-12", "saida", 15, "mercado"),
    ];
    expect(isSaldoInicial(movsComSaldoInicial[0]!)).toBe(true);
    const l = computeMensal([arroz], movsComSaldoInicial, 2026, 10)[0]!;
    expect(l.ant_m).toBe(50);
    expect(l.ent_m).toBe(20);
    expect(l.sai_m).toBe(15);
    expect(l.fim_m).toBe(55);
  });

  it("calcula controle semanal e compara com controle mensal com 100% de consistência", () => {
    const sem1 = computeSemanal([arroz], movs, "2026-10-01", "2026-10-08", "2026-10-07")[0]!;
    expect(sem1.ant_t).toBe(20);
    expect(sem1.ent_t).toBe(40);
    expect(sem1.fim_t).toBe(60);

    const comp = compareWeeklyAndMonthly([arroz], movs, 2026, 10)[0]!;
    expect(comp.consistente).toBe(true);
    expect(comp.saldoFinalSemanal).toBe(comp.saldoFinalMensal);
  });
});

describe("inteligência artificial de documentos e migração de estoque", () => {
  it("reconhece sinônimos de colunas em diferentes modelos de planilhas", () => {
    const mappings = detectColumnMapping([
      "Descrição do Gênero",
      "Quantidade Disponível",
      "Unid.",
      "Recebimento",
      "Consumo",
      "Data de Validade",
    ]);
    expect(mappings[0]?.mappedField).toBe("produto");
    expect(mappings[1]?.mappedField).toBe("saldo");
    expect(mappings[2]?.mappedField).toBe("unidade");
    expect(mappings[3]?.mappedField).toBe("entrada");
    expect(mappings[4]?.mappedField).toBe("saida");
    expect(mappings[5]?.mappedField).toBe("validade");
  });

  it("interpreta números, datas e unidades sem inventar valores ausentes", () => {
    expect(parseSmartNumber("1.250,50")).toBe(1250.5);
    expect(parseSmartNumber("")).toBeNull();
    expect(parseSmartDate("15/08/2026")).toBe("2026-08-15");
    expect(normalizeUnidadeApresentacao("pacote").apresentacao).toBe("pacote");
    expect(normalizeUnidadeApresentacao("caixa").apresentacao).toBe("caixa");
  });

  it("detecta possíveis lançamentos duplicados e divergências na migração de estoque", () => {
    const m1 = mv("2026-10-02", "entrada", 30, "mercado");
    const m2 = mv("2026-10-02", "entrada", 30, "mercado");
    const dups = detectDuplicateMovements([m1, m2], [arroz]);
    expect(dups.length).toBe(1);

    const evaluated = evaluateStockRows(
      [
        {
          rowId: "r1",
          originalRowIndex: 1,
          selected: true,
          produtoNome: "Arroz",
          matchedProductId: "p1",
          quantidadeRaw: "40",
          quantidade: 40,
          unidadeRaw: "kg",
          unidade: "kg",
          unidadeReconhecida: true,
          categoria: "Cereais",
          origem: "mercado",
          origemInformada: true,
          lote: "",
          validade: "",
          fornecedor: "",
          estoqueSistemaAtual: 0,
          divergenciaValor: 0,
          issues: [],
          situacaoLabel: "",
          acaoDivergencia: "registrar_saldo_inicial",
        },
      ],
      [arroz],
      [m1],
    );
    expect(evaluated[0]?.issues).toContain("divergencia_estoque");
    expect(evaluated[0]?.estoqueSistemaAtual).toBe(30);
  });
});
