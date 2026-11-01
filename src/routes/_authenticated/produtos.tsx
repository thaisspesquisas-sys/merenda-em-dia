import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useProdutos } from "@/lib/app-context";
import { CATEGORIAS, ORIGEM_LABEL, type Produto } from "@/lib/estoque";
import { NSelect, PageHeader, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Gestão da Merenda Escolar" }] }),
  component: Produtos,
});

type Form = Omit<Produto, "id"> & { id?: string };
const vazio: Form = { nome: "", unidade: "kg", categoria: "Cereais", origem_padrao: "mercado", ativo: true, estoque_minimo: 0 };

function Produtos() {
  const { isAdmin } = useApp();
  const q = useProdutos();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const [un, setUn] = useState("");
  const [form, setForm] = useState<Form | null>(null);

  const lista = (q.data ?? []).filter(
    (p) => p.nome.toLowerCase().includes(busca.toLowerCase()) && (!cat || p.categoria === cat) && (!un || p.unidade === un),
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const { id, ...dados } = form;
    const r = id ? await supabase.from("products").update(dados).eq("id", id) : await supabase.from("products").insert(dados);
    if (r.error) return toast.error(errMsg(r.error));
    toast.success("Produto salvo");
    setForm(null);
    qc.invalidateQueries({ queryKey: ["produtos"] });
  }

  async function excluir(p: Produto) {
    if (!confirm(`Excluir "${p.nome}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) {
      toast.error("Este produto possui movimentações e não pode ser excluído. Marque-o como inativo para preservar o histórico.");
      return;
    }
    toast.success("Produto excluído");
    qc.invalidateQueries({ queryKey: ["produtos"] });
  }

  return (
    <div>
      <PageHeader title="Produtos" desc="Lista geral de alimentos da merenda escolar">
        {isAdmin && <Button onClick={() => setForm({ ...vazio })}><Plus className="h-4 w-4" /> Novo produto</Button>}
      </PageHeader>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Pesquisar pelo nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <NSelect value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </NSelect>
        <NSelect value={un} onChange={(e) => setUn(e.target.value)}>
          <option value="">Todas as unidades</option>
          <option value="kg">kg</option><option value="L">L</option><option value="un">unidade</option>
        </NSelect>
      </div>
      <Panel className="overflow-x-auto p-0 md:p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Nome</th><th className="p-3">Unidade</th><th className="p-3">Categoria</th><th className="p-3">Origem habitual</th><th className="p-3">Mínimo</th><th className="p-3">Status</th>{isAdmin && <th />}</tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum produto encontrado.</td></tr>}
            {lista.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3 font-medium">{p.nome}</td>
                <td className="p-3">{p.unidade === "un" ? "unidade" : p.unidade}</td>
                <td className="p-3">{p.categoria}</td>
                <td className="p-3">{ORIGEM_LABEL[p.origem_padrao]}</td>
                <td className="p-3">{p.estoque_minimo}</td>
                <td className="p-3">{p.ativo ? <span className="text-entrada font-semibold">Ativo</span> : <span className="text-muted-foreground">Inativo</span>}</td>
                {isAdmin && (
                  <td className="whitespace-nowrap p-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => setForm({ ...p })} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => excluir(p)} aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          {form && (
            <form onSubmit={salvar} className="grid gap-3">
              <div className="grid gap-1.5"><Label>Nome do alimento</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Unidade</Label>
                  <NSelect value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value as Produto["unidade"] })}>
                    <option value="kg">Quilograma (kg)</option><option value="L">Litro (L)</option><option value="un">Unidade</option>
                  </NSelect></div>
                <div className="grid gap-1.5"><Label>Categoria</Label>
                  <NSelect value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                    {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                  </NSelect></div>
                <div className="grid gap-1.5"><Label>Origem de fornecimento</Label>
                  <NSelect value={form.origem_padrao} onChange={(e) => setForm({ ...form, origem_padrao: e.target.value as Produto["origem_padrao"] })}>
                    <option value="mercado">Mercado/Fornecedor comercial</option><option value="agricultura">Agricultura Familiar</option>
                  </NSelect></div>
                <div className="grid gap-1.5"><Label>Estoque mínimo</Label><Input type="number" min={0} step="any" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) })} /></div>
              </div>
              <div className="grid gap-1.5"><Label>Status</Label>
                <NSelect value={form.ativo ? "1" : "0"} onChange={(e) => setForm({ ...form, ativo: e.target.value === "1" })}>
                  <option value="1">Ativo</option><option value="0">Inativo</option>
                </NSelect></div>
              <p className="text-xs text-muted-foreground">A origem é registrada em cada entrada — o mesmo alimento pode vir do mercado e da agricultura familiar.</p>
              <Button type="submit">Salvar</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
