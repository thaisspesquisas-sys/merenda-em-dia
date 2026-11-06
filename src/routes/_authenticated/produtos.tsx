import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Barcode,
  Camera,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
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
import {
  checkBarcodeConflict,
  findProductByBarcode,
  getProductBarcodes,
  isValidBarcodeFormat,
  normalizeBarcode,
  saveProductBarcodes,
  syncBarcodesRegistryWithCloud,
  type CodigoBarrasVinculado,
} from "@/lib/barcode";
import { BarcodeScannerCamera } from "@/components/BarcodeScannerCamera";
import { NSelect, PageHeader, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () =>
    pageMeta(
      "Produtos e Códigos de Barras",
      "Cadastro completo de produtos utilizados na alimentação escolar com múltiplos códigos de barras vinculados, unidade, categoria, origem, fornecedor, estoque mínimo e validade.",
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
  codigos_barras: CodigoBarrasVinculado[];
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
  codigos_barras: [],
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
  const { isAdmin, canWrite, escola, nome } = useApp();
  const q = useProdutos();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const [un, setUn] = useState("");
  const [orig, setOrig] = useState("");
  const [form, setForm] = useState<FormState | null>(null);

  // Campos para adicionar novo código de barras dentro do modal do produto
  const [novoCod, setNovoCod] = useState("");
  const [novaMarca, setNovaMarca] = useState("");
  const [novoFator, setNovoFator] = useState("1");
  const [scannerAbertoNoModal, setScannerAbertoNoModal] = useState(false);
  const [erroCodigoModal, setErroCodigoModal] = useState<string | null>(null);

  // Modal de consulta rápida de código de barras ("Consultar a qual produto cada código pertence")
  const [consultaOpen, setConsultaOpen] = useState(false);
  const [codigoConsulta, setCodigoConsulta] = useState("");
  const [scannerConsulta, setScannerConsulta] = useState(false);

  useEffect(() => {
    if (escola?.id) {
      void syncBarcodesRegistryWithCloud(escola.id).then(() => {
        qc.invalidateQueries({ queryKey: ["produtos"] });
      });
    }
  }, [escola?.id, qc]);

  const produtosLista = q.data ?? [];

  const lista = produtosLista.filter((p) => {
    const b = busca.trim().toLowerCase();
    const codigosProd = getProductBarcodes(p.id);
    const matchTexto =
      !b ||
      p.nome.toLowerCase().includes(b) ||
      (p.fornecedor ?? "").toLowerCase().includes(b) ||
      (p.codigo_barras ?? "").toLowerCase().includes(b) ||
      codigosProd.some(
        (c) =>
          c.codigo.toLowerCase().includes(b) ||
          (c.marca_apresentacao ?? "").toLowerCase().includes(b),
      );

    return (
      matchTexto &&
      (!cat || p.categoria === cat) &&
      (!un || (p.unidade_apresentacao ?? p.unidade) === un) &&
      (!orig || p.origem_padrao === orig)
    );
  });

  function adicionarCodigoAoForm(codigoBruto: string) {
    if (!form) return;
    setErroCodigoModal(null);
    const clean = normalizeBarcode(codigoBruto);
    const valid = isValidBarcodeFormat(clean);
    if (!valid.valid) {
      setErroCodigoModal(valid.reason || "Código de barras inválido.");
      toast.error(valid.reason || "Código de barras inválido.");
      return;
    }

    // Verifica se já está na lista atual do próprio formulário
    if (
      form.codigos_barras.some(
        (c) => normalizeBarcode(c.codigo).toUpperCase() === clean.toUpperCase(),
      )
    ) {
      setErroCodigoModal("Este código já foi incluído na lista deste produto.");
      toast.warning("Este código já está vinculado a este produto.");
      return;
    }

    // Verifica duplicidade em todos os outros produtos do sistema
    const conflict = checkBarcodeConflict(clean, produtosLista, form.id);
    if (conflict.conflict) {
      setErroCodigoModal(conflict.message ?? "Código já vinculado a outro produto.");
      toast.error(conflict.message);
      return;
    }

    const fatorNum = Number(novoFator);
    const novoItem: CodigoBarrasVinculado = {
      codigo: clean,
      principal: form.codigos_barras.length === 0,
      marca_apresentacao: novaMarca.trim() || undefined,
      unidade_embalagem: form.unidade_apresentacao,
      fator_conversao: fatorNum > 0 ? fatorNum : 1,
      created_at: new Date().toISOString(),
      created_by: nome || "Usuário autorizado",
    };

    setForm({
      ...form,
      codigos_barras: [...form.codigos_barras, novoItem],
    });
    setNovoCod("");
    setNovaMarca("");
    setNovoFator("1");
    setScannerAbertoNoModal(false);
    toast.success(`Código ${clean} (${valid.format}) adicionado à lista do produto!`);
  }

  function definirComoPrincipal(codigo: string) {
    if (!form) return;
    setForm({
      ...form,
      codigos_barras: form.codigos_barras.map((c) => ({
        ...c,
        principal: c.codigo === codigo,
      })),
    });
  }

  function removerCodigoDoForm(codigo: string) {
    if (!form) return;
    const restantes = form.codigos_barras.filter((c) => c.codigo !== codigo);
    if (restantes.length > 0 && !restantes.some((c) => c.principal)) {
      restantes[0]!.principal = true;
    }
    setForm({
      ...form,
      codigos_barras: restantes,
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    // Validação final de duplicidade de todos os códigos vinculados antes de salvar
    for (const cb of form.codigos_barras) {
      const conflict = checkBarcodeConflict(cb.codigo, produtosLista, form.id);
      if (conflict.conflict) {
        toast.error(conflict.message);
        setErroCodigoModal(conflict.message ?? null);
        return;
      }
    }

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
      saveProductBarcodes(savedId, form.codigos_barras);
      setProductMeta(savedId, {
        unidade_apresentacao: form.unidade_apresentacao,
        fornecedor: form.fornecedor.trim(),
        validade: form.validade.trim(),
        observacoes: form.observacoes.trim(),
        codigo_barras:
          form.codigos_barras.find((x) => x.principal)?.codigo ?? form.codigos_barras[0]?.codigo,
        codigos_barras: form.codigos_barras,
      });
      await syncBarcodesRegistryWithCloud(escola?.id);
    }

    toast.success("Produto e códigos de barras salvos com sucesso!");
    setForm(null);
    setErroCodigoModal(null);
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
    const codigos = getProductBarcodes(p.id);
    setErroCodigoModal(null);
    setNovoCod("");
    setNovaMarca("");
    setNovoFator("1");
    setScannerAbertoNoModal(false);
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
      codigos_barras: codigos,
    });
  }

  const resultadoConsulta = codigoConsulta.trim()
    ? findProductByBarcode(codigoConsulta, produtosLista)
    : null;

  return (
    <div>
      <PageHeader
        title="Cadastro de Produtos"
        desc="Cadastro geral dos gêneros alimentícios e gerenciamento de múltiplos códigos de barras vinculados"
      >
        <Button
          variant="outline"
          onClick={() => {
            setCodigoConsulta("");
            setScannerConsulta(false);
            setConsultaOpen(true);
          }}
        >
          <Barcode className="h-4 w-4" /> Consultar Código de Barras
        </Button>
        {(isAdmin || canWrite) && (
          <Button
            onClick={() => {
              setErroCodigoModal(null);
              setNovoCod("");
              setNovaMarca("");
              setNovoFator("1");
              setScannerAbertoNoModal(false);
              setForm({ ...vazio });
            }}
          >
            <Plus className="h-4 w-4" /> Novo produto
          </Button>
        )}
      </PageHeader>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input
          placeholder="Pesquisar por nome, código de barras ou fornecedor…"
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
              <th className="p-3">Códigos de Barras Vinculados</th>
              <th className="p-3">Unidade</th>
              <th className="p-3">Categoria</th>
              <th className="p-3">Origem</th>
              <th className="p-3">Fornecedor</th>
              <th className="p-3">Est. Mínimo</th>
              <th className="p-3">Validade</th>
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
            {lista.map((p) => {
              const codigos = getProductBarcodes(p.id);
              const principal = codigos.find((c) => c.principal) ?? codigos[0];
              return (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-medium">{p.nome}</td>
                  <td className="p-3">
                    {principal ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold">
                          <Barcode className="h-3.5 w-3.5 text-primary" />
                          {principal.codigo}
                        </span>
                        {codigos.length > 1 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                            +{codigos.length - 1} código(s)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem código vinculado</span>
                    )}
                  </td>
                  <td className="p-3">{formatUnidade(p)}</td>
                  <td className="p-3">{p.categoria}</td>
                  <td className="p-3">{ORIGEM_LABEL[p.origem_padrao]}</td>
                  <td className="p-3">{p.fornecedor || "—"}</td>
                  <td className="p-3 tabular-nums">{p.estoque_minimo}</td>
                  <td className="whitespace-nowrap p-3">{validadeBadge(p.validade)}</td>
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
              );
            })}
          </tbody>
        </table>
      </Panel>

      {/* MODAL DE CADASTRO / EDIÇÃO COM MÚLTIPLOS CÓDIGOS DE BARRAS VINCULADOS */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Editar produto e códigos de barras" : "Novo produto da merenda escolar"}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <form onSubmit={salvar} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Nome do produto *</Label>
                <Input
                  required
                  placeholder="Ex.: Feijão Carioca Tipo 1 (Pacote 1 kg)"
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

              {/* SEÇÃO: CÓDIGOS DE BARRAS VINCULADOS */}
              <div className="space-y-3 rounded-xl border-2 border-primary/20 bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-primary">
                      <Barcode className="h-4 w-4" /> CÓDIGOS DE BARRAS VINCULADOS
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Vincule um ou vários códigos de barras (marcas equivalentes da mesma
                      apresentação). Qualquer código lido apontará para este produto principal.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={scannerAbertoNoModal ? "destructive" : "outline"}
                    onClick={() => setScannerAbertoNoModal((v) => !v)}
                  >
                    <Camera className="h-4 w-4" />{" "}
                    {scannerAbertoNoModal ? "Fechar Câmera" : "Ler com a Câmera"}
                  </Button>
                </div>

                <div className="rounded-lg border border-warning/40 bg-warning-soft/60 px-3 py-2 text-[11px] text-muted-foreground">
                  <b>Atenção às apresentações diferentes:</b> Vincule ao mesmo produto apenas
                  embalagens compatíveis com a unidade de controle (
                  <b>{UNIDADE_APRESENTACAO_LABEL[form.unidade_apresentacao]}</b>). Embalagens de
                  tamanhos diferentes (ex.: Arroz 1 kg e Arroz 5 kg quando controlados por pacote)
                  devem possuir cadastros próprios ou regra de conversão informada abaixo.
                </div>

                {scannerAbertoNoModal && (
                  <BarcodeScannerCamera
                    compact
                    continuous={false}
                    autoStart
                    onDetected={(code) => {
                      setNovoCod(code);
                      adicionarCodigoAoForm(code);
                    }}
                  />
                )}

                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <Label className="text-xs">Código de barras (EAN-13, EAN-8, UPC…)</Label>
                    <Input
                      placeholder="Ex.: 7891000100103"
                      value={novoCod}
                      onChange={(e) => {
                        setNovoCod(e.target.value);
                        setErroCodigoModal(null);
                      }}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Label className="text-xs">Marca / Apresentação (opcional)</Label>
                    <Input
                      placeholder="Ex.: Marca A - Pct 1kg"
                      value={novaMarca}
                      onChange={(e) => setNovaMarca(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-3 flex items-end">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => adicionarCodigoAoForm(novoCod)}
                    >
                      <Plus className="h-4 w-4" /> Vincular
                    </Button>
                  </div>
                </div>

                {erroCodigoModal && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive bg-saida-soft p-2.5 text-xs font-bold text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{erroCodigoModal}</span>
                  </div>
                )}

                {/* Lista de códigos já associados a este produto */}
                {form.codigos_barras.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-card p-3 text-center text-xs text-muted-foreground">
                    Nenhum código de barras vinculado ainda. Digite ou leia pela câmera acima para
                    associar.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {form.codigos_barras.map((cb) => (
                      <div
                        key={cb.codigo}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold">{cb.codigo}</span>
                          {cb.principal ? (
                            <span className="inline-flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                              <Star className="h-3 w-3 fill-current" /> CÓDIGO PRINCIPAL
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => definirComoPrincipal(cb.codigo)}
                              className="rounded border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                            >
                              Definir como principal
                            </button>
                          )}
                          {cb.marca_apresentacao && (
                            <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                              {cb.marca_apresentacao}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removerCodigoDoForm(cb.codigo)}
                          className="h-7 px-2 text-destructive"
                          title="Remover código vinculado (preserva o histórico de movimentações)"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
              <Button type="submit">Salvar produto e códigos vinculados</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: CONSULTAR A QUAL PRODUTO CADA CÓDIGO PERTENCE */}
      <Dialog open={consultaOpen} onOpenChange={setConsultaOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> Consultar Vínculo de Código de Barras
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-xs text-muted-foreground">
              Digite ou escaneie qualquer código de barras para verificar a qual produto ele
              pertence atualmente no sistema.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Digite o código EAN-13, EAN-8, UPC…"
                value={codigoConsulta}
                onChange={(e) => setCodigoConsulta(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={() => setScannerConsulta((s) => !s)}>
                <Camera className="h-4 w-4" /> {scannerConsulta ? "Fechar" : "Câmera"}
              </Button>
            </div>

            {scannerConsulta && (
              <BarcodeScannerCamera
                compact
                continuous={false}
                autoStart
                onDetected={(code) => {
                  setCodigoConsulta(code);
                  setScannerConsulta(false);
                }}
              />
            )}

            {codigoConsulta.trim() && (
              <div className="rounded-xl border p-4">
                {resultadoConsulta ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 font-bold text-entrada">
                      <CheckCircle2 className="h-5 w-5" /> ESTE CÓDIGO JÁ ESTÁ VINCULADO AO PRODUTO:{" "}
                      {resultadoConsulta.produto.nome.toUpperCase()}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <b>Código lido:</b> {resultadoConsulta.vinculo.codigo}{" "}
                        {resultadoConsulta.vinculo.principal ? "(Principal)" : "(Vinculado)"}
                      </div>
                      <div>
                        <b>Unidade:</b> {formatUnidade(resultadoConsulta.produto)}
                      </div>
                      <div>
                        <b>Categoria:</b> {resultadoConsulta.produto.categoria}
                      </div>
                      <div>
                        <b>Marca / Apresentação:</b>{" "}
                        {resultadoConsulta.vinculo.marca_apresentacao || "Padrão"}
                      </div>
                    </div>
                    {(isAdmin || canWrite) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => {
                          setConsultaOpen(false);
                          abrirEdicao(resultadoConsulta.produto);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Abrir cadastro do produto
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1 text-warning">
                    <div className="font-bold">
                      PRODUTO NÃO ENCONTRADO. Verifique o cadastro ou localize o produto
                      manualmente.
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O código <b>{normalizeBarcode(codigoConsulta)}</b> está livre e ainda não foi
                      associado a nenhum produto.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
