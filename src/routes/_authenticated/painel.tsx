import { createFileRoute, Link } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  CheckCircle2,
  Package,
  Scale,
  ShoppingCart,
  Sparkles,
  Sprout,
  Upload,
} from "lucide-react";
import { useAllMovimentos, useApp, useMovimentos, useProdutos } from "@/lib/app-context";
import {
  computeSaldos,
  fmtData,
  fmtQ,
  formatUnidade,
  hoje,
  isSaldoInicial,
  MESES,
  monthRange,
  type Movimento,
} from "@/lib/estoque";
import {
  compareWeeklyAndMonthly,
  computeExpirationAlerts,
  detectDuplicateMovements,
  detectIncompleteFields,
  generateConsumptionSummaryBySchool,
} from "@/lib/ai-intelligence";
import { PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () =>
    pageMeta(
      "Painel de Controle",
      "Dashboard inteligente da merenda escolar com estoque total, entradas e saídas do mês, validade, consumo por escola e alertas de IA.",
    ),
  component: Painel,
});

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Package;
  tone: string;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={`rounded-lg p-2 ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 font-display text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Panel>
  );
}

function Painel() {
  const { escola, escolas } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const allMovs = useAllMovimentos(true);

  const d = useMemo(() => {
    const ps = prods.data ?? [];
    const ms = movs.data ?? [];
    const saldos = computeSaldos(ms);
    const h = hoje();
    const anoAtual = Number(h.slice(0, 4));
    const mesAtual = Number(h.slice(5, 7));
    const { start, end } = monthRange(anoAtual, mesAtual);

    let entMes = 0;
    let saiMes = 0;
    let saldoMercadoTotal = 0;
    let saldoAgricTotal = 0;

    for (const m of ms) {
      if (m.data >= start && m.data < end) {
        if (m.tipo === "entrada" && !isSaldoInicial(m)) entMes += m.quantidade;
        else if (m.tipo === "saida") saiMes += m.quantidade;
      }
    }

    const linhas = ps
      .filter((p) => p.ativo || saldos.get(p.id)?.total)
      .map((p) => {
        const s = saldos.get(p.id) ?? { product_id: p.id, mercado: 0, agricultura: 0, total: 0 };
        saldoMercadoTotal += Math.max(0, s.mercado);
        saldoAgricTotal += Math.max(0, s.agricultura);
        return { p, s };
      });

    const sem = linhas.filter((l) => l.s.total <= 0);
    const baixo = linhas.filter((l) => l.s.total > 0 && l.s.total <= l.p.estoque_minimo);
    const totalEst = linhas.reduce((a, l) => a + l.s.total, 0);

    const expAlerts = computeExpirationAlerts(ps, ms);
    const vencidosOuProximos = expAlerts.filter(
      (x) => x.situacao === "vencido" || x.situacao === "proximo_vencimento",
    );
    const duplicidades = detectDuplicateMovements(ms, ps);
    const incompletos = detectIncompleteFields(ms, ps);
    const compSemanalMensal = compareWeeklyAndMonthly(ps, ms, anoAtual, mesAtual);
    const divergenciasSemanalMensal = compSemanalMensal.filter((c) => !c.consistente);

    const mapBySchool = new Map<string, Movimento[]>();
    for (const m of allMovs.data ?? ms) {
      const list = mapBySchool.get(m.school_id) ?? [];
      list.push(m);
      mapBySchool.set(m.school_id, list);
    }
    const targetSchools = escolas.length > 0 ? escolas : escola ? [escola] : [];
    const consumoPorEscola = generateConsumptionSummaryBySchool(
      targetSchools,
      mapBySchool,
      anoAtual,
      mesAtual,
    );

    const percAgric = totalEst > 0 ? Math.round((saldoAgricTotal / totalEst) * 100) : 0;
    const percMerc = totalEst > 0 ? 100 - percAgric : 0;

    return {
      ps,
      linhas,
      sem,
      baixo,
      entMes,
      saiMes,
      totalEst,
      saldoMercadoTotal,
      saldoAgricTotal,
      percAgric,
      percMerc,
      vencidosOuProximos,
      duplicidades,
      incompletos,
      divergenciasSemanalMensal,
      consumoPorEscola,
      anoAtual,
      mesAtual,
    };
  }, [prods.data, movs.data, allMovs.data, escolas, escola]);

  if (!escola)
    return (
      <>
        <PageHeader title="Painel de Controle" />
        <SemEscola />
      </>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Painel de Controle da Merenda Escolar" desc={escola.nome}>
        <Button asChild variant="outline" size="sm">
          <Link to="/importar-estoque">
            <Upload className="h-4 w-4" /> Importar Estoque Existente
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/modelos">
            <Sparkles className="h-4 w-4" /> Importar Modelos e Documentos
          </Link>
        </Button>
      </PageHeader>

      {/* 10. PAINEL DE CONTROLE - Indicadores Principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Produtos cadastrados"
          value={String(d.ps.length)}
          sub={`${d.linhas.length} ativos na unidade`}
          icon={Package}
          tone="bg-secondary text-secondary-foreground"
        />
        <Stat
          label="Estoque total"
          value={fmtQ(d.totalEst)}
          sub="Saldo atual disponível"
          icon={Scale}
          tone="bg-saldo-soft text-saldo"
        />
        <Stat
          label="Entradas do mês"
          value={fmtQ(d.entMes)}
          sub={`${MESES[d.mesAtual - 1]}/${d.anoAtual}`}
          icon={ArrowDownToLine}
          tone="bg-entrada-soft text-entrada"
        />
        <Stat
          label="Saídas do mês"
          value={fmtQ(d.saiMes)}
          sub={`${MESES[d.mesAtual - 1]}/${d.anoAtual}`}
          icon={ArrowUpFromLine}
          tone="bg-saida-soft text-saida"
        />
        <Stat
          label="Estoque baixo"
          value={String(d.baixo.length)}
          sub={`${d.sem.length} sem estoque`}
          icon={AlertTriangle}
          tone="bg-warning-soft text-warning"
        />
        <Stat
          label="Próx. do vencimento"
          value={String(d.vencidosOuProximos.length)}
          sub="Em até 30 dias ou vencidos"
          icon={CalendarClock}
          tone="bg-saida-soft text-destructive"
        />
      </div>

      {/* Distribuição por Origem dos Produtos & Consumo por Escola */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold">
              Distribuição por Origem dos Produtos
            </h2>
            <span className="text-xs text-muted-foreground">Estoque disponível na unidade</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-agricultura-soft p-3 text-agricultura">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Sprout className="h-4 w-4" /> Agricultura Familiar
              </div>
              <div className="mt-1 text-xl font-bold">{fmtQ(d.saldoAgricTotal)}</div>
              <div className="text-xs opacity-80">{d.percAgric}% do estoque atual</div>
            </div>
            <div className="rounded-lg bg-mercado-soft p-3 text-mercado">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <ShoppingCart className="h-4 w-4" /> Mercado
              </div>
              <div className="mt-1 text-xl font-bold">{fmtQ(d.saldoMercadoTotal)}</div>
              <div className="text-xs opacity-80">{d.percMerc}% do estoque atual</div>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted flex">
            <div
              className="bg-agricultura transition-all"
              style={{ width: `${d.percAgric}%` }}
              title={`Agricultura Familiar: ${d.percAgric}%`}
            />
            <div
              className="bg-mercado transition-all"
              style={{ width: `${d.percMerc}%` }}
              title={`Mercado: ${d.percMerc}%`}
            />
          </div>
        </Panel>

        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold">
              Resumo Automático de Consumo por Escola ({MESES[d.mesAtual - 1]}/{d.anoAtual})
            </h2>
            <Button asChild variant="link" size="sm" className="h-auto p-0">
              <Link to="/relatorios">Ver relatório completo</Link>
            </Button>
          </div>
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1 text-xs">
            {d.consumoPorEscola.map((c) => (
              <div key={c.school_id} className="rounded-lg border p-2.5">
                <div className="flex items-center justify-between font-semibold">
                  <span>{c.escolaNome}</span>
                  <span className="text-saida">Saídas: {fmtQ(c.saidasMes)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{c.resumoTexto}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* 7. INTELIGÊNCIA E AUTOMAÇÃO — Diagnóstico da IA */}
      <Panel className="space-y-4 border-l-4 border-l-primary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-display text-base font-bold">
              Central de Inteligência e Automação (Conferência Humana)
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Monitoramento automático de estoque, validade, duplicidades e consistência
            semanal/mensal
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border p-3 text-xs">
            <div className="font-bold text-foreground">1. Estoque Baixo / Zerado</div>
            {d.baixo.length === 0 && d.sem.length === 0 ? (
              <p className="mt-1 flex items-center gap-1 text-entrada">
                <CheckCircle2 className="h-3.5 w-3.5" /> Todos os itens acima do estoque mínimo.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-muted-foreground">
                {d.baixo.slice(0, 4).map(({ p, s }) => (
                  <li key={p.id}>
                    • <b>{p.nome}</b>: saldo {fmtQ(s.total)} (mín. {fmtQ(p.estoque_minimo)})
                  </li>
                ))}
                {d.sem.slice(0, 3).map(({ p }) => (
                  <li key={p.id} className="text-destructive">
                    • <b>{p.nome}</b>: sem estoque disponível
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border p-3 text-xs">
            <div className="font-bold text-foreground">2. Alerta de Validade / Vencimento</div>
            {d.vencidosOuProximos.length === 0 ? (
              <p className="mt-1 flex items-center gap-1 text-entrada">
                <CheckCircle2 className="h-3.5 w-3.5" /> Nenhum produto vencido ou próximo do
                vencimento.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {d.vencidosOuProximos.slice(0, 5).map((v) => (
                  <li
                    key={v.product_id}
                    className={v.situacao === "vencido" ? "text-destructive" : "text-warning"}
                  >
                    • <b>{v.nome}</b>: {fmtData(v.validade)} (
                    {v.diasParaVencer < 0
                      ? `vencido há ${Math.abs(v.diasParaVencer)}d`
                      : `vence em ${v.diasParaVencer}d`}
                    )
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border p-3 text-xs">
            <div className="font-bold text-foreground">3. Duplicidades e Semanal × Mensal</div>
            {d.duplicidades.length === 0 && d.divergenciasSemanalMensal.length === 0 ? (
              <p className="mt-1 flex items-center gap-1 text-entrada">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sem lançamentos duplicados; controles
                semanais e mensais 100% consistentes.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-warning">
                {d.duplicidades.slice(0, 3).map((dup) => (
                  <li key={dup.id2}>
                    • Possível duplicata: {dup.produtoNome} ({fmtData(dup.data)})
                  </li>
                ))}
                {d.divergenciasSemanalMensal.slice(0, 3).map((div) => (
                  <li key={div.product_id}>• Divergência semanal/mensal: {div.nome}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border p-3 text-xs">
            <div className="font-bold text-foreground">4. Campos Não Preenchidos</div>
            {d.incompletos.length === 0 ? (
              <p className="mt-1 flex items-center gap-1 text-entrada">
                <CheckCircle2 className="h-3.5 w-3.5" /> Todos os cadastros e lançamentos estão
                completos.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-muted-foreground">
                {d.incompletos.slice(0, 4).map((inc) => (
                  <li key={`${inc.entidade}-${inc.id}`}>
                    • <b>{inc.titulo}</b>: falta {inc.camposFaltantes.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>

      {/* Tabela de Estoque Atual por Produto */}
      <Panel className="overflow-x-auto p-0 md:p-0">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-bold">Estoque Atual por Produto e Origem</h2>
          <p className="text-xs text-muted-foreground">
            Fórmula: Estoque atual = Estoque anterior (incluindo Saldo Inicial Importado) + Entradas
            − Saídas
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Produto</th>
              <th className="p-3">Categoria</th>
              <th className="p-3">Unidade</th>
              <th className="p-3">Validade</th>
              <th className="p-3 text-right text-mercado">Mercado</th>
              <th className="p-3 text-right text-agricultura">Agric. Familiar</th>
              <th className="p-3 text-right text-saldo">Total disponível</th>
            </tr>
          </thead>
          <tbody>
            {d.linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Nenhum produto cadastrado.
                </td>
              </tr>
            )}
            {d.linhas.map(({ p, s }) => (
              <tr key={p.id} className="border-t">
                <td className="p-3 font-medium">
                  {p.nome}
                  {s.total <= 0 && (
                    <span className="ml-2 rounded bg-saida-soft px-1.5 text-xs text-destructive">
                      sem estoque
                    </span>
                  )}
                  {s.total > 0 && s.total <= p.estoque_minimo && (
                    <span className="ml-2 rounded bg-warning-soft px-1.5 text-xs text-warning">
                      baixo
                    </span>
                  )}
                </td>
                <td className="p-3 text-xs text-muted-foreground">{p.categoria}</td>
                <td className="p-3">{formatUnidade(p)}</td>
                <td className="p-3 text-xs">{p.validade ? fmtData(p.validade) : "—"}</td>
                <td className="p-3 text-right tabular-nums">{fmtQ(s.mercado)}</td>
                <td className="p-3 text-right tabular-nums">{fmtQ(s.agricultura)}</td>
                <td className="p-3 text-right font-bold tabular-nums text-saldo">
                  {fmtQ(s.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
