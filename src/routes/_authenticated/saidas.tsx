import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useMovimentos, useProdutos } from "@/lib/app-context";
import { computeSaldos, fmtQ, hoje } from "@/lib/estoque";
import { NSelect, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { MovList } from "@/components/MovList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/saidas")({
  head: () => pageMeta("Saídas", "Registre o consumo de alimentos destinados à preparação da merenda escolar."),
  component: Saidas,
});

function Saidas() {
  const { escola, canWrite, nome } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const qc = useQueryClient();
  const saldos = useMemo(() => computeSaldos(movs.data ?? []), [movs.data]);
  const [f, setF] = useState({ data: hoje(), product_id: "", quantidade: "", origem: "auto", destino: "", responsavel: nome, observacoes: "" });
  const [busy, setBusy] = useState(false);
  const disponiveis = (prods.data ?? []).filter((p) => (saldos.get(p.id)?.total ?? 0) > 0);
  const prod = disponiveis.find((p) => p.id === f.product_id);
  const s = saldos.get(f.product_id) ?? { mercado: 0, agricultura: 0, total: 0 };
  const limite = f.origem === "mercado" ? s.mercado : f.origem === "agricultura" ? s.agricultura : s.total;
  const q = Number(f.quantidade);
  const excede = q > limite;

  if (!escola) return <><PageHeader title="Saídas" /><SemEscola /></>;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.product_id || !(q > 0)) { toast.error("Informe produto e quantidade válida"); return; }
    if (excede) { toast.error(`Quantidade superior ao disponível (${fmtQ(limite)})`); return; }
    setBusy(true);
    const { error } = await supabase.rpc("registrar_saida", {
      _school: escola!.id, _product: f.product_id, _data: f.data, _quantidade: q, _origem: f.origem,
      _destino: f.destino || "", _responsavel: f.responsavel || "", _observacoes: f.observacoes || "",
    });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(`Saída registrada. Saldo restante: ${fmtQ(s.total - q)} ${prod?.unidade ?? ""}`);
    setF({ ...f, product_id: "", quantidade: "", destino: "", observacoes: "" });
    qc.invalidateQueries({ queryKey: ["movimentos"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Saída de alimentos" desc={`Uso na preparação da merenda — ${escola.nome}`} />
      {canWrite && (
        <Panel className="border-l-4 border-l-saida">
          <form onSubmit={salvar} className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-1.5"><Label>Data da saída</Label><Input type="date" required value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
            <div className="grid gap-1.5 md:col-span-2"><Label>Produto</Label>
              <NSelect required value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}>
                <option value="">Selecione…</option>
                {disponiveis.map((p) => <option key={p.id} value={p.id}>{p.nome} — {fmtQ(saldos.get(p.id)!.total)} {p.unidade}</option>)}
              </NSelect></div>
            <div className="grid gap-1.5"><Label>Quantidade retirada {prod && `(${prod.unidade})`}</Label>
              <Input type="number" step="any" min="0" required value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} className={excede ? "border-destructive" : ""} /></div>
            <div className="grid gap-1.5"><Label>Origem da retirada</Label>
              <NSelect value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })}>
                <option value="auto">Automática (mercado primeiro)</option>
                <option value="mercado">Mercado</option>
                <option value="agricultura">Agricultura Familiar</option>
              </NSelect></div>
            <div className="grid gap-1.5"><Label>Destino / finalidade (opcional)</Label><Input value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value })} placeholder="Ex.: almoço" /></div>
            <div className="grid gap-1.5"><Label>Responsável pelo registro</Label><Input required value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Unidade</Label><Input disabled value={prod ? prod.unidade : "—"} /></div>
            <div className="grid gap-1.5 md:col-span-3"><Label>Observações</Label><Textarea rows={1} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></div>
            <div className="flex items-end"><Button type="submit" disabled={busy || excede} className="w-full bg-saida hover:bg-saida/90">Registrar saída</Button></div>
          </form>
          {prod && (
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-lg bg-mercado-soft px-3 py-1.5 text-mercado">Mercado: <b>{fmtQ(s.mercado)}</b></span>
              <span className="rounded-lg bg-agricultura-soft px-3 py-1.5 text-agricultura">Agric. Familiar: <b>{fmtQ(s.agricultura)}</b></span>
              <span className="rounded-lg bg-saldo-soft px-3 py-1.5 text-saldo">Saldo após saída: <b>{fmtQ(Math.max(0, s.total - (q || 0)))} {prod.unidade}</b></span>
              {excede && <span className="rounded-lg bg-saida-soft px-3 py-1.5 font-semibold text-destructive">Quantidade maior que o disponível</span>}
            </div>
          )}
        </Panel>
      )}
      <MovList tipo="saida" movs={movs.data ?? []} produtos={prods.data ?? []} />
    </div>
  );
}
