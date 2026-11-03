import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useMovimentos, useProdutos } from "@/lib/app-context";
import { hoje, type Origem } from "@/lib/estoque";
import { NSelect, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { MovList } from "@/components/MovList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/entradas")({
  head: () => pageMeta("Entradas", "Registre os alimentos recebidos e preserve a origem de cada entrada no estoque escolar."),
  component: Entradas,
});

function Entradas() {
  const { escola, canWrite } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const qc = useQueryClient();
  const ativos = (prods.data ?? []).filter((p) => p.ativo);
  const [f, setF] = useState({ data: hoje(), product_id: "", quantidade: "", origem: "mercado" as Origem, fornecedor: "", nota_fiscal: "", observacoes: "" });
  const [busy, setBusy] = useState(false);
  const prod = ativos.find((p) => p.id === f.product_id);

  if (!escola) return <><PageHeader title="Entradas" /><SemEscola /></>;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(f.quantidade);
    if (!f.product_id || !(q > 0)) { toast.error("Informe produto e quantidade válida"); return; }
    setBusy(true);
    const { error } = await supabase.from("movements").insert({
      school_id: escola!.id, product_id: f.product_id, tipo: "entrada", data: f.data, quantidade: q, origem: f.origem,
      fornecedor: f.fornecedor || null, nota_fiscal: f.nota_fiscal || null, observacoes: f.observacoes || null,
    });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Entrada registrada e estoque atualizado");
    setF({ ...f, product_id: "", quantidade: "", fornecedor: "", nota_fiscal: "", observacoes: "" });
    qc.invalidateQueries({ queryKey: ["movimentos"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Entrada de alimentos" desc={`Recebimentos — ${escola.nome}`} />
      {canWrite && (
        <Panel className="border-l-4 border-l-entrada">
          <form onSubmit={salvar} className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-1.5"><Label>Data da entrada</Label><Input type="date" required value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
            <div className="grid gap-1.5 md:col-span-2"><Label>Produto</Label>
              <NSelect required value={f.product_id} onChange={(e) => { const p = ativos.find((x) => x.id === e.target.value); setF({ ...f, product_id: e.target.value, origem: p?.origem_padrao ?? f.origem }); }}>
                <option value="">Selecione…</option>
                {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </NSelect></div>
            <div className="grid gap-1.5"><Label>Quantidade recebida {prod && `(${prod.unidade})`}</Label><Input type="number" step="any" min="0" required value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Origem</Label>
              <NSelect value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value as Origem })}>
                <option value="mercado">Mercado</option><option value="agricultura">Agricultura Familiar</option>
              </NSelect></div>
            <div className="grid gap-1.5"><Label>Fornecedor (opcional)</Label><Input value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Nota fiscal / documento (opcional)</Label><Input value={f.nota_fiscal} onChange={(e) => setF({ ...f, nota_fiscal: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Unidade</Label><Input disabled value={prod ? prod.unidade : "—"} /></div>
            <div className="grid gap-1.5 md:col-span-3"><Label>Observações</Label><Textarea rows={1} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></div>
            <div className="flex items-end"><Button type="submit" disabled={busy} className="w-full bg-entrada hover:bg-entrada/90">Confirmar entrada</Button></div>
          </form>
        </Panel>
      )}
      <MovList tipo="entrada" movs={movs.data ?? []} produtos={prods.data ?? []} />
    </div>
  );
}
