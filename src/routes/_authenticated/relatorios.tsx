import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAllMovimentos,
  useApp,
  useFechamentos,
  useMovimentos,
  useProdutos,
} from "@/lib/app-context";
import {
  computeMensal,
  computeResumoEstoqueAnterior,
  computeSaldos,
  computeSemanal,
  fmtData,
  formatUnidade,
  isSaldoInicial,
  MESES,
  monthRange,
  ORIGEM_LABEL,
  parseMovObservacoes,
  weekRangesOfMonth,
  type LinhaMensal,
  type Movimento,
  type Origem,
} from "@/lib/estoque";
import { computeExpirationAlerts, generateConsumptionSummaryBySchool } from "@/lib/ai-intelligence";
import { parseBarcodeMovementMeta } from "@/lib/barcode";
import { COLS_MENSAL, rowsMensal } from "@/lib/report-cols";
import type { Cell } from "@/lib/export";
import { MesAno, NSelect, PageHeader, SemEscola } from "@/components/ui-kit";
import { DocView } from "@/components/DocView";

export const Route = createFileRoute("/_authenticated/relatorios")({
  beforeLoad: () => {
    throw redirect({ to: "/mapa-merenda-padua" });
  },
  head: () =>
    pageMeta(
      "Relatórios e Impressão",
      "Relatórios semanais, mensais, entradas, saídas, estoque atual, Agricultura Familiar, Mercado, consumo por escola e controle de validade.",
    ),
  component: Relatorios,
});

const TIPOS = {
  estoque_anterior: "Relatório de Estoque Anterior (Saldo Inicial / Abertura)",
  semanal: "Relatório semanal de merenda",
  mensal: "Relatório mensal de merenda",
  entradas: "Relatório de entradas (compras e recebimentos)",
  saidas: "Relatório de saídas (consumo)",
  disponiveis: "Relatório de estoque atual",
  agricultura: "Relatório de produtos da Agricultura Familiar",
  mercado: "Relatório de produtos adquiridos no Mercado",
  consumo_escola: "Relatório de consumo por unidade escolar",
  validade: "Relatório de produtos vencidos ou próximos do vencimento",
  saldo_inicial: "Relatório detalhado de lançamentos de Saldo Inicial",
  historico: "Histórico de movimentação por produto",
} as const;
type Tipo = keyof typeof TIPOS;

function Relatorios() {
  const { escola, escolas } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const allMovs = useAllMovimentos(true);
  const fechs = useFechamentos(escola?.id);
  const now = new Date();
  const [tipo, setTipo] = useState<Tipo>("mensal");
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [semanaIdx, setSemanaIdx] = useState(0);
  const [prodId, setProdId] = useState("");
  const [respFiltro, setRespFiltro] = useState("");
  const [tipoSaidaFiltro, setTipoSaidaFiltro] = useState("");
  const [origemMovFiltro, setOrigemMovFiltro] = useState<"todas" | "codigo_barras" | "manual">(
    "todas",
  );

  const weeks = useMemo(() => weekRangesOfMonth(ano, mes), [ano, mes]);
  const activeWeek = weeks[Math.min(semanaIdx, weeks.length - 1)] ?? weeks[0]!;

  const responsaveisLista = useMemo(() => {
    const s = new Set<string>();
    for (const m of movs.data ?? []) {
      if (m.responsavel?.trim()) s.add(m.responsavel.trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [movs.data]);

  const finalidadesLista = useMemo(() => {
    const s = new Set<string>();
    for (const m of movs.data ?? []) {
      if (m.tipo === "saida" && m.destino?.trim()) s.add(m.destino.trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [movs.data]);

  const rep = useMemo(() => {
    const ps = prods.data ?? [];
    const ms = movs.data ?? [];
    const pmap = new Map(ps.map((p) => [p.id, p]));
    const { start, end } = monthRange(ano, mes);
    const doMes = ms.filter((m) => m.data >= start && m.data < end);
    let columns: string[] = [];
    let rows: Cell[][] = [];

    if (tipo === "estoque_anterior") {
      const resumos = computeResumoEstoqueAnterior(ps, ms);
      columns = [
        "Nome dos Produtos",
        "Quantidade Inicial",
        "Unidade de Medida",
        "Qtd. Mercado",
        "Qtd. Agricultura Familiar",
        "Data do Levantamento",
        "Responsável pelo Lançamento",
      ];
      rows = resumos.map((r) => [
        r.nome,
        r.quantidade_inicial,
        r.unidade,
        r.quantidade_mercado,
        r.quantidade_agricultura,
        fmtData(r.data_levantamento),
        r.responsavel || escola?.responsavel || "—",
      ]);
    } else if (tipo === "mensal") {
      const f = (fechs.data ?? []).find((x) => x.ano === ano && x.mes === mes);
      const linhas = f ? (f.snapshot as LinhaMensal[]) : computeMensal(ps, ms, ano, mes);
      columns = COLS_MENSAL;
      rows = rowsMensal(linhas);
    } else if (tipo === "semanal") {
      const linhas = computeSemanal(
        ps,
        ms,
        activeWeek.start,
        activeWeek.end,
        activeWeek.endInclusive,
      );
      columns = COLS_MENSAL;
      rows = rowsMensal(linhas);
    } else if (tipo === "entradas") {
      columns = [
        "Data",
        "Produto",
        "Quantidade",
        "Unid.",
        "Origem",
        "Fornecedor",
        "NF / Doc.",
        "Responsável",
        "Observações",
      ];
      rows = doMes
        .filter((m) => m.tipo === "entrada" && !isSaldoInicial(m))
        .map((m) => {
          const p = pmap.get(m.product_id);
          return [
            fmtData(m.data),
            p?.nome ?? "",
            m.quantidade,
            p ? formatUnidade(p) : "",
            ORIGEM_LABEL[m.origem],
            m.fornecedor ?? "",
            m.nota_fiscal ?? "",
            m.responsavel ?? "",
            parseMovObservacoes(m.observacoes).texto,
          ];
        });
    } else if (tipo === "saidas") {
      columns = [
        "Data",
        "Produto",
        "Código de Barras",
        "Quantidade",
        "Unid.",
        "Origem Recurso",
        "Origem da Movimentação",
        "Finalidade",
        "Responsável",
        "Escola",
      ];
      rows = doMes
        .filter((m) => m.tipo === "saida")
        .filter((m) => !prodId || m.product_id === prodId)
        .filter((m) => !respFiltro || (m.responsavel ?? "") === respFiltro)
        .filter((m) => !tipoSaidaFiltro || (m.destino ?? "") === tipoSaidaFiltro)
        .filter((m) => {
          if (origemMovFiltro === "todas") return true;
          const meta = parseBarcodeMovementMeta(m);
          return origemMovFiltro === "codigo_barras" ? meta.isBarcodeExit : !meta.isBarcodeExit;
        })
        .map((m) => {
          const p = pmap.get(m.product_id);
          const meta = parseBarcodeMovementMeta(m);
          return [
            fmtData(m.data) + (meta.horario ? ` ${meta.horario}` : ""),
            p?.nome ?? "",
            meta.codigoBarras || p?.codigo_barras || "—",
            m.quantidade,
            p ? formatUnidade(p) : "",
            ORIGEM_LABEL[m.origem],
            meta.origemMovimentacaoLabel,
            m.destino ?? "",
            m.responsavel ?? "",
            escola?.nome ?? "",
          ];
        });
    } else if (tipo === "disponiveis") {
      const s = computeSaldos(ms, end);
      columns = [
        "Produto",
        "Categoria",
        "Unid.",
        "Mercado",
        "Agricultura Familiar",
        "Total disponível",
      ];
      rows = ps
        .filter((p) => (s.get(p.id)?.total ?? 0) > 0)
        .map((p) => {
          const x = s.get(p.id)!;
          return [p.nome, p.categoria, formatUnidade(p), x.mercado, x.agricultura, x.total];
        });
    } else if (tipo === "agricultura" || tipo === "mercado") {
      const o = tipo as Origem;
      const linhas = computeMensal(
        ps,
        ms.filter((m) => m.origem === o),
        ano,
        mes,
      );
      columns = [
        "Produto",
        "Unid.",
        "Estoque anterior",
        "Entradas do mês",
        "Saídas do mês",
        "Saldo final",
      ];
      rows = linhas.map((l) => [l.nome, l.unidade, l.ant_t, l.ent_t, l.sai_t, l.fim_t]);
    } else if (tipo === "consumo_escola") {
      const mapBySchool = new Map<string, Movimento[]>();
      for (const m of allMovs.data ?? ms) {
        const arr = mapBySchool.get(m.school_id) ?? [];
        arr.push(m);
        mapBySchool.set(m.school_id, arr);
      }
      const targetSchools = escolas.length > 0 ? escolas : escola ? [escola] : [];
      const summaries = generateConsumptionSummaryBySchool(targetSchools, mapBySchool, ano, mes);
      columns = [
        "Unidade Escolar",
        "Entradas no Mês",
        "Consumo / Saídas no Mês",
        "Estoque Atual",
        "Gêneros Utilizados",
        "% Agric. Familiar",
        "Resumo Analítico",
      ];
      rows = summaries.map((s) => [
        s.escolaNome,
        s.entradasMes,
        s.saidasMes,
        s.estoqueAtual,
        s.itensConsumidos,
        `${s.percAgriculturaFamiliar}%`,
        s.resumoTexto,
      ]);
    } else if (tipo === "validade") {
      const alerts = computeExpirationAlerts(ps, ms);
      columns = [
        "Produto",
        "Unid.",
        "Origem",
        "Lote",
        "Data de Validade",
        "Dias p/ Vencer",
        "Saldo em Estoque",
        "Situação",
      ];
      rows = alerts.map((a) => [
        a.nome,
        a.unidade,
        ORIGEM_LABEL[a.origem],
        a.lote ?? "—",
        fmtData(a.validade),
        a.diasParaVencer,
        a.saldoAtual,
        a.situacao === "vencido"
          ? "VENCIDO"
          : a.situacao === "proximo_vencimento"
            ? "PRÓXIMO DO VENCIMENTO"
            : "REGULAR",
      ]);
    } else if (tipo === "saldo_inicial") {
      columns = [
        "Data Referência",
        "Produto",
        "Quantidade",
        "Unid.",
        "Origem",
        "Responsável",
        "Lançamento",
      ];
      rows = ms
        .filter((m) => isSaldoInicial(m))
        .map((m) => {
          const p = pmap.get(m.product_id);
          return [
            fmtData(m.data),
            p?.nome ?? "",
            m.quantidade,
            p ? formatUnidade(p) : "",
            ORIGEM_LABEL[m.origem],
            m.responsavel ?? "",
            "Saldo Inicial Importado",
          ];
        });
    } else if (tipo === "historico") {
      columns = [
        "Data",
        "Tipo",
        "Origem",
        "Quantidade",
        "Saldo Mercado",
        "Saldo Agric. Fam.",
        "Saldo total",
        "Detalhe",
      ];
      if (prodId) {
        let sm = 0;
        let sa = 0;
        for (const m of ms.filter((x) => x.product_id === prodId && x.data < end)) {
          const q = m.tipo === "entrada" ? m.quantidade : -m.quantidade;
          if (m.origem === "mercado") sm += q;
          else sa += q;
          if (m.data >= start) {
            const meta = parseBarcodeMovementMeta(m);
            rows.push([
              fmtData(m.data) + (meta.horario ? ` ${meta.horario}` : ""),
              isSaldoInicial(m)
                ? "Saldo Inicial"
                : meta.isBarcodeExit
                  ? "Saída por código de barras"
                  : m.tipo === "entrada"
                    ? "Entrada"
                    : "Saída",
              ORIGEM_LABEL[m.origem],
              q,
              sm,
              sa,
              sm + sa,
              [
                meta.codigoBarras ? `EAN: ${meta.codigoBarras}` : "",
                m.responsavel ? `Resp.: ${m.responsavel}` : "",
                m.fornecedor,
                m.nota_fiscal,
                m.destino,
                meta.isBarcodeExit ? meta.textoLimpo : parseMovObservacoes(m.observacoes).texto,
              ]
                .filter(Boolean)
                .join(" · "),
            ]);
          }
        }
      }
    }
    return { columns, rows };
  }, [
    tipo,
    mes,
    ano,
    activeWeek,
    prodId,
    respFiltro,
    tipoSaidaFiltro,
    origemMovFiltro,
    prods.data,
    movs.data,
    allMovs.data,
    fechs.data,
    escola,
    escolas,
  ]);

  if (!escola)
    return (
      <>
        <PageHeader title="Relatórios e Impressão" />
        <SemEscola />
      </>
    );
  const prodNome = prods.data?.find((p) => p.id === prodId)?.nome;
  const periodoStr =
    tipo === "semanal" ? `${activeWeek.label} de ${MESES[mes - 1]}` : (MESES[mes - 1] ?? "");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Relatórios e Impressão"
        desc="Visualize e exporte relatórios oficiais da merenda escolar para Excel, PDF, Word e impressão A4"
      >
        <Button asChild size="sm">
          <Link to="/mapa-merenda-padua">
            <FileSpreadsheet className="h-4 w-4" /> Mapa Oficial PDF (4 Páginas Féis)
          </Link>
        </Button>
      </PageHeader>
      <div className="no-print flex flex-wrap gap-2">
        <NSelect value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} className="w-80">
          {Object.entries(TIPOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NSelect>
        <MesAno mes={mes} ano={ano} onMes={setMes} onAno={setAno} />
        {tipo === "semanal" && (
          <NSelect
            value={String(semanaIdx)}
            onChange={(e) => setSemanaIdx(Number(e.target.value))}
            className="w-60"
          >
            {weeks.map((w, idx) => (
              <option key={w.start} value={idx}>
                {w.label}
              </option>
            ))}
          </NSelect>
        )}
        {(tipo === "historico" || tipo === "saidas") && (
          <NSelect value={prodId} onChange={(e) => setProdId(e.target.value)} className="w-56">
            <option value="">
              {tipo === "historico" ? "Selecione o produto…" : "Todos os produtos"}
            </option>
            {(prods.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </NSelect>
        )}
        {tipo === "saidas" && (
          <>
            <NSelect
              value={respFiltro}
              onChange={(e) => setRespFiltro(e.target.value)}
              className="w-48"
            >
              <option value="">Todos os funcionários</option>
              {responsaveisLista.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NSelect>
            <NSelect
              value={tipoSaidaFiltro}
              onChange={(e) => setTipoSaidaFiltro(e.target.value)}
              className="w-48"
            >
              <option value="">Todos os tipos de saída</option>
              {finalidadesLista.map((fin) => (
                <option key={fin} value={fin}>
                  {fin}
                </option>
              ))}
            </NSelect>
            <NSelect
              value={origemMovFiltro}
              onChange={(e) =>
                setOrigemMovFiltro(e.target.value as "todas" | "codigo_barras" | "manual")
              }
              className="w-52"
            >
              <option value="todas">Todas as origens de mov.</option>
              <option value="codigo_barras">Saída por código de barras</option>
              <option value="manual">Lançamento manual</option>
            </NSelect>
          </>
        )}
      </div>
      <DocView
        info={{
          titulo: TIPOS[tipo] + (tipo === "historico" && prodNome ? ` — ${prodNome}` : ""),
          escola:
            tipo === "consumo_escola" ? "Rede Municipal de Ensino (Consolidado)" : escola.nome,
          mes: periodoStr,
          ano,
          responsavel: escola.responsavel ?? "",
        }}
        columns={rep.columns}
        rows={rep.rows}
        filename={`${tipo}-${ano}-${String(mes).padStart(2, "0")}`}
      />
    </div>
  );
}
