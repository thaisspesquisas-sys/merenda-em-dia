import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useFechamentos, useMovimentos, useProdutos } from "@/lib/app-context";
import { computeMensal, fmtData, MESES, type LinhaMensal } from "@/lib/estoque";
import { COLS_MENSAL, rowsMensal } from "@/lib/report-cols";
import { MesAno, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { DocView } from "@/components/DocView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/fechamento")({
  head: () => ({ meta: [{ title: "Fechamento mensal — Gestão da Merenda Escolar" }] }),
  component: Fechamento,
});

function Fechamento() {
  const { escola, canWrite, isAdmin, nome } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const fechs = useFechamentos(escola?.id);
  const qc = useQueryClient();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [dlg, setDlg] = useState(false);
  const [resp, setResp] = useState(escola?.responsavel || nome);
  const [obs, setObs] = useState("");

  const fechado = (fechs.data ?? []).find((f) => f.ano === ano && f.mes === mes);
  const linhas: LinhaMensal[] = useMemo(() => {
    if (fechado) return fechado.snapshot as LinhaMensal[];
    return computeMensal(prods.data ?? [], movs.data ?? [], ano, mes);
  }, [fechado, prods.data, movs.data, ano, mes]);

  if (!escola) return <><PageHeader title="Fechamento mensal" /><SemEscola /></>;

  async function fechar() {
    const { error } = await supabase.from("monthly_closings").insert({
      school_id: escola!.id, ano, mes, responsavel: resp, observacoes: obs || null, snapshot: linhas as unknown as Json,
    });
    if (error) { toast.error(error.code === "23505" ? "Este mês já foi fechado." : errMsg(error)); return; }
    toast.success(`${MESES[mes - 1]}/${ano} fechado. Saldos transferidos para o mês seguinte.`);
    setDlg(false);
    qc.invalidateQueries({ queryKey: ["fechamentos"] });
  }

  async function reabrir() {
    if (!fechado || !confirm("Reabrir este mês para correção administrativa? A ação ficará registrada na auditoria.")) return;
    const { error } = await supabase.from("monthly_closings").delete().eq("id", fechado.id);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Mês reaberto para correção");
    qc.invalidateQueries({ queryKey: ["fechamentos"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Fechamento e planilha mensal" desc="Estoque anterior + entradas − saídas, separado por origem">
        <MesAno mes={mes} ano={ano} onMes={setMes} onAno={setAno} />
      </PageHeader>

      <Panel className="no-print flex flex-wrap items-center gap-3">
        {fechado ? (
          <>
            <Lock className="h-5 w-5 text-saldo" />
            <div className="mr-auto text-sm">
              <b>Mês fechado</b> em {fmtData(fechado.closed_at)} por {fechado.responsavel}. Os registros deste mês estão protegidos.
            </div>
            {isAdmin && <Button variant="outline" onClick={reabrir}><Unlock className="h-4 w-4" /> Reabrir (correção)</Button>}
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            <div className="mr-auto text-sm">Mês em aberto. Ao fechar, o saldo final passa a ser o estoque anterior do mês seguinte.</div>
            {canWrite && <Button onClick={() => setDlg(true)}>Fechar {MESES[mes - 1]}/{ano}</Button>}
          </>
        )}
      </Panel>

      <DocView
        info={{ titulo: "Controle mensal de estoque da merenda escolar", escola: escola.nome, mes: MESES[mes - 1] ?? "", ano, responsavel: fechado?.responsavel ?? escola.responsavel ?? "" }}
        columns={COLS_MENSAL}
        rows={rowsMensal(linhas)}
        filename={`fechamento-${ano}-${String(mes).padStart(2, "0")}`}
        observacoes={fechado?.observacoes ?? ""}
        dataFechamento={fechado ? fmtData(fechado.closed_at) : ""}
      />

      {(fechs.data ?? []).length > 0 && (
        <Panel className="no-print">
          <h2 className="mb-3 font-display text-lg font-bold">Fechamentos realizados</h2>
          <div className="flex flex-wrap gap-2">
            {fechs.data!.map((f) => (
              <button key={f.id} onClick={() => { setMes(f.mes); setAno(f.ano); }} className="rounded-lg border bg-saldo-soft px-3 py-1.5 text-sm font-medium text-saldo">
                {MESES[f.mes - 1]}/{f.ano}
              </button>
            ))}
          </div>
        </Panel>
      )}

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fechar {MESES[mes - 1]}/{ano}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Responsável pelo estoque</Label><Input value={resp} onChange={(e) => setResp(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">Após o fechamento, não será possível registrar ou excluir movimentações deste mês, salvo reabertura pelo administrador.</p>
            <Button onClick={fechar}>Confirmar fechamento</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
