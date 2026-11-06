import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendar, CheckCircle2, Edit3, FileCheck2, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useFechamentos, useMovimentos, useProdutos } from "@/lib/app-context";
import {
  computeMensal,
  computeSemanal,
  fmtData,
  MESES,
  weekRangesOfMonth,
  type LinhaMensal,
} from "@/lib/estoque";
import { compareWeeklyAndMonthly } from "@/lib/ai-intelligence";
import { COLS_MENSAL, rowsMensal } from "@/lib/report-cols";
import { contentOf, emptyContent, type DocumentContent } from "@/lib/document-model";
import { exportDocument } from "@/lib/document-export";
import { MesAno, NSelect, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { DocView } from "@/components/DocView";
import { DocumentGrid } from "@/components/DocumentGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/fechamento")({
  beforeLoad: () => {
    throw redirect({ to: "/mapa-merenda-padua" });
  },
  head: () =>
    pageMeta(
      "Controle Semanal e Mensal",
      "Geração automática de controles semanais e mensais da merenda escolar, separados por Agricultura Familiar e Mercado.",
    ),
  component: Fechamento,
});

function Fechamento() {
  const { escola, canWrite, isAdmin, nome } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const fechs = useFechamentos(escola?.id);
  const qc = useQueryClient();
  const now = new Date();
  const [modo, setModo] = useState<"mensal" | "semanal" | "comparativo">("mensal");
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [semanaIdx, setSemanaIdx] = useState(0);
  const [dlg, setDlg] = useState(false);
  const [resp, setResp] = useState(escola?.responsavel || nome);
  const [obs, setObs] = useState("");
  const [editModal, setEditModal] = useState(false);
  const [editableDoc, setEditableDoc] = useState<DocumentContent>(emptyContent());

  const weeks = useMemo(() => weekRangesOfMonth(ano, mes), [ano, mes]);
  const activeWeek = weeks[Math.min(semanaIdx, weeks.length - 1)] ?? weeks[0]!;

  // Load approved official models to apply the administrator's standard template
  const officialModelsQ = useQuery({
    queryKey: ["official-models-control", escola?.id],
    enabled: !!escola,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_models")
        .select("*,model_versions(*)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const activeApprovedModel = useMemo(() => {
    const catTarget = modo === "semanal" ? "Planilha semanal" : "Planilha mensal";
    const models = officialModelsQ.data ?? [];
    const match =
      models.find(
        (m) =>
          !m.archived &&
          m.category === catTarget &&
          m.model_versions.some((v) => v.status === "aprovado"),
      ) ?? models.find((m) => !m.archived && m.model_versions.some((v) => v.status === "aprovado"));
    if (!match) return null;
    const versions = [...match.model_versions].sort((a, b) => b.version - a.version);
    const approved = versions.find((v) => v.status === "aprovado");
    return approved ? { model: match, version: approved } : null;
  }, [officialModelsQ.data, modo]);

  const fechado = (fechs.data ?? []).find((f) => f.ano === ano && f.mes === mes);

  const linhasMensais: LinhaMensal[] = useMemo(() => {
    if (fechado) return fechado.snapshot as LinhaMensal[];
    return computeMensal(prods.data ?? [], movs.data ?? [], ano, mes);
  }, [fechado, prods.data, movs.data, ano, mes]);

  const linhasSemanais: LinhaMensal[] = useMemo(() => {
    if (!activeWeek) return [];
    return computeSemanal(
      prods.data ?? [],
      movs.data ?? [],
      activeWeek.start,
      activeWeek.end,
      activeWeek.endInclusive,
    );
  }, [prods.data, movs.data, activeWeek]);

  const comparativoSemanalMensal = useMemo(
    () => compareWeeklyAndMonthly(prods.data ?? [], movs.data ?? [], ano, mes),
    [prods.data, movs.data, ano, mes],
  );

  const linhasAtivas = modo === "semanal" ? linhasSemanais : linhasMensais;

  if (!escola)
    return (
      <>
        <PageHeader title="Controle Semanal e Mensal" />
        <SemEscola />
      </>
    );

  async function fechar() {
    const { error } = await supabase.from("monthly_closings").insert({
      school_id: escola!.id,
      ano,
      mes,
      responsavel: resp,
      observacoes: obs || null,
      snapshot: linhasMensais as unknown as Json,
    });
    if (error) {
      toast.error(error.code === "23505" ? "Este mês já foi fechado." : errMsg(error));
      return;
    }
    toast.success(`${MESES[mes - 1]}/${ano} fechado. Saldos transferidos para o mês seguinte.`);
    setDlg(false);
    qc.invalidateQueries({ queryKey: ["fechamentos"] });
  }

  async function reabrir() {
    if (
      !fechado ||
      !confirm(
        "Reabrir este mês para correção administrativa? A ação ficará registrada na auditoria.",
      )
    )
      return;
    const { error } = await supabase.from("monthly_closings").delete().eq("id", fechado.id);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success("Mês reaberto para correção");
    qc.invalidateQueries({ queryKey: ["fechamentos"] });
  }

  function abrirEdicaoPersonalizada() {
    const base = activeApprovedModel
      ? contentOf(activeApprovedModel.version.content)
      : emptyContent();
    const periodoStr =
      modo === "semanal"
        ? `${activeWeek.label} — ${MESES[mes - 1]}/${ano}`
        : `${MESES[mes - 1]}/${ano}`;
    setEditableDoc({
      ...base,
      title:
        modo === "semanal"
          ? `Controle Semanal da Merenda Escolar — ${escola?.nome} (${periodoStr})`
          : `Controle Mensal da Merenda Escolar — ${escola?.nome} (${periodoStr})`,
      columns: COLS_MENSAL,
      rows: rowsMensal(linhasAtivas).map((r) => r.map(String)),
      notes: `Unidade Escolar: ${escola?.nome} | Período: ${periodoStr} | Responsável: ${escola?.responsavel || nome}`,
    });
    setEditModal(true);
  }

  async function salvarDocumentoEditado() {
    const { error } = await supabase.from("school_documents").insert({
      school_id: escola!.id,
      name: editableDoc.title,
      category: modo === "semanal" ? "Planilha semanal" : "Planilha mensal",
      version_id: activeApprovedModel?.version.id ?? null,
      reference_date:
        modo === "semanal" ? activeWeek.start : `${ano}-${String(mes).padStart(2, "0")}-01`,
      responsible: escola?.responsavel || nome,
      content: editableDoc as unknown as Json,
    });
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success("Controle salvo no histórico de documentos da unidade escolar!");
    setEditModal(false);
  }

  const periodoReferenciaLabel =
    modo === "semanal" ? `${activeWeek.label} de ${MESES[mes - 1]}` : (MESES[mes - 1] ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle Semanal e Mensal"
        desc="Geração automática com estoque anterior, entradas, saídas e saldo atualizado por Agricultura Familiar e Mercado"
      >
        <MesAno mes={mes} ano={ano} onMes={setMes} onAno={setAno} />
      </PageHeader>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={modo === "mensal" ? "default" : "outline"}
            onClick={() => setModo("mensal")}
          >
            <Calendar className="h-4 w-4" /> Controle Mensal
          </Button>
          <Button
            variant={modo === "semanal" ? "default" : "outline"}
            onClick={() => setModo("semanal")}
          >
            <Calendar className="h-4 w-4" /> Controle Semanal
          </Button>
          <Button
            variant={modo === "comparativo" ? "default" : "outline"}
            onClick={() => setModo("comparativo")}
          >
            <FileCheck2 className="h-4 w-4" /> Conferência Semanal × Mensal (IA)
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {modo === "semanal" && (
            <NSelect
              value={String(semanaIdx)}
              onChange={(e) => setSemanaIdx(Number(e.target.value))}
              className="w-64"
            >
              {weeks.map((w, idx) => (
                <option key={w.start} value={idx}>
                  {w.label}
                </option>
              ))}
            </NSelect>
          )}
          <Button variant="outline" onClick={abrirEdicaoPersonalizada}>
            <Edit3 className="h-4 w-4" /> Editar / Adaptar Modelo
          </Button>
          <Button asChild variant="outline">
            <Link to="/modelos">Modelos da Secretaria</Link>
          </Button>
        </div>
      </div>

      {activeApprovedModel && (
        <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-primary/5 px-4 py-2.5 text-xs">
          <span>
            <b>Modelo Padrão Ativo:</b> {activeApprovedModel.model.name} (v
            {activeApprovedModel.version.version} — aprovado pelo administrador)
          </span>
          <span className="text-muted-foreground">
            Fórmula aplicada: Estoque atual = Estoque anterior + Entradas − Saídas
          </span>
        </div>
      )}

      {modo === "mensal" && (
        <Panel className="no-print flex flex-wrap items-center gap-3">
          {fechado ? (
            <>
              <Lock className="h-5 w-5 text-saldo" />
              <div className="mr-auto text-sm">
                <b>Mês fechado</b> em {fmtData(fechado.closed_at)} por {fechado.responsavel}. Os
                registros deste mês estão protegidos.
              </div>
              {isAdmin && (
                <Button variant="outline" onClick={reabrir}>
                  <Unlock className="h-4 w-4" /> Reabrir (correção)
                </Button>
              )}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              <div className="mr-auto text-sm">
                Mês em aberto. Ao fechar, o saldo final passa a ser o estoque anterior do mês
                seguinte.
              </div>
              {canWrite && (
                <Button onClick={() => setDlg(true)}>
                  Fechar {MESES[mes - 1]}/{ano}
                </Button>
              )}
            </>
          )}
        </Panel>
      )}

      {modo === "comparativo" ? (
        <Panel className="overflow-x-auto p-0 md:p-0">
          <div className="border-b p-4">
            <h2 className="font-display text-lg font-bold">
              Comparação Automática entre Controles Semanais e Controle Mensal ({MESES[mes - 1]}/
              {ano})
            </h2>
            <p className="text-xs text-muted-foreground">
              A IA soma automaticamente as entradas e saídas das {weeks.length} semanas do mês e
              confere com o saldo consolidado mensal da unidade <b>{escola.nome}</b>.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Produto</th>
                <th className="p-3">Unid.</th>
                <th className="p-3 text-right">Entradas (Semanas)</th>
                <th className="p-3 text-right">Entradas (Mensal)</th>
                <th className="p-3 text-right">Saídas (Semanas)</th>
                <th className="p-3 text-right">Saídas (Mensal)</th>
                <th className="p-3 text-right">Saldo Final</th>
                <th className="p-3 text-center">Situação</th>
              </tr>
            </thead>
            <tbody>
              {comparativoSemanalMensal.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Sem movimentações registradas no período.
                  </td>
                </tr>
              )}
              {comparativoSemanalMensal.map((item) => (
                <tr key={item.product_id} className="border-t">
                  <td className="p-3 font-medium">{item.nome}</td>
                  <td className="p-3">{item.unidade}</td>
                  <td className="p-3 text-right tabular-nums">{item.entradasSemanas}</td>
                  <td className="p-3 text-right tabular-nums">{item.entradasMensal}</td>
                  <td className="p-3 text-right tabular-nums">{item.saidasSemanas}</td>
                  <td className="p-3 text-right tabular-nums">{item.saidasMensal}</td>
                  <td className="p-3 text-right font-bold tabular-nums text-saldo">
                    {item.saldoFinalMensal}
                  </td>
                  <td className="p-3 text-center">
                    {item.consistente ? (
                      <span className="rounded bg-entrada-soft px-2 py-0.5 text-xs font-semibold text-entrada">
                        100% Consistente
                      </span>
                    ) : (
                      <span className="rounded bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
                        Divergência ({item.diferenca})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : (
        <DocView
          info={{
            titulo:
              modo === "semanal"
                ? `Controle Semanal de Estoque da Merenda Escolar (${activeWeek.label})`
                : "Controle Mensal de Estoque da Merenda Escolar",
            escola: escola.nome,
            mes: periodoReferenciaLabel,
            ano,
            responsavel: fechado?.responsavel ?? escola.responsavel ?? "",
          }}
          columns={COLS_MENSAL}
          rows={rowsMensal(linhasAtivas)}
          filename={`${modo}-${ano}-${String(mes).padStart(2, "0")}${modo === "semanal" ? `-sem${semanaIdx + 1}` : ""}`}
          observacoes={fechado?.observacoes ?? ""}
          dataFechamento={fechado ? fmtData(fechado.closed_at) : ""}
        />
      )}

      {(fechs.data ?? []).length > 0 && (
        <Panel className="no-print">
          <h2 className="mb-3 font-display text-lg font-bold">Fechamentos mensais realizados</h2>
          <div className="flex flex-wrap gap-2">
            {fechs.data!.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setMes(f.mes);
                  setAno(f.ano);
                  setModo("mensal");
                }}
                className="rounded-lg border bg-saldo-soft px-3 py-1.5 text-sm font-medium text-saldo"
              >
                {MESES[f.mes - 1]}/{f.ano}
              </button>
            ))}
          </div>
        </Panel>
      )}

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Fechar {MESES[mes - 1]}/{ano}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Responsável pelo estoque</Label>
              <Input value={resp} onChange={(e) => setResp(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Observações</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Após o fechamento, não será possível registrar ou excluir movimentações deste mês,
              salvo reabertura pelo administrador.
            </p>
            <Button onClick={fechar}>Confirmar fechamento</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editModal} onOpenChange={setEditModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              Edição Manual do Modelo de Controle ({modo === "semanal" ? "Semanal" : "Mensal"})
            </DialogTitle>
          </DialogHeader>
          <DocumentGrid value={editableDoc} onChange={setEditableDoc} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void exportDocument(editableDoc, "pdf", `controle-${modo}-${ano}-${mes}`)
              }
            >
              Exportar PDF
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void exportDocument(editableDoc, "excel", `controle-${modo}-${ano}-${mes}`)
              }
            >
              Exportar Excel
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void exportDocument(editableDoc, "word", `controle-${modo}-${ano}-${mes}`)
              }
            >
              Exportar Word
            </Button>
            <Button onClick={() => void salvarDocumentoEditado()}>
              Salvar versão na unidade escolar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
