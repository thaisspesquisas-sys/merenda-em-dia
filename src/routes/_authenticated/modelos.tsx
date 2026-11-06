import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  Plus,
  Upload,
  Copy,
  Archive,
  FileText,
  Star,
  Download,
  Check,
  Sparkles,
  RotateCcw,
  Calculator,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { pageMeta } from "@/lib/page-meta";
import { DOCUMENT_CATEGORIES, emptyContent, contentOf, type DocumentContent } from "@/lib/document-model";
import { interpretDocument, type ImportResult } from "@/lib/document-import";
import { exportDocument } from "@/lib/document-export";
import { COLS_MENSAL } from "@/lib/report-cols";
import { cropHeader } from "@/lib/report-header";
import { PageHeader, NSelect, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentGrid } from "@/components/DocumentGrid";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/modelos")({
  head: () =>
    pageMeta(
      "Importar Modelos e Documentos",
      "Central inteligente de importação, interpretação por IA/OCR, adaptação e padronização de modelos e planilhas da Secretaria de Educação.",
    ),
  component: Models,
});

function Models() {
  const app = useApp();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"rede" | "escola">("rede");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [cat, setCat] = useState("Planilha mensal");
  const [content, setContent] = useState<DocumentContent>(emptyContent());
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [view, setView] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: ["models", scope, app.escola?.id],
    queryFn: async () => {
      let request = supabase
        .from("document_models")
        .select("*,model_versions(*)")
        .order("created_at", { ascending: false });
      request =
        scope === "rede"
          ? request.is("school_id", null)
          : request.eq("school_id", app.escola?.id ?? "00000000-0000-0000-0000-000000000000");
      const { data, error } = await request;
      if (error) throw error;
      return data ?? [];
    },
  });

  const access = useQuery({
    queryKey: ["document-capabilities", app.escola?.id],
    enabled: !!app.escola,
    queryFn: async () => {
      const { data } = await supabase.rpc("can_manage_models", { s: app.escola?.id ?? "" });
      return Boolean(data);
    },
  });

  const adoption = useQuery({
    queryKey: ["adoptions", app.escola?.id],
    enabled: !!app.escola,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_adoptions")
        .select("*")
        .eq("school_id", app.escola?.id ?? "");
      if (error) throw error;
      return data ?? [];
    },
  });

  const canManage = scope === "rede" ? app.isAdmin : access.data === true || app.canWrite;

  function begin() {
    setOpen(true);
    setModelId(null);
    setName("");
    setContent(emptyContent());
    setImported(null);
    setFile(null);
    setSheetIdx(0);
    setConfirmed(false);
    setView(false);
    setNote("");
  }

  async function load(f: File, requestedSheet = 0) {
    setBusy(true);
    try {
      const result = await interpretDocument(f, requestedSheet);
      setImported(result);
      setFile(f);
      setSheetIdx(requestedSheet);
      setContent(result.content);
      setName(result.content.title);
      if (result.aiAnalysis?.detectedCategory) {
        setCat(result.aiAnalysis.detectedCategory);
      }
      setConfirmed(false);
      toast.success("Documento lido e interpretado pela IA com sucesso!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na importação");
    } finally {
      setBusy(false);
    }
  }

  function adaptarParaPadraoControle(tipo: "mensal" | "semanal") {
    setCat(tipo === "mensal" ? "Planilha mensal" : "Planilha semanal");
    setName((prev) =>
      prev
        ? `${prev} (${tipo === "mensal" ? "Controle Mensal" : "Controle Semanal"})`
        : `Modelo Oficial de Controle ${tipo === "mensal" ? "Mensal" : "Semanal"}`,
    );
    setContent((prev) => ({
      ...prev,
      header:
        prev.header.trim() ||
        "PREFEITURA MUNICIPAL\nSECRETARIA MUNICIPAL DE EDUCAÇÃO\nSETOR DE ALIMENTAÇÃO ESCOLAR — PNAE",
      columns: prev.columns.length >= 4 ? prev.columns : [...COLS_MENSAL],
    }));
    toast.success(
      `Estrutura adaptada para modelo ${tipo}. Os valores originais foram preservados intactos.`,
    );
  }

  async function save(approve: boolean) {
    if (!name.trim() || !content.columns.length || (approve && !confirmed)) return;
    if (scope === "escola" && !app.escola) {
      toast.error("Selecione uma escola.");
      return;
    }
    setBusy(true);
    try {
      let id = modelId;
      if (!id) {
        const { data, error } = await supabase
          .from("document_models")
          .insert({
            name: name.trim(),
            category: cat,
            school_id: scope === "rede" ? null : app.escola?.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      const { data: versions, error: ve } = await supabase
        .from("model_versions")
        .select("version")
        .eq("model_id", id)
        .order("version", { ascending: false })
        .limit(1);
      if (ve) throw ve;

      let sourcePath: string | null = null;
      if (file) {
        sourcePath = `${id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("document-originals")
          .upload(sourcePath, file, { upsert: false });
        if (upErr) {
          // Non-fatal if bucket isn't provisioned yet in dev environment
          sourcePath = null;
        }
      }

      const nextVer = (versions?.[0]?.version ?? 0) + 1;
      const { data: insertedVer, error } = await supabase
        .from("model_versions")
        .insert({
          model_id: id,
          version: nextVer,
          content: content as unknown as Json,
          status: approve ? "aprovado" : "rascunho",
          source_path: sourcePath,
          source_name: file?.name ?? null,
          change_note: note || (approve ? `Versão ${nextVer} aprovada após conferência` : "Rascunho importado"),
        })
        .select("id")
        .single();
      if (error) throw error;

      if (approve && setAsDefault && app.escola && insertedVer?.id) {
        await supabase.from("model_adoptions").upsert({
          school_id: app.escola.id,
          model_id: id,
          version_id: insertedVer.id,
        });
        await qc.invalidateQueries({ queryKey: ["adoptions"] });
      }

      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["models"] });
      toast.success(
        approve
          ? "Modelo aprovado, versionado e disponibilizado no sistema!"
          : "Modelo salvo como rascunho para conferência.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function restaurarVersaoAnterior(mId: string, oldVersionContent: unknown, oldVerNum: number) {
    if (
      !confirm(
        `Restaurar a versão v${oldVerNum} como uma nova versão ativa? Todas as versões anteriores continuarão preservadas no histórico.`,
      )
    )
      return;
    const { data: versions } = await supabase
      .from("model_versions")
      .select("version")
      .eq("model_id", mId)
      .order("version", { ascending: false })
      .limit(1);
    const nextVer = (versions?.[0]?.version ?? 0) + 1;
    const { error } = await supabase.from("model_versions").insert({
      model_id: mId,
      version: nextVer,
      content: oldVersionContent as Json,
      status: "aprovado",
      change_note: `Restaurado a partir da versão v${oldVerNum}`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["models"] });
    toast.success(`Versão v${oldVerNum} restaurada com sucesso como v${nextVer}!`);
  }

  async function archiveModel(id: string) {
    if (!confirm("Arquivar o modelo? Documentos e versões anteriores continuarão integralmente preservados."))
      return;
    const { error } = await supabase.from("document_models").update({ archived: true }).eq("id", id);
    if (error) toast.error(error.message);
    else void qc.invalidateQueries({ queryKey: ["models"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar Modelos e Documentos"
        desc="Central de Inteligência Artificial e OCR para leitura, adaptação e padronização de planilhas e documentos da Secretaria"
      >
        <Button asChild variant="outline">
          <Link to="/importar-estoque">Importar Estoque Existente</Link>
        </Button>
        {canManage && (
          <Button onClick={begin}>
            <Upload className="h-4 w-4" /> Importar / Criar Modelo
          </Button>
        )}
      </PageHeader>

      <Panel className="border-l-4 border-l-primary bg-primary/5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <Sparkles className="h-4 w-4" /> Inteligência de Adaptação Documental da Secretaria
            </div>
            <p className="text-xs text-muted-foreground">
              Envie arquivos <b>Excel (.xlsx, .xls), PDF, Word (.docx, .doc), CSV ou Imagens (JPG, PNG)</b>. A IA lê
              títulos, cabeçalhos, colunas, fórmulas e tabelas (inclusive por OCR), mapeia automaticamente os campos e
              apresenta uma prévia completa para conferência e aprovação antes de oficializar o modelo.
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={begin}>
              <Plus className="h-4 w-4" /> Enviar Novo Documento
            </Button>
          )}
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button variant={scope === "rede" ? "default" : "outline"} onClick={() => setScope("rede")}>
          Modelos Oficiais da Secretaria (Rede)
        </Button>
        <Button variant={scope === "escola" ? "default" : "outline"} onClick={() => setScope("escola")}>
          Modelos Adaptados da Unidade Escolar
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          placeholder="Pesquisar modelo pelo título…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <NSelect value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas as categorias</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </NSelect>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Mostrar
          arquivados
        </label>
      </div>

      {q.isError && <p className="text-destructive">Não foi possível carregar os modelos.</p>}
      {q.isPending && <p className="text-sm text-muted-foreground">Carregando modelos…</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {q.data
          ?.filter(
            (m) =>
              m.archived === archived &&
              m.name.toLowerCase().includes(search.toLowerCase()) &&
              (!category || m.category === category),
          )
          .map((m) => {
            const versions = [...m.model_versions].sort((a, b) => b.version - a.version);
            const latest = versions.find((v) => v.status === "aprovado");
            const v = latest ?? versions[0];
            const adopted = adoption.data?.find((a) => a.model_id === m.id);
            const isDefault = Boolean(adopted && latest && adopted.version_id === latest.id);

            return (
              <article key={m.id} className="rounded-xl border bg-card p-5 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${scope === "rede"
                      ? "bg-primary/10 text-primary"
                      : "bg-agricultura-soft text-agricultura"
                      }`}
                  >
                    {scope === "rede" ? "Padrão Oficial da Secretaria" : "Modelo da Unidade Escolar"}
                  </span>
                  {isDefault && (
                    <span className="flex items-center gap-1 rounded-full bg-entrada-soft px-2.5 py-0.5 text-xs font-semibold text-entrada">
                      <Star className="h-3 w-3 fill-current" /> Modelo Padrão Adotado
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold">{m.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {m.category} · {v ? `Versão v${v.version} (${v.status})` : "Sem versão"} ·{" "}
                  {versions.length} versão(ões) preservada(s)
                </p>

                {latest && adopted && latest.id !== adopted.version_id && (
                  <p className="mt-3 text-sm font-semibold text-warning">
                    Nova versão oficial v{latest.version} disponível. Documentos anteriores permanecem preservados.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {v && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setOpen(true);
                        setView(true);
                        setName(m.name);
                        setContent(contentOf(v.content));
                        setImported(null);
                        setModelId(m.id);
                        setFile(null);
                      }}
                    >
                      <FileText className="h-4 w-4" /> Visualizar / Exportar
                    </Button>
                  )}
                  {latest && !archived && (
                    <Button asChild size="sm">
                      <Link to="/fechamento">Utilizar nos Controles</Link>
                    </Button>
                  )}
                  {latest && app.escola && (
                    <Button
                      variant={isDefault ? "secondary" : "outline"}
                      size="sm"
                      onClick={async () => {
                        const { error } = await supabase.from("model_adoptions").upsert({
                          school_id: app.escola?.id ?? "",
                          model_id: m.id,
                          version_id: latest.id,
                        });
                        if (error) toast.error(error.message);
                        else {
                          await qc.invalidateQueries({ queryKey: ["adoptions"] });
                          toast.success(`Modelo "${m.name}" (v${latest.version}) definido como padrão!`);
                        }
                      }}
                    >
                      <Check className="h-4 w-4" /> {isDefault ? `Padrão v${latest.version}` : `Definir Padrão v${latest.version}`}
                    </Button>
                  )}
                  {canManage && v && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          begin();
                          setName(m.name);
                          setCat(m.category);
                          setContent(contentOf(v.content));
                          setModelId(m.id);
                        }}
                      >
                        <Plus className="h-4 w-4" /> Nova versão
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Duplicar ${m.name}`}
                        onClick={() => {
                          begin();
                          setName(`${m.name} — cópia`);
                          setCat(m.category);
                          setContent(contentOf(v.content));
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Arquivar ${m.name}`}
                        onClick={() => void archiveModel(m.id)}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>

                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-medium text-primary">
                    Histórico de versões e arquivos originais ({versions.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {versions.map((old) => (
                      <div
                        key={old.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs"
                      >
                        <div>
                          <b>v{old.version}</b> ({old.status}) ·{" "}
                          {new Date(old.created_at).toLocaleString("pt-BR")} ·{" "}
                          {old.change_note || "Sem observações"}
                          {old.source_name && <span className="ml-1 text-muted-foreground">({old.source_name})</span>}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => {
                              setOpen(true);
                              setView(true);
                              setContent(contentOf(old.content));
                              setName(`${m.name} (v${old.version})`);
                            }}
                          >
                            Ver v{old.version}
                          </Button>
                          {canManage && versions[0]?.id !== old.id && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => void restaurarVersaoAnterior(m.id, old.content, old.version)}
                            >
                              <RotateCcw className="mr-1 h-3 w-3" /> Restaurar versão
                            </Button>
                          )}
                          {old.source_path && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={async () => {
                                const { data, error } = await supabase.storage
                                  .from("document-originals")
                                  .createSignedUrl(old.source_path ?? "", 60);
                                if (error) toast.error(error.message);
                                else window.open(data.signedUrl, "_blank", "noopener");
                              }}
                            >
                              <Download className="mr-1 h-3 w-3" /> Arquivo Original
                            </Button>
                          )}
                          {canManage && old.status === "rascunho" && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={async () => {
                                if (!confirm("Confirma a revisão e aprovação desta versão como modelo oficial?"))
                                  return;
                                const { error } = await supabase
                                  .from("model_versions")
                                  .update({ status: "aprovado" })
                                  .eq("id", old.id);
                                if (error) toast.error(error.message);
                                else void qc.invalidateQueries({ queryKey: ["models"] });
                              }}
                            >
                              Aprovar versão
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            );
          })}
      </div>

      {q.data?.length === 0 && (
        <Panel className="py-10 text-center text-muted-foreground">
          Nenhum modelo cadastrado ainda. Clique em <b>Importar / Criar Modelo</b> para enviar uma planilha ou documento
          da Secretaria.
        </Panel>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>
              {view
                ? `Visualização do Modelo: ${name}`
                : modelId
                  ? "Nova Versão do Modelo Oficial"
                  : "Importar e Adaptar Modelo com Inteligência Artificial"}
            </DialogTitle>
          </DialogHeader>

          {!view && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label="Nome do modelo"
                  placeholder="Título do modelo (ex.: Controle Mensal PNAE 2026)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <NSelect
                  aria-label="Categoria"
                  value={cat}
                  onChange={(e) => setCat(e.target.value)}
                >
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </NSelect>
              </div>

              <input
                ref={input}
                type="file"
                accept=".pdf,.xlsx,.xls,.docx,.doc,.csv,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void load(f, 0);
                }}
              />
              <div
                className="rounded-xl border-2 border-dashed bg-muted/30 p-5 text-center transition-colors hover:bg-muted/50"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) void load(f, 0);
                }}
              >
                <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
                  <Upload className="h-4 w-4" />{" "}
                  {busy ? "Analisando documento com IA e OCR…" : "1. Selecionar Planilha ou Documento da Secretaria"}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Formatos suportados: Excel (.xlsx, .xls), PDF, Word (.docx, .doc), CSV e Imagens digitalizadas (JPG,
                  PNG) · até 10 MB
                </p>
              </div>
            </div>
          )}

          {imported?.aiAnalysis && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                  <Sparkles className="h-4 w-4" /> Diagnóstico Estrutural da IA
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => adaptarParaPadraoControle("mensal")}>
                    Gerar como Modelo Mensal
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => adaptarParaPadraoControle("semanal")}>
                    Gerar como Modelo Semanal
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{imported.aiAnalysis.summary}</p>

              {imported.aiAnalysis.sheets.length > 1 && file && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5 text-xs">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="font-semibold">Múltiplas abas identificadas na planilha:</span>
                  {imported.aiAnalysis.sheets.map((sName, idx) => (
                    <Button
                      key={sName}
                      size="sm"
                      variant={idx === sheetIdx ? "default" : "outline"}
                      onClick={() => void load(file, idx)}
                    >
                      {sName}
                    </Button>
                  ))}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-card p-3 text-xs">
                  <div className="font-semibold text-foreground">Campos Obrigatórios Identificados</div>
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">
                    {imported.aiAnalysis.mandatoryFields.map((fName) => (
                      <li key={fName}>{fName}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border bg-card p-3 text-xs">
                  <div className="font-semibold text-foreground">Campos Opcionais / Complementares</div>
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">
                    {imported.aiAnalysis.optionalFields.map((fName) => (
                      <li key={fName}>{fName}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border bg-card p-3 text-xs">
                  <div className="font-semibold text-foreground">Mapeamento ao Banco de Dados</div>
                  <div className="mt-1 space-y-1 text-muted-foreground">
                    {imported.aiAnalysis.columnMappings.slice(0, 6).map((cm) => (
                      <div key={cm.columnIndex} className="flex items-center justify-between">
                        <span className="truncate font-medium text-foreground">{cm.originalHeader}</span>
                        <span className="ml-2 text-[11px] text-primary">→ {cm.fieldLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {imported.aiAnalysis.formulas.length > 0 && (
                <div className="rounded-lg border bg-card p-3 text-xs">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                    <Calculator className="h-3.5 w-3.5 text-primary" /> Fórmulas e Cálculos Reconhecidos no Excel (
                    {imported.aiAnalysis.formulas.length})
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-3">
                    {imported.aiAnalysis.formulas.slice(0, 9).map((fm) => (
                      <div key={fm.cell} className="rounded bg-muted px-2 py-1">
                        <b>{fm.cell}:</b> <code>{fm.formula}</code> ({fm.meaning})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {imported && imported.preview && (
            <div className="grid gap-3 md:grid-cols-2">
              <img
                src={imported.preview}
                alt="Pré-visualização do arquivo original"
                className="max-h-72 w-full rounded border object-contain"
              />
              <div className="space-y-2">
                {imported.warnings.map((w) => (
                  <p key={w} className="text-xs text-warning">
                    • {w}
                  </p>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const data = await cropHeader(imported.preview, 0, 15);
                    setContent({ ...content, headerImage: data });
                  }}
                >
                  Recortar parte superior como cabeçalho institucional
                </Button>
              </div>
            </div>
          )}

          {content.headerImage && (
            <img
              src={content.headerImage}
              alt="Cabeçalho institucional preservado"
              className="max-h-24 w-full object-contain"
            />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {view
                  ? "Estrutura da Planilha / Modelo"
                  : "Prévia para Conferência e Edição Manual (Nenhum dado ausente foi inventado)"}
              </h3>
              {view && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void exportDocument(content, "pdf", name || "modelo")}
                  >
                    Exportar PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void exportDocument(content, "excel", name || "modelo")}
                  >
                    Exportar Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void exportDocument(content, "word", name || "modelo")}
                  >
                    Exportar Word
                  </Button>
                </div>
              )}
            </div>
            <DocumentGrid value={content} onChange={setContent} readOnly={view} />
          </div>

          {!view && (
            <div className="space-y-3 border-t pt-3">
              <Input
                aria-label="Resumo das alterações"
                placeholder="Observações ou resumo desta versão do modelo"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Conferi a prévia, os campos, colunas e cálculos;
                  autorizo aprovar este documento como modelo oficial.
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={setAsDefault}
                    onChange={(e) => setSetAsDefault(e.target.checked)}
                  />
                  Definir automaticamente como modelo padrão para os próximos controles desta unidade.
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy || !name.trim()} onClick={() => void save(false)}>
                  Salvar rascunho para revisão
                </Button>
                <Button disabled={busy || !confirmed || !name.trim()} onClick={() => void save(true)}>
                  <Check className="h-4 w-4" /> Aprovar e Oficializar Modelo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
