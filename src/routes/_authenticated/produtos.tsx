import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useProdutos } from "@/lib/app-context";
import {
  CATEGORIAS,
  fmtData,
  formatUnidade,
  hoje,
  mapToDbUnidade,
  ORIGEM_LABEL,
  setProductMeta,
  UNIDADE_APRESENTACAO_LABEL,
  UNIDADES_APRESENTACAO,
  type Produto,
  type UnidadeApresentacao,
} from "@/lib/estoque";
import { NSelect, PageHeader, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () =>
    pageMeta(
      "Produtos",
      "Cadastro completo de produtos utilizados na alimentação escolar: unidade, categoria, origem, fornecedor, estoque mínimo e validade.",
    ),
  component: Produtos,
});

interface FormState {
  id?: string;
  nome: string;
  unidade_apresentacao: UnidadeApresentacao;
  categoria: string;
  origem_padrao: Produto["origem_padrao"];
  fornecedor: string;
  estoque_minimo: number;
  validade: string;
  observacoes: string;
  ativo: boolean;
}

const vazio: FormState = {
  nome: "",
  unidade_apresentacao: "kg",
  categoria: "Cereais",
  origem_padrao: "mercado",
  fornecedor: "",
  estoque_minimo: 0,
  validade: "",
  observacoes: "",
  ativo: true,
};

function validadeBadge(validade?: string | null) {
  if (!validade) return <span className="text-muted-foreground">—</span>;
  const diffDays = Math.ceil(
    (new Date(`${validade.slice(0, 10)}T00:00:00`).getTime() -
      new Date(`${hoje()}T00:00:00`).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) {
    return (
      <span className="rounded bg-saida-soft px-1.5 py-0.5 text-xs font-semibold text-destructive">
        {fmtData(validade)} (Vencido)
      </span>
    );
  }
  if (diffDays <= 30) {
    return (
      <span className="rounded bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning">
        {fmtData(validade)} ({diffDays}d)
      </span>
    );
  }
  return <span>{fmtData(validade)}</span>;
}

function Produtos() {
  const { isAdmin, canWrite } = useApp();
  const q = useProdutos();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const [un, setUn] = useState("");
  const [orig, setOrig] = useState("");
  const [form, setForm] = useState<FormState | null>(null);

  const lista = (q.data ?? []).filter(
    (p) =>
      p.nome.toLowerCase().includes(busca.toLowerCase()) &&
      (!cat || p.categoria === cat) &&
      (!un || (p.unidade_apresentacao ?? p.unidade) === un) &&
      (!orig || p.origem_padrao === orig),
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const dbUnidade = mapToDbUnidade(form.unidade_apresentacao);
    const dbPayload = {
      nome: form.nome.trim(),
      unidade: dbUnidade,
      categoria: form.categoria,
      origem_padrao: form.origem_padrao,
      ativo: form.ativo,
      estoque_minimo: form.estoque_minimo,
    };

    const r = form.id
      ? await supabase.from("products").update(dbPayload).eq("id", form.id).select("id").single()
      : await supabase.from("products").insert(dbPayload).select("id").single();

    if (r.error) {
      toast.error(errMsg(r.error));
      return;
    }

    const savedId = r.data?.id ?? form.id;
    if (savedId) {
      setProductMeta(savedId, {
        unidade_apresentacao: form.unidade_apresentacao,
        fornecedor: form.fornecedor.trim(),
        validade: form.validade.trim(),
        observacoes: form.observacoes.trim(),
      });
    }

    toast.success("Produto salvo com sucesso");
    setForm(null);
    qc.invalidateQueries({ queryKey: ["produtos"] });
  }

  async function excluir(p: Produto) {
    if (!confirm(`Excluir "${p.nome}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) {
      toast.error(
        "Este produto possui movimentações e não pode ser excluído. Marque-o como inativo para preservar o histórico.",
      );
      return;
    }
    toast.success("Produto excluído");
    qc.invalidateQueries({ queryKey: ["produtos"] });
  }

  function abrirEdicao(p: Produto) {
    setForm({
      id: p.id,
      nome: p.nome,
      unidade_apresentacao: p.unidade_apresentacao ?? p.unidade,
      categoria: p.categoria,
      origem_padrao: p.origem_padrao,
      fornecedor: p.fornecedor ?? "",
      estoque_minimo: p.estoque_minimo,
      validade: p.validade ?? "",
      observacoes: p.observacoes ?? "",
      ativo: p.ativo,
    });
  }

  return (
    <div>
      <PageHeader
        title="Cadastro de Produtos"
        desc="Cadastro geral dos gêneros alimentícios utilizados na alimentação escolar"
      >
        {(isAdmin || canWrite) && (
          <Button onClick={() => setForm({ ...vazio })}>
            <Plus className="h-4 w-4" /> Novo produto
          </Button>
        )}
      </PageHeader>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input
          placeholder="Pesquisar pelo nome ou fornecedor…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <NSelect value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </NSelect>
        <NSelect value={un} onChange={(e) => setUn(e.target.value)}>
          <option value="">Todas as unidades</option>
          {UNIDADES_APRESENTACAO.map((u) => (
            <option key={u} value={u}>
              {UNIDADE_APRESENTACAO_LABEL[u]}
            </option>
          ))}
        </NSelect>
        <NSelect value={orig} onChange={(e) => setOrig(e.target.value)}>
          <option value="">Todas as origens</option>
          <option value="mercado">Mercado</option>
          <option value="agricultura">Agricultura Familiar</option>
        </NSelect>
      </div>
      <Panel className="overflow-x-auto p-0 md:p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Nome do produto</th>
              <th className="p-3">Unidade</th>
              <th className="p-3">Categoria</th>
              <th className="p-3">Origem</th>
              <th className="p-3">Fornecedor</th>
              <th className="p-3">Est. Mínimo</th>
              <th className="p-3">Validade</th>
              <th className="p-3">Observações</th>
              <th className="p-3">Status</th>
              {(isAdmin || canWrite) && <th />}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
            {lista.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3 font-medium">{p.nome}</td>
                <td className="p-3">{formatUnidade(p)}</td>
                <td className="p-3">{p.categoria}</td>
                <td className="p-3">{ORIGEM_LABEL[p.origem_padrao]}</td>
                <td className="p-3">{p.fornecedor || "—"}</td>
                <td className="p-3 tabular-nums">{p.estoque_minimo}</td>
                <td className="p-3 whitespace-nowrap">{validadeBadge(p.validade)}</td>
                <td className="p-3 text-xs text-muted-foreground">{p.observacoes || "—"}</td>
                <td className="p-3">
                  {p.ativo ? (
                    <span className="font-semibold text-entrada">Ativo</span>
                  ) : (
                    <span className="text-muted-foreground">Inativo</span>
                  )}
                </td>
                {(isAdmin || canWrite) && (
                  <td className="whitespace-nowrap p-3 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => abrirEdicao(p)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => excluir(p)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Editar produto" : "Novo produto da merenda escolar"}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <form onSubmit={salvar} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Nome do produto *</Label>
                <Input
                  required
                  placeholder="Ex.: Arroz Branco Tipo 1"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Unidade de medida *</Label>
                  <NSelect
                    value={form.unidade_apresentacao}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        unidade_apresentacao: e.target.value as UnidadeApresentacao,
                      })
                    }
                  >
                    {UNIDADES_APRESENTACAO.map((u) => (
                      <option key={u} value={u}>
                        {UNIDADE_APRESENTACAO_LABEL[u]}
                      </option>
                    ))}
                  </NSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label>Categoria *</Label>
                  <NSelect
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </NSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label>Origem habitual *</Label>
                  <NSelect
                    value={form.origem_padrao}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        origem_padrao: e.target.value as Produto["origem_padrao"],
                      })
                    }
                  >
                    <option value="mercado">Mercado</option>
                    <option value="agricultura">Agricultura Familiar</option>
                  </NSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label>Quantidade mínima de estoque</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={form.estoque_minimo}
                    onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Fornecedor habitual</Label>
                  <Input
                    placeholder="Nome do fornecedor ou cooperativa"
                    value={form.fornecedor}
                    onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Validade de referência</Label>
                  <Input
                    type="date"
                    value={form.validade}
                    onChange={(e) => setForm({ ...form, validade: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Observações</Label>
                <Textarea
                  rows={2}
                  placeholder="Especificações nutricionais, armazenamento, embalagem…"
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <NSelect
                  value={form.ativo ? "1" : "0"}
                  onChange={(e) => setForm({ ...form, ativo: e.target.value === "1" })}
                >
                  <option value="1">Ativo</option>
                  <option value="0">Inativo</option>
                </NSelect>
              </div>
              <p className="text-xs text-muted-foreground">
                A origem exata também é registrada em cada entrada — o mesmo alimento pode ser
                adquirido tanto da Agricultura Familiar quanto do Mercado.
              </p>
              <Button type="submit">Salvar produto</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
