import { supabase } from "@/integrations/supabase/client";
import {
  computeMensal,
  computeSemanal,
  MESES,
  weekRangesOfMonth,
  type Escola,
  type Movimento,
  type Produto,
} from "./estoque";

/** Linha da Página 1 (Controle Semanal — 6 colunas) */
export interface LinhaPag1Semanal {
  genero: string;
  estoqueAnterior: number;
  entrada: number;
  estoqueAtual: number; // calculado: estoqueAnterior + entrada
  saida: number;
  estoqueFinal: number; // calculado: estoqueAtual - saida
}

/** Linha da tabela de Modalidade de Ensino na Página 2 */
export interface LinhaModalidadePag2 {
  modalidade: string;
  matricula: string;
  atendimento: string;
  totalRefeicoes: string;
}

/** Linha das Páginas 3 e 4 (Mapa Mensal por Origem — 11 colunas) */
export interface LinhaPag3e4Mensal {
  genero: string;
  antMercado: number;
  antAgric: number;
  entMercado: number;
  entAgric: number;
  estMercado: number; // calculado: antMercado + entMercado
  estAgric: number; // calculado: antAgric + entAgric
  saiMercado: number;
  saiAgric: number;
  fimMercado: number; // calculado: estMercado - saiMercado
  fimAgric: number; // calculado: estAgric - saiAgric
}

/** Estrutura completa das 4 páginas do Relatório Oficial (PDF de referência) */
export interface RelatorioOficialPaduaData {
  id: string;
  schoolId: string;
  schoolName: string;
  ano: number;
  mes: number;
  createdAt: string;
  updatedAt: string;
  emitidoPor: string;

  // cabeçalho institucional fixo do documento original
  prefeitura: string;
  estado: string;
  secretaria: string;
  departamento: string;

  // PÁGINA 1 — Controle Semanal
  pag1: {
    escolaCreche: string;
    numAlunos: string;
    mes: string;
    semana: string;
    dias: string;
    linhas: LinhaPag1Semanal[];
    observacoesLinha1: string;
    observacoesLinha2: string;
  };

  // PÁGINA 2 — Capa: MAPA DE CONTROLE DA MERENDA ESCOLAR - ESCOLAS
  pag2: {
    municipio: string;
    escola: string;
    endereco: string;
    email: string;
    mes: string;
    ano: string;
    diasLetivos: string;
    horarioIntegral: boolean;
    horarioParcial: boolean;
    turnoManha: boolean;
    turnoTarde: boolean;
    modalidades: LinhaModalidadePag2[];
    totalMatricula: string;
    totalAtendimento: string;
    totalRefeicoesServidas: string;
    numMerendeiras: string;
    cidadeData: string;
    diaData: string;
    mesData: string;
    anoData: string;
  };

  // PÁGINAS 3 E 4 — Planilha Mensal Mercado / Agricultura Familiar
  pag3e4: {
    escola: string;
    mes: string;
    diasLetivos: string;
    linhasPag3: LinhaPag3e4Mensal[]; // 19 gêneros exatos da Página 3
    linhasPag4: LinhaPag3e4Mensal[]; // 20 gêneros exatos da Página 4
    observacoes1: string;
    observacoes2: string;
    observacoes3: string;
  };
}

/** Os 43 gêneros exatos da Página 1 do PDF original, na mesma ordem e grafia */
export const GENEROS_PAGINA_1: readonly string[] = [
  "Abóbora Madura - kg",
  "Açúcar cristal - pct de 5kg",
  "Alface - und",
  "Alho - kg",
  "Arroz - pct de 5kg",
  "Aveia - pct120g",
  "Banana - kg",
  "Batata inglesa - kg",
  "Beterraba - kg",
  "Brócolis -und",
  "Biscoito de sal - 350g",
  "Biscoito doce -350g",
  "Carne bovina (músculo em pedaços) kg",
  "Carne bovina (patinho em pedaços) kg",
  "Carne suína (pernil em pedaços) kg",
  "Carne - peito de frango - kg",
  "Cebola - kg",
  "Cenoura - kg",
  "Cheiro verde - maço",
  "Chuchu - kg",
  "Colorau - pct de 500g",
  "Couve manteiga - maço",
  "Farinha de mandioca - kg",
  "Feijão - kg",
  "Fubá - 1kg",
  "Inhame - kg",
  "Iogurte de frutas - und",
  "Laranja Lima - kg",
  "Laranja Pera - kg",
  "Leite integral - 1L",
  "Maçã - kg",
  "Macarrão argolinha - pct de 500g",
  "Macarrão espaguete - pct de 500g",
  "Melancia -kg",
  "Mamão - kg",
  "Óleo - und",
  "Ovos - dz",
  "Pão Hot Dog- und",
  "Pimentão - kg",
  "Pó de café - pct de 250g",
  "Sal - kg",
  "Tomate kg",
  "Vinagre - und",
];

/** Os 19 gêneros exatos da Página 3 do PDF original, na mesma ordem e grafia */
export const GENEROS_PAGINA_3: readonly string[] = [
  "Abóbora madura - kg",
  "Açúcar cristal - kg",
  "Alho - kg",
  "Arroz - kg",
  "Alface - und",
  "Banana - kg",
  "Batata inglesa - kg",
  "Biscoito doce - pct de 400g",
  "Biscoito salgado - pct de 400g",
  "Brócolis",
  "Cacau em pó - pct de 500g",
  "Carne bovina (patinho) picada - kg",
  "Carne suína - kg",
  "Cebola - kg",
  "Cenoura - kg",
  "Cheiro verde - kg",
  "Chuchu - kg",
  "Colorau - pct de 500g",
  "Couve - molho",
];

/** Os 20 gêneros exatos da Página 4 do PDF original, na mesma ordem e grafia */
export const GENEROS_PAGINA_4: readonly string[] = [
  "Farinha de mandioca - kg",
  "Feijão - kg",
  "Fubá - kg",
  "Inhame - kg",
  "Iogurte - und",
  "Laranja - kg",
  "Leite tipo C - embalagem de 1 litro",
  "Maçã - kg",
  "Macarrão espaguete - pct de 500g",
  "Macarrão padre nosso - pct de 500g",
  "Mandioca - kg",
  "Óleo - und",
  "Ovos - dz",
  "Pão - und",
  "Peito de frango - kg",
  "Pó de café - pct de 250g",
  "Pimentão - kg",
  "Sal - kg",
  "Tomate - kg",
  "Vinagre - und",
];

const r = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Recalcula automaticamente as colunas de Estoque Atual e Estoque Final na Página 1 */
export function recalcLinhaPag1(l: LinhaPag1Semanal): LinhaPag1Semanal {
  const ant = r(l.estoqueAnterior);
  const ent = r(l.entrada);
  const sai = r(l.saida);
  const atual = r(ant + ent);
  const fim = r(atual - sai);
  return {
    ...l,
    estoqueAnterior: ant,
    entrada: ent,
    estoqueAtual: atual,
    saida: sai,
    estoqueFinal: fim,
  };
}

/** Recalcula automaticamente as colunas de Estoque e Estoque Final (Mercado e Agric. Fam.) nas Páginas 3 e 4 */
export function recalcLinhaPag3e4(l: LinhaPag3e4Mensal): LinhaPag3e4Mensal {
  const antM = r(l.antMercado);
  const antA = r(l.antAgric);
  const entM = r(l.entMercado);
  const entA = r(l.entAgric);
  const estM = r(antM + entM);
  const estA = r(antA + entA);
  const saiM = r(l.saiMercado);
  const saiA = r(l.saiAgric);
  const fimM = r(estM - saiM);
  const fimA = r(estA - saiA);
  return {
    ...l,
    antMercado: antM,
    antAgric: antA,
    entMercado: entM,
    entAgric: entA,
    estMercado: estM,
    estAgric: estA,
    saiMercado: saiM,
    saiAgric: saiA,
    fimMercado: fimM,
    fimAgric: fimA,
  };
}

/** Cria uma versão em branco do relatório de 4 páginas respeitando rigorosamente o modelo original */
export function criarRelatorioPaduaEmBranco(params: {
  escola?: Escola | null;
  ano: number;
  mes: number;
  emitidoPor?: string;
}): RelatorioOficialPaduaData {
  const mesNome = MESES[params.mes - 1] ?? "Outubro";
  const nowIso = new Date().toISOString();
  const hojeDate = new Date();
  const escolaNome = params.escola?.nome ?? "";

  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `padua-${Date.now()}`,
    schoolId: params.escola?.id ?? "global",
    schoolName: escolaNome,
    ano: params.ano,
    mes: params.mes,
    createdAt: nowIso,
    updatedAt: nowIso,
    emitidoPor: params.emitidoPor || params.escola?.responsavel || "",

    prefeitura: "Prefeitura Municipal de Santo Antônio de Pádua",
    estado: "Estado do Rio de Janeiro",
    secretaria: "Secretaria Municipal de Educação",
    departamento: "Departamento de Alimentação Escolar",

    pag1: {
      escolaCreche: escolaNome,
      numAlunos: "",
      mes: mesNome,
      semana: `01 até 07/${String(params.mes).padStart(2, "0")}/${params.ano}`,
      dias: "01,02,03,04 E 05",
      linhas: GENEROS_PAGINA_1.map((genero) =>
        recalcLinhaPag1({
          genero,
          estoqueAnterior: 0,
          entrada: 0,
          estoqueAtual: 0,
          saida: 0,
          estoqueFinal: 0,
        }),
      ),
      observacoesLinha1: "",
      observacoesLinha2: "",
    },

    pag2: {
      municipio: "Santo Antônio de Pádua - RJ",
      escola: escolaNome,
      endereco: params.escola?.endereco ?? "",
      email: "",
      mes: mesNome,
      ano: String(params.ano),
      diasLetivos: "21",
      horarioIntegral: false,
      horarioParcial: false,
      turnoManha: false,
      turnoTarde: false,
      modalidades: [
        {
          modalidade: "Educação Infantil",
          matricula: "..........................",
          atendimento: "..........................",
          totalRefeicoes: ".................................",
        },
        {
          modalidade: "Ensino Fundamental",
          matricula: "",
          atendimento: "",
          totalRefeicoes: "",
        },
        {
          modalidade: "Educação de Jovens e Adultos",
          matricula: "..........................",
          atendimento: "..........................",
          totalRefeicoes: ".................................",
        },
      ],
      totalMatricula: "",
      totalAtendimento: "",
      totalRefeicoesServidas: "",
      numMerendeiras: "",
      cidadeData: "Santo Antônio de Pádua",
      diaData: String(hojeDate.getDate()).padStart(2, "0"),
      mesData: (MESES[hojeDate.getMonth()] ?? "novembro").toLowerCase(),
      anoData: String(hojeDate.getFullYear()),
    },

    pag3e4: {
      escola: escolaNome,
      mes: mesNome,
      diasLetivos: "21",
      linhasPag3: GENEROS_PAGINA_3.map((genero) =>
        recalcLinhaPag3e4({
          genero,
          antMercado: 0,
          antAgric: 0,
          entMercado: 0,
          entAgric: 0,
          estMercado: 0,
          estAgric: 0,
          saiMercado: 0,
          saiAgric: 0,
          fimMercado: 0,
          fimAgric: 0,
        }),
      ),
      linhasPag4: GENEROS_PAGINA_4.map((genero) =>
        recalcLinhaPag3e4({
          genero,
          antMercado: 0,
          antAgric: 0,
          entMercado: 0,
          entAgric: 0,
          estMercado: 0,
          estAgric: 0,
          saiMercado: 0,
          saiAgric: 0,
          fimMercado: 0,
          fimAgric: 0,
        }),
      ),
      observacoes1: "",
      observacoes2: "",
      observacoes3: "",
    },
  };
}

/** Cria uma reprodução 100% idêntica (com os mesmos valores numéricos e textos) ao PDF original anexado */
export function criarRelatorioPaduaValoresOriginaisPDF(
  escola?: Escola | null,
  emitidoPor?: string,
): RelatorioOficialPaduaData {
  const base = criarRelatorioPaduaEmBranco({
    escola,
    ano: 2026,
    mes: 10,
    emitidoPor,
  });

  // Valores exatos da Página 1 do PDF anexado: [estoqueAnterior, entrada, saida]
  const valsPag1: Record<string, [number, number, number]> = {
    "Açúcar cristal - pct de 5kg": [0, 60, 0],
    "Alface - und": [0, 20, 20],
    "Alho - kg": [12518, 12700, 8218],
    "Arroz - pct de 5kg": [115, 600, 16],
    "Banana - kg": [0, 58000, 58000],
    "Batata inglesa - kg": [0, 30, 30],
    "Brócolis -und": [0, 6, 6],
    "Biscoito doce -350g": [63, 0, 10],
    "Carne bovina (músculo em pedaços) kg": [-60, 0, 0],
    "Carne bovina (patinho em pedaços) kg": [554, 120, 0],
    "Carne suína (pernil em pedaços) kg": [289, 144, 92],
    "Carne - peito de frango - kg": [226, 0, 0],
    "Cebola - kg": [22000, 15400, 8000],
    "Cenoura - kg": [0, 8500, 8500],
    "Colorau - pct de 500g": [48, 0, 3],
    "Couve manteiga - maço": [0, 25, 25],
    "Farinha de mandioca - kg": [0, 24, 7],
    "Feijão - kg": [92, 120, 18],
    "Inhame - kg": [0, 20400, 0],
    "Iogurte de frutas - und": [200, 0, 200],
    "Laranja Lima - kg": [-1, 0, 0],
    "Laranja Pera - kg": [0, 40000, 40000],
    "Leite integral - 1L": [102, 90, 50],
    "Maçã - kg": [0, 30, 30],
    "Macarrão espaguete - pct de 500g": [108, 140, 28],
    "Óleo - und": [48, 80, 14],
    "Ovos - dz": [226, 0, 15],
    "Pão Hot Dog- und": [0, 600, 600],
    "Pimentão - kg": [4100, 0, 4100],
    "Pó de café - pct de 250g": [16, 36, 5],
    "Sal - kg": [4, 30, 5],
    "Tomate kg": [8000, 40000, 48000],
    "Vinagre - und": [17, 12, 1],
  };

  base.pag1 = {
    escolaCreche: "E.M. Deputado Armindo Marcílio Doutel de Andrade",
    numAlunos: "452",
    mes: "Outubro",
    semana: "05 até 09/10/2026",
    dias: "05,06,07,08 E 09",
    linhas: GENEROS_PAGINA_1.map((genero) => {
      const v = valsPag1[genero] ?? [0, 0, 0];
      return recalcLinhaPag1({
        genero,
        estoqueAnterior: v[0],
        entrada: v[1],
        estoqueAtual: v[0] + v[1],
        saida: v[2],
        estoqueFinal: v[0] + v[1] - v[2],
      });
    }),
    observacoesLinha1: "",
    observacoesLinha2: "",
  };

  base.pag2 = {
    municipio: "Santo Antônio de Pádua - RJ",
    escola: "E. M. Dep. Armindo Marcílio Doutel de Andrade",
    endereco: "Rua João Jazbick, S/Nº - Bairro 17",
    email: "deputadoarmindomarcilio@gmail.com",
    mes: "Outubro",
    ano: "2026",
    diasLetivos: "21",
    horarioIntegral: true,
    horarioParcial: false,
    turnoManha: true,
    turnoTarde: true,
    modalidades: [
      {
        modalidade: "Educação Infantil",
        matricula: "..........................",
        atendimento: "..........................",
        totalRefeicoes: ".................................",
      },
      {
        modalidade: "Ensino Fundamental",
        matricula: "454",
        atendimento: "414+410",
        totalRefeicoes: "8.694+8.610",
      },
      {
        modalidade: "Educação de Jovens e Adultos",
        matricula: "..........................",
        atendimento: "..........................",
        totalRefeicoes: ".................................",
      },
    ],
    totalMatricula: "454",
    totalAtendimento: "824",
    totalRefeicoesServidas: "17.304",
    numMerendeiras: "05",
    cidadeData: "Santo Antônio de Pádua",
    diaData: "03",
    mesData: "novembro",
    anoData: "2026",
  };

  // Valores exatos da Página 3: [antM, antA, entM, entA, saiM, saiA]
  const valsPag3: Record<string, [number, number, number, number, number, number]> = {
    "Açúcar cristal - kg": [0, 0, 60, 0, 9, 0],
    "Alho - kg": [0, 0, 0, 27000, 0, 27000],
    "Arroz - kg": [120, 0, 600, 0, 109, 0],
    "Alface - und": [0, 0, 40, 0, 40, 0],
    "Banana - kg": [0, 0, 0, 202.1, 0, 202.1],
    "Batata inglesa - kg": [0, 0, 90, 0, 90, 0],
    "Biscoito doce - pct de 400g": [111, 0, 68, 0, 25, 0],
    "Biscoito salgado - pct de 400g": [0, 0, 68, 0, 24, 0],
    Brócolis: [0, 0, 0, 17, 0, 17],
    "Carne bovina (patinho) picada - kg": [408, 0, 120, 0, 73, 0],
    "Carne suína - kg": [264.5, 0, 144, 0, 236.5, 0],
    "Cebola - kg": [0, 0, 0, 29200, 0, 29200],
    "Cenoura - kg": [0, 0, 0, 16.3, 0, 16.3],
    "Colorau - pct de 500g": [48, 0, 0, 0, 8, 0],
    "Couve - molho": [0, 0, 75, 0, 75, 0],
  };

  // Valores exatos da Página 4: [antM, antA, entM, entA, saiM, saiA]
  const valsPag4: Record<string, [number, number, number, number, number, number]> = {
    "Farinha de mandioca - kg": [0, 0, 24, 0, 20, 0],
    "Feijão - kg": [1, 0, 120, 0, 63, 0],
    "Inhame - kg": [0, 0, 0, 70.7, 0, 70.7],
    "Iogurte - und": [0, 0, 0, 800, 0, 800],
    "Laranja - kg": [0, 0, 0, 110.0, 0, 110.0],
    "Leite tipo C - embalagem de 1 litro": [175, 0, 90, 0, 188, 0],
    "Maçã - kg": [0, 0, 90, 0, 90, 0],
    "Macarrão espaguete - pct de 500g": [42, 0, 140, 0, 44, 0],
    "Óleo - und": [133, 0, 80, 0, 60, 0],
    "Ovos - dz": [192, 0, 84, 0, 62, 0],
    "Pão - und": [0, 0, 1800, 0, 1800, 0],
    "Peito de frango - kg": [110, 0, 180, 0, 56, 0],
    "Pó de café - pct de 250g": [13, 0, 36, 0, 19, 0],
    "Pimentão - kg": [0, 0, 0, 5.1, 0, 5.1],
    "Sal - kg": [0, 0, 30, 0, 20, 0],
    "Tomate - kg": [0, 0, 0, 95.1, 0, 95.1],
    "Vinagre - und": [18, 0, 12, 0, 2, 0],
  };

  base.pag3e4 = {
    escola:
      "E.M. Dep. Armindo Marcílio Doutel de Andrade-Escola Vocacionada Guarda Mirim Municipal",
    mes: "Outubro",
    diasLetivos: "21",
    linhasPag3: GENEROS_PAGINA_3.map((genero) => {
      const v = valsPag3[genero] ?? [0, 0, 0, 0, 0, 0];
      return recalcLinhaPag3e4({
        genero,
        antMercado: v[0],
        antAgric: v[1],
        entMercado: v[2],
        entAgric: v[3],
        estMercado: v[0] + v[2],
        estAgric: v[1] + v[3],
        saiMercado: v[4],
        saiAgric: v[5],
        fimMercado: v[0] + v[2] - v[4],
        fimAgric: v[1] + v[3] - v[5],
      });
    }),
    linhasPag4: GENEROS_PAGINA_4.map((genero) => {
      const v = valsPag4[genero] ?? [0, 0, 0, 0, 0, 0];
      return recalcLinhaPag3e4({
        genero,
        antMercado: v[0],
        antAgric: v[1],
        entMercado: v[2],
        entAgric: v[3],
        estMercado: v[0] + v[2],
        estAgric: v[1] + v[3],
        saiMercado: v[4],
        saiAgric: v[5],
        fimMercado: v[0] + v[2] - v[4],
        fimAgric: v[1] + v[3] - v[5],
      });
    }),
    observacoes1: "",
    observacoes2: "",
    observacoes3: "",
  };

  return base;
}

/** Normaliza nome de gênero alimentício para correspondência segura com produtos do banco */
function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(kg|und|un|pct|de|5kg|1kg|500g|400g|350g|250g|120g|1l|litro|maco|molho|dz)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Encontra produto correspondente no catálogo apenas quando há correspondência confiável */
export function matchProdutoConfiavel(generoLabel: string, produtos: Produto[]): Produto | null {
  const target = normKey(generoLabel);
  if (!target) return null;

  // 1. Correspondência exata do nome base
  for (const p of produtos) {
    const pk = normKey(p.nome);
    if (pk === target) return p;
  }

  // 2. Correspondência por prefixo principal inequívoco
  for (const p of produtos) {
    const pk = normKey(p.nome);
    if (!pk) continue;
    const targetWords = target.split(" ");
    const prodWords = pk.split(" ");
    if (targetWords[0] && prodWords[0] && targetWords[0] === prodWords[0]) {
      if (targetWords.length === 1 || pk.includes(target) || target.includes(pk)) {
        return p;
      }
    }
  }
  return null;
}

/** Preenche automaticamente um relatório a partir dos dados reais de estoque da escola para o mês/ano/semana selecionados,
 * sem inventar valores para gêneros sem movimentação ou correspondência.
 */
export function preencherRelatorioComEstoqueReal(params: {
  relatorioAtual: RelatorioOficialPaduaData;
  escola: Escola;
  produtos: Produto[];
  movimentos: Movimento[];
  ano: number;
  mes: number;
  semanaIdx?: number;
}): {
  relatorio: RelatorioOficialPaduaData;
  generosCorrespondidos: number;
} {
  const { relatorioAtual, escola, produtos, movimentos, ano, mes, semanaIdx = 0 } = params;
  const weeks = weekRangesOfMonth(ano, mes);
  const activeWeek = weeks[Math.min(semanaIdx, weeks.length - 1)] ?? weeks[0]!;

  const planilhaSemanal = computeSemanal(
    produtos,
    movimentos,
    activeWeek.start,
    activeWeek.end,
    activeWeek.endInclusive,
  );
  const mapSemanal = new Map(planilhaSemanal.map((l) => [l.product_id, l]));

  const planilhaMensal = computeMensal(produtos, movimentos, ano, mes);
  const mapMensal = new Map(planilhaMensal.map((l) => [l.product_id, l]));

  let correspondidos = 0;

  const novasLinhasPag1 = relatorioAtual.pag1.linhas.map((linha) => {
    const prod = matchProdutoConfiavel(linha.genero, produtos);
    if (!prod) return recalcLinhaPag1(linha);
    const sem = mapSemanal.get(prod.id);
    if (!sem) return recalcLinhaPag1({ ...linha, estoqueAnterior: 0, entrada: 0, saida: 0 });
    correspondidos++;
    return recalcLinhaPag1({
      genero: linha.genero,
      estoqueAnterior: sem.ant_t,
      entrada: sem.ent_t,
      estoqueAtual: sem.ant_t + sem.ent_t,
      saida: sem.sai_t,
      estoqueFinal: sem.fim_t,
    });
  });

  const preencherLinhaMensal = (linha: LinhaPag3e4Mensal): LinhaPag3e4Mensal => {
    const prod = matchProdutoConfiavel(linha.genero, produtos);
    if (!prod) return recalcLinhaPag3e4(linha);
    const men = mapMensal.get(prod.id);
    if (!men) {
      return recalcLinhaPag3e4({
        ...linha,
        antMercado: 0,
        antAgric: 0,
        entMercado: 0,
        entAgric: 0,
        saiMercado: 0,
        saiAgric: 0,
      });
    }
    correspondidos++;
    return recalcLinhaPag3e4({
      genero: linha.genero,
      antMercado: men.ant_m,
      antAgric: men.ant_a,
      entMercado: men.ent_m,
      entAgric: men.ent_a,
      estMercado: men.ant_m + men.ent_m,
      estAgric: men.ant_a + men.ent_a,
      saiMercado: men.sai_m,
      saiAgric: men.sai_a,
      fimMercado: men.fim_m,
      fimAgric: men.fim_a,
    });
  };

  const mesNome = MESES[mes - 1] ?? "Outubro";
  const d1 = activeWeek.start.slice(8, 10);
  const d2 = activeWeek.endInclusive.slice(8, 10);

  return {
    generosCorrespondidos: correspondidos,
    relatorio: {
      ...relatorioAtual,
      schoolId: escola.id,
      schoolName: escola.nome,
      ano,
      mes,
      updatedAt: new Date().toISOString(),
      pag1: {
        ...relatorioAtual.pag1,
        escolaCreche: escola.nome,
        mes: mesNome,
        semana: `${d1} até ${d2}/${String(mes).padStart(2, "0")}/${ano}`,
        linhas: novasLinhasPag1,
      },
      pag2: {
        ...relatorioAtual.pag2,
        escola: escola.nome,
        endereco: escola.endereco || relatorioAtual.pag2.endereco,
        mes: mesNome,
        ano: String(ano),
      },
      pag3e4: {
        ...relatorioAtual.pag3e4,
        escola: escola.nome,
        mes: mesNome,
        linhasPag3: relatorioAtual.pag3e4.linhasPag3.map(preencherLinhaMensal),
        linhasPag4: relatorioAtual.pag3e4.linhasPag4.map(preencherLinhaMensal),
      },
    },
  };
}

// ============================================================================
// ARMAZENAMENTO E HISTÓRICO DE EMISSÃO POR ESCOLA
// ============================================================================

const STORAGE_KEY = "merenda_relatorios_oficiais_padua_v1";

export function listarRelatoriosPaduaSalvos(schoolId?: string): RelatorioOficialPaduaData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as RelatorioOficialPaduaData[]) : [];
    const filtered = schoolId ? list.filter((r) => r.schoolId === schoolId) : list;
    return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function salvarRelatorioPadua(
  relatorio: RelatorioOficialPaduaData,
): Promise<RelatorioOficialPaduaData> {
  const atualizado: RelatorioOficialPaduaData = {
    ...relatorio,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      const todos = listarRelatoriosPaduaSalvos();
      const idx = todos.findIndex((x) => x.id === atualizado.id);
      if (idx >= 0) {
        todos[idx] = atualizado;
      } else {
        todos.unshift(atualizado);
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos.slice(0, 100)));
    } catch {
      // ignore storage errors
    }
  }

  // Persiste também na tabela school_documents do Supabase vinculada à escola
  if (
    atualizado.schoolId &&
    atualizado.schoolId !== "global" &&
    (typeof navigator === "undefined" || navigator.onLine)
  ) {
    try {
      const docName = `Mapa Oficial Merenda (4 Páginas) - ${atualizado.pag2.mes}/${atualizado.pag2.ano}`;
      const { data: existing } = await supabase
        .from("school_documents")
        .select("id, revision")
        .eq("school_id", atualizado.schoolId)
        .eq("category", "relatorio_oficial_padua_4p")
        .eq("name", docName)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from("school_documents")
          .update({
            content: atualizado as unknown as Record<string, unknown>,
            responsible: atualizado.emitidoPor || "Responsável pela Merenda",
            revision: (existing.revision ?? 1) + 1,
            updated_at: atualizado.updatedAt,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("school_documents").insert({
          school_id: atualizado.schoolId,
          name: docName,
          category: "relatorio_oficial_padua_4p",
          responsible: atualizado.emitidoPor || "Responsável pela Merenda",
          reference_date: `${atualizado.ano}-${String(atualizado.mes).padStart(2, "0")}-01`,
          content: atualizado as unknown as Record<string, unknown>,
        });
      }
    } catch {
      // fallback local preservado
    }
  }

  return atualizado;
}
