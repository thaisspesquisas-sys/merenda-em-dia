import { beforeEach, describe, expect, it } from "vitest";
import {
  criarRelatorioPaduaEmBranco,
  criarRelatorioPaduaValoresOriginaisPDF,
  GENEROS_PAGINA_1,
  GENEROS_PAGINA_3,
  GENEROS_PAGINA_4,
  listarRelatoriosPaduaSalvos,
  preencherRelatorioComEstoqueReal,
  salvarRelatorioPadua,
} from "./padua-relatorio-oficial";
import type { Escola } from "./app-context";
import type { Movimento, Produto } from "./estoque";

const escolaTeste: Escola = {
  id: "escola-padua-1",
  nome: "E.M. Deputado Armindo Marcílio Doutel de Andrade",
  endereco: "Rua João Jazbick, S/Nº - Bairro 17",
  responsavel: "Getúlio Pereira da Silva",
  diretor: "Getúlio Pereira da Silva",
  ativo: true,
};

describe("Modelo Oficial PDF 4 Páginas — Prefeitura Municipal de Santo Antônio de Pádua", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("1. Gera versão em branco com todas as 4 páginas, títulos, cabeçalhos e quantidades exatas de linhas do PDF original", () => {
    const branco = criarRelatorioPaduaEmBranco({
      escola: escolaTeste,
      ano: 2026,
      mes: 10,
      emitidoPor: "Nutricionista RT",
    });

    expect(branco.prefeitura).toBe("Prefeitura Municipal de Santo Antônio de Pádua");
    expect(branco.estado).toBe("Estado do Rio de Janeiro");
    expect(branco.secretaria).toBe("Secretaria Municipal de Educação");
    expect(branco.departamento).toBe("Departamento de Alimentação Escolar");

    // Página 1: 43 gêneros exatos
    expect(branco.pag1.linhas.length).toBe(43);
    expect(branco.pag1.linhas[0]?.genero).toBe("Abóbora Madura - kg");
    expect(branco.pag1.linhas[42]?.genero).toBe("Vinagre - und");
    expect(branco.pag1.linhas.every((l) => l.estoqueFinal === 0)).toBe(true);

    // Página 2: 3 modalidades + Total
    expect(branco.pag2.modalidades.length).toBe(3);
    expect(branco.pag2.modalidades.map((m) => m.modalidade)).toEqual([
      "Educação Infantil",
      "Ensino Fundamental",
      "Educação de Jovens e Adultos",
    ]);

    // Página 3 (19 gêneros) e Página 4 (20 gêneros)
    expect(branco.pag3e4.linhasPag3.length).toBe(19);
    expect(branco.pag3e4.linhasPag4.length).toBe(20);
    expect(branco.pag3e4.linhasPag3[0]?.genero).toBe(GENEROS_PAGINA_3[0]);
    expect(branco.pag3e4.linhasPag4[19]?.genero).toBe(GENEROS_PAGINA_4[19]);
  });

  it("2. Reproduz com 100% de exatidão os valores e cálculos das 4 páginas do PDF original anexado (Outubro/2026)", () => {
    const orig = criarRelatorioPaduaValoresOriginaisPDF(escolaTeste);

    // Conferência Página 1 (Controle Semanal)
    expect(orig.pag1.numAlunos).toBe("452");
    expect(orig.pag1.semana).toBe("05 até 09/10/2026");
    expect(orig.pag1.dias).toBe("05,06,07,08 E 09");

    const alhoP1 = orig.pag1.linhas.find((l) => l.genero === "Alho - kg")!;
    expect(alhoP1.estoqueAnterior).toBe(12518);
    expect(alhoP1.entrada).toBe(12700);
    expect(alhoP1.estoqueAtual).toBe(25218);
    expect(alhoP1.saida).toBe(8218);
    expect(alhoP1.estoqueFinal).toBe(17000);

    const arrozP1 = orig.pag1.linhas.find((l) => l.genero === "Arroz - pct de 5kg")!;
    expect(arrozP1.estoqueAnterior).toBe(115);
    expect(arrozP1.entrada).toBe(600);
    expect(arrozP1.estoqueAtual).toBe(715);
    expect(arrozP1.saida).toBe(16);
    expect(arrozP1.estoqueFinal).toBe(699);

    // Conferência Página 2 (Capa / Refeições)
    expect(orig.pag2.horarioIntegral).toBe(true);
    expect(orig.pag2.turnoManha).toBe(true);
    expect(orig.pag2.turnoTarde).toBe(true);
    expect(orig.pag2.totalMatricula).toBe("454");
    expect(orig.pag2.totalAtendimento).toBe("824");
    expect(orig.pag2.totalRefeicoesServidas).toBe("17.304");
    expect(orig.pag2.numMerendeiras).toBe("05");

    // Conferência Página 3 (Mapa Mensal Parte 1)
    const arrozP3 = orig.pag3e4.linhasPag3.find((l) => l.genero === "Arroz - kg")!;
    expect(arrozP3.antMercado).toBe(120);
    expect(arrozP3.entMercado).toBe(600);
    expect(arrozP3.estMercado).toBe(720);
    expect(arrozP3.saiMercado).toBe(109);
    expect(arrozP3.fimMercado).toBe(611);

    // Conferência Página 4 (Mapa Mensal Parte 2)
    const feijaoP4 = orig.pag3e4.linhasPag4.find((l) => l.genero === "Feijão - kg")!;
    expect(feijaoP4.antMercado).toBe(1);
    expect(feijaoP4.entMercado).toBe(120);
    expect(feijaoP4.estMercado).toBe(121);
    expect(feijaoP4.saiMercado).toBe(63);
    expect(feijaoP4.fimMercado).toBe(58);
  });

  it("3. Preenche automaticamente a partir do estoque real da escola sem inventar valores para gêneros sem movimentação", async () => {
    const produtos: Produto[] = [
      {
        id: "p-arroz",
        nome: "Arroz",
        unidade: "kg",
        categoria: "Cereais",
        origem_padrao: "mercado",
        ativo: true,
        estoque_minimo: 10,
      },
      {
        id: "p-feijao",
        nome: "Feijão",
        unidade: "kg",
        categoria: "Cereais",
        origem_padrao: "agricultura",
        ativo: true,
        estoque_minimo: 10,
      },
    ];

    const movimentos: Movimento[] = [
      {
        id: "m1",
        school_id: escolaTeste.id,
        product_id: "p-arroz",
        tipo: "entrada",
        data: "2026-10-02",
        quantidade: 100,
        origem: "mercado",
      },
      {
        id: "m2",
        school_id: escolaTeste.id,
        product_id: "p-arroz",
        tipo: "saida",
        data: "2026-10-05",
        quantidade: 30,
        origem: "mercado",
      },
      {
        id: "m3",
        school_id: escolaTeste.id,
        product_id: "p-feijao",
        tipo: "entrada",
        data: "2026-10-03",
        quantidade: 50,
        origem: "agricultura",
      },
    ];

    const emBranco = criarRelatorioPaduaEmBranco({
      escola: escolaTeste,
      ano: 2026,
      mes: 10,
    });

    const { relatorio, generosCorrespondidos } = preencherRelatorioComEstoqueReal({
      relatorioAtual: emBranco,
      escola: escolaTeste,
      produtos,
      movimentos,
      ano: 2026,
      mes: 10,
      semanaIdx: 0,
    });

    expect(generosCorrespondidos).toBeGreaterThan(0);

    // Arroz na Página 3 deve refletir entrada 100, saída 30, saldo final 70 (Mercado)
    const arrozP3 = relatorio.pag3e4.linhasPag3.find((l) => l.genero === "Arroz - kg")!;
    expect(arrozP3.entMercado).toBe(100);
    expect(arrozP3.saiMercado).toBe(30);
    expect(arrozP3.fimMercado).toBe(70);

    // Feijão na Página 4 deve refletir entrada 50 em Agricultura Familiar
    const feijaoP4 = relatorio.pag3e4.linhasPag4.find((l) => l.genero === "Feijão - kg")!;
    expect(feijaoP4.entAgric).toBe(50);
    expect(feijaoP4.fimAgric).toBe(50);

    // Gênero sem correspondência (ex.: Abóbora) permanece zerado sem valores inventados
    const aboboraP1 = relatorio.pag1.linhas.find((l) => l.genero === GENEROS_PAGINA_1[0])!;
    expect(aboboraP1.estoqueFinal).toBe(0);

    // Salva no histórico da escola e consulta
    await salvarRelatorioPadua(relatorio);
    const salvos = listarRelatoriosPaduaSalvos(escolaTeste.id);
    expect(salvos.length).toBe(1);
    expect(salvos[0]?.schoolName).toBe(escolaTeste.nome);
  });
});
