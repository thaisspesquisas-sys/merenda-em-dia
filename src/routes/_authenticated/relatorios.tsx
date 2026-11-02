import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp, useFechamentos, useMovimentos, useProdutos } from "@/lib/app-context";
import { computeMensal, computeSaldos, fmtData, MESES, monthRange, ORIGEM_LABEL, type LinhaMensal, type Origem } from "@/lib/estoque";
import { COLS_MENSAL, rowsMensal } from "@/lib/report-cols";
import type { Cell } from "@/lib/export";
import { MesAno, NSelect, PageHeader, SemEscola } from "@/components/ui-kit";
import { DocView } from "@/components/DocView";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Gestão da Merenda Escolar" }] }),
  component: Relatorios,
});

const TIPOS = {
  mensal: "Relatório mensal de estoque",
  entradas: "Relatório de entradas",
  saidas: "Relatório de saídas",
  disponiveis: "Relatório de produtos disponíveis",
  agricultura: "Produtos da Agricultura Familiar",
  mercado: "Produtos do Mercado",
  historico: "Histórico de movimentação por produto",
} as const;
type Tipo = keyof typeof TIPOS;

function Relatorios() {
  const { escola } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const fechs = useFechamentos(escola?.id);
  const now = new Date();
  const [tipo, setTipo] = useState<Tipo>("mensal");
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [prodId, setProdId] = useState("");

  const rep = useMemo(() => {
    const ps = prods.data ?? [];
    const ms = movs.data ?? [];
    const pmap = new Map(ps.map((p) => [p.id, p]));
    const { start, end } = monthRange(ano, mes);
    const doMes = ms.filter((m) => m.data >= start && m.data < end);
    let columns: string[] = [];
    let rows: Cell[][] = [];
    if (tipo === "mensal") {
      const f = (fechs.data ?? []).find((x) => x.ano === ano && x.mes === mes);
      const linhas = f ? (f.snapshot as LinhaMensal[]) : computeMensal(ps, ms, ano, mes);
      columns = COLS_MENSAL;
      rows = rowsMensal(linhas);
    } else if (tipo === "entradas" || tipo === "saidas") {
      const t = tipo === "entradas" ? "entrada" : "saida";
      columns = t === "entrada" ? ["Data", "Produto", "Quantidade", "Unid.", "Origem", "Fornecedor", "NF/Doc.", "Observações"] : ["Data", "Produto", "Quantidade", "Unid.", "Origem", "Destino", "Responsável", "Observações"];
      rows = doMes.filter((m) => m.tipo === t).map((m) => [
        fmtData(m.data), pmap.get(m.product_id)?.nome ?? "", m.quantidade, pmap.get(m.product_id)?.unidade ?? "", ORIGEM_LABEL[m.origem],
        (t === "entrada" ? m.fornecedor : m.destino) ?? "", (t === "entrada" ? m.nota_fiscal : m.responsavel) ?? "", m.observacoes ?? "",
      ]);
    } else if (tipo === "disponiveis") {
      const s = computeSaldos(ms, end);
      columns = ["Produto", "Unid.", "Mercado", "Agricultura Familiar", "Total disponível"];
      rows = ps.filter((p) => (s.get(p.id)?.total ?? 0) > 0).map((p) => { const x = s.get(p.id)!; return [p.nome, p.unidade, x.mercado, x.agricultura, x.total]; });
    } else if (tipo === "agricultura" || tipo === "mercado") {
      const o = tipo as Origem;
      const linhas = computeMensal(ps, ms.filter((m) => m.origem === o), ano, mes);
      columns = ["Produto", "Unid.", "Estoque anterior", "Entradas do mês", "Saídas do mês", "Saldo final"];
      rows = linhas.map((l) => [l.nome, l.unidade, l.ant_t, l.ent_t, l.sai_t, l.fim_t]);
    } else if (tipo === "historico") {
      columns = ["Data", "Tipo", "Origem", "Quantidade", "Saldo Mercado", "Saldo Agric. Fam.", "Saldo total", "Detalhe"];
      if (prodId) {
        let sm = 0, sa = 0;
        for (const m of ms.filter((x) => x.product_id === prodId && x.data < end)) {
          const q = m.tipo === "entrada" ? m.quantidade : -m.quantidade;
          if (m.origem === "mercado") sm += q; else sa += q;
          if (m.data >= start) rows.push([fmtData(m.data), m.tipo === "entrada" ? "Entrada" : "Saída", ORIGEM_LABEL[m.origem], q, sm, sa, sm + sa, [m.fornecedor, m.nota_fiscal, m.destino, m.observacoes].filter(Boolean).join(" · ")]);
        }
      }
    }
    return { columns, rows };
  }, [tipo, mes, ano, prodId, prods.data, movs.data, fechs.data]);

  if (!escola) return <><PageHeader title="Relatórios" /><SemEscola /></>;
  const prodNome = prods.data?.find((p) => p.id === prodId)?.nome;

  return (
    <div className="space-y-4">
      <PageHeader title="Relatórios" desc="Visualize, imprima em A4 ou exporte para PDF e Excel" />
      <div className="no-print flex flex-wrap gap-2">
        <NSelect value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} className="w-72">
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NSelect>
        <MesAno mes={mes} ano={ano} onMes={setMes} onAno={setAno} />
        {tipo === "historico" && (
          <NSelect value={prodId} onChange={(e) => setProdId(e.target.value)} className="w-56">
            <option value="">Selecione o produto…</option>
            {(prods.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </NSelect>
        )}
      </div>
      <DocView
        info={{ titulo: TIPOS[tipo] + (tipo === "historico" && prodNome ? ` — ${prodNome}` : ""), escola: escola.nome, mes: MESES[mes - 1] ?? "", ano, responsavel: escola.responsavel ?? "" }}
        columns={rep.columns}
        rows={rep.rows}
        filename={`${tipo}-${ano}-${String(mes).padStart(2, "0")}`}
      />
    </div>
  );
}
