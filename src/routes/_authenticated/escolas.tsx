import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, type Escola } from "@/lib/app-context";
import { PageHeader, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/escolas")({
  head: () => ({ meta: [{ title: "Escolas — Gestão da Merenda Escolar" }] }),
  component: Escolas,
});

type F = Partial<Escola> & { nome: string };

function Escolas() {
  const { escolas, isAdmin } = useApp();
  const qc = useQueryClient();
  const [f, setF] = useState<F | null>(null);
  if (!isAdmin) return <PageHeader title="Acesso restrito" />;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    const d = { nome: f.nome, endereco: f.endereco ?? null, responsavel: f.responsavel ?? null, diretor: f.diretor ?? null, ativo: f.ativo ?? true };
    const r = f.id ? await supabase.from("schools").update(d).eq("id", f.id) : await supabase.from("schools").insert(d);
    if (r.error) { toast.error(errMsg(r.error)); return; }
    toast.success("Escola salva");
    setF(null);
    qc.invalidateQueries({ queryKey: ["escolas"] });
  }

  return (
    <div>
      <PageHeader title="Unidades escolares" desc="Cada escola possui estoque, movimentações e relatórios próprios">
        <Button onClick={() => setF({ nome: "" })}><Plus className="h-4 w-4" /> Nova escola</Button>
      </PageHeader>
      <Panel className="overflow-x-auto p-0 md:p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Nome</th><th className="p-3">Endereço</th><th className="p-3">Resp. estoque</th><th className="p-3">Direção</th><th /></tr>
          </thead>
          <tbody>
            {escolas.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma escola cadastrada.</td></tr>}
            {escolas.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-3 font-medium">{e.nome}</td><td className="p-3">{e.endereco}</td><td className="p-3">{e.responsavel}</td><td className="p-3">{e.diretor}</td>
                <td className="p-3 text-right"><Button size="icon" variant="ghost" onClick={() => setF({ ...e })} aria-label="Editar"><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Dialog open={!!f} onOpenChange={(o) => !o && setF(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{f?.id ? "Editar escola" : "Nova escola"}</DialogTitle></DialogHeader>
          {f && (
            <form onSubmit={salvar} className="grid gap-3">
              <div className="grid gap-1.5"><Label>Nome da unidade</Label><Input required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Endereço</Label><Input value={f.endereco ?? ""} onChange={(e) => setF({ ...f, endereco: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Responsável pelo estoque</Label><Input value={f.responsavel ?? ""} onChange={(e) => setF({ ...f, responsavel: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Diretor(a)</Label><Input value={f.diretor ?? ""} onChange={(e) => setF({ ...f, diretor: e.target.value })} /></div>
              <Button type="submit">Salvar</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
