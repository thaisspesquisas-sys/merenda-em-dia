import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, ArrowUpFromLine, Package, Scale, ShoppingCart, Sprout, XCircle } from "lucide-react";
import { useApp, useMovimentos, useProdutos } from "@/lib/app-context";
import { computeSaldos, fmtQ, hoje, monthRange } from "@/lib/estoque";
import { PageHeader, Panel, SemEscola } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({ meta: [{ title: "Painel — Gestão da Merenda Escolar" }] }),
  component: Painel,
});

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Package; tone: string }) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`rounded-lg p-2 ${tone}`}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-3 font-display text-2xl font-bold">{value}</div>
    </Panel>
  );
}

function Painel() {
  const { escola } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);

  const d = useMemo(() => {
    const ps = prods.data ?? [];
    const ms = movs.data ?? [];
    const saldos = computeSaldos(ms);
    const h = hoje();
    const { start, end } = monthRange(Number(h.slice(0, 4)), Number(h.slice(5, 7)));
    let recM = 0, recA = 0, saiMes = 0;
    for (const m of ms) {
      if (m.tipo === "entrada") m.origem === "mercado" ? (recM += m.quantidade) : (recA += m.quantidade);
      else if (m.data >= start && m.data < end) saiMes += m.quantidade;
    }
    const linhas = ps.filter((p) => p.ativo || saldos.get(p.id)?.total).map((p) => ({ p, s: saldos.get(p.id) ?? { mercado: 0, agricultura: 0, total: 0 } }));
    const sem = linhas.filter((l) => l.s.total <= 0);
    const baixo = linhas.filter((l) => l.s.total > 0 && l.s.total <= l.p.estoque_minimo);
    const totalEst = linhas.reduce((a, l) => a + l.s.total, 0);
    return { ps, linhas, sem, baixo, recM, recA, saiMes, totalEst };
  }, [prods.data, movs.data]);

  if (!escola) return <><PageHeader title="Painel" /><SemEscola /></>;

  return (
    <div>
      <PageHeader title="Estoque atual" desc={escola.nome} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Produtos cadastrados" value={String(d.ps.length)} icon={Package} tone="bg-secondary text-secondary-foreground" />
        <Stat label="Total em estoque" value={fmtQ(d.totalEst)} icon={Scale} tone="bg-saldo-soft text-saldo" />
        <Stat label="Recebido do mercado" value={fmtQ(d.recM)} icon={ShoppingCart} tone="bg-mercado-soft text-mercado" />
        <Stat label="Recebido da agric. familiar" value={fmtQ(d.recA)} icon={Sprout} tone="bg-agricultura-soft text-agricultura" />
        <Stat label="Saídas no mês" value={fmtQ(d.saiMes)} icon={ArrowUpFromLine} tone="bg-saida-soft text-saida" />
        <Stat label="Estoque baixo" value={String(d.baixo.length)} icon={AlertTriangle} tone="bg-warning-soft text-warning" />
        <Stat label="Sem estoque" value={String(d.sem.length)} icon={XCircle} tone="bg-saida-soft text-destructive" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Quantidades somam kg, L e unidades; consulte a tabela para valores por produto.</p>

      <Panel className="mt-6 overflow-x-auto p-0 md:p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Produto</th><th className="p-3">Unidade</th>
              <th className="p-3 text-right text-mercado">Mercado</th>
              <th className="p-3 text-right text-agricultura">Agric. Familiar</th>
              <th className="p-3 text-right text-saldo">Total disponível</th>
            </tr>
          </thead>
          <tbody>
            {d.linhas.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum produto cadastrado.</td></tr>}
            {d.linhas.map(({ p, s }) => (
              <tr key={p.id} className="border-t">
                <td className="p-3 font-medium">
                  {p.nome}
                  {s.total <= 0 && <span className="ml-2 rounded bg-saida-soft px-1.5 text-xs text-destructive">sem estoque</span>}
                  {s.total > 0 && s.total <= p.estoque_minimo && <span className="ml-2 rounded bg-warning-soft px-1.5 text-xs text-warning">baixo</span>}
                </td>
                <td className="p-3">{p.unidade}</td>
                <td className="p-3 text-right tabular-nums">{fmtQ(s.mercado)}</td>
                <td className="p-3 text-right tabular-nums">{fmtQ(s.agricultura)}</td>
                <td className="p-3 text-right font-bold tabular-nums text-saldo">{fmtQ(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
