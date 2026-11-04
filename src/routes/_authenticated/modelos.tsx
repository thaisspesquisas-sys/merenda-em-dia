import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Plus, Upload, Copy, Archive, FileText, Star, Download, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { pageMeta } from "@/lib/page-meta";
import { DOCUMENT_CATEGORIES, emptyContent, contentOf, type DocumentContent } from "@/lib/document-model";
import { interpretDocument, type ImportResult } from "@/lib/document-import";
import { cropHeader } from "@/lib/report-header";
import { PageHeader, NSelect } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentGrid } from "@/components/DocumentGrid";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/modelos")({ head: () => pageMeta("Central de modelos", "Modelos oficiais da rede e modelos personalizados das unidades escolares."), component: Models });
function Models() {
  const app = useApp(), qc = useQueryClient();
  const [scope, setScope] = useState<"rede" | "escola">("rede");
  const [search, setSearch] = useState(""); const [category, setCategory] = useState("");
  const [archived, setArchived] = useState(false); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(""); const [cat, setCat] = useState("Planilha mensal");
  const [content, setContent] = useState<DocumentContent>(emptyContent()); const [imported, setImported] = useState<ImportResult | null>(null);
  const [file, setFile] = useState<File | null>(null); const [modelId, setModelId] = useState<string | null>(null); const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false); const [view, setView] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["models", scope, app.escola?.id], queryFn: async () => {
    let request = supabase.from("document_models").select("*,model_versions(*)").order("created_at", { ascending: false });
    request = scope === "rede" ? request.is("school_id", null) : request.eq("school_id", app.escola?.id ?? "00000000-0000-0000-0000-000000000000");
    const { data, error } = await request; if (error) throw error; return data ?? [];
  } });
  const access = useQuery({ queryKey: ["document-capabilities", app.escola?.id], enabled: !!app.escola, queryFn: async () => {
    const { data } = await supabase.rpc("can_manage_models", { s: app.escola?.id ?? "" }); return Boolean(data);
  } });
  const adoption = useQuery({ queryKey: ["adoptions", app.escola?.id], enabled: !!app.escola, queryFn: async () => { const { data, error } = await supabase.from("model_adoptions").select("*").eq("school_id", app.escola?.id ?? ""); if (error) throw error; return data ?? []; } });
  const favorites = useQuery({ queryKey: ["model-favorites", app.userId], queryFn: async () => { const { data, error } = await supabase.from("model_favorites").select("model_id").eq("user_id", app.userId); if (error) throw error; return data ?? []; } });
  const canManage = scope === "rede" ? app.isAdmin : access.data === true;
  function begin() { setOpen(true); setModelId(null); setName(""); setContent(emptyContent()); setImported(null); setFile(null); setConfirmed(false); setView(false); setNote(""); }
  async function load(f: File) { setBusy(true); try { const result = await interpretDocument(f); setImported(result); setFile(f); setContent(result.content); setName(result.content.title); setConfirmed(false); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro na importação"); } finally { setBusy(false); } }
  async function save(approve: boolean) {
    if (!name.trim() || !content.columns.length || (approve && !confirmed)) return;
    if (scope === "escola" && !app.escola) { toast.error("Selecione uma escola."); return; }
    setBusy(true);
    try {
      let id = modelId;
      if (!id) { const { data, error } = await supabase.from("document_models").insert({ name: name.trim(), category: cat, school_id: scope === "rede" ? null : app.escola?.id }).select("id").single(); if (error) throw error; id = data.id; }
      const { data: versions, error: ve } = await supabase.from("model_versions").select("version").eq("model_id", id).order("version", { ascending: false }).limit(1); if (ve) throw ve;
      let sourcePath: string | null = null;
      if (file) { sourcePath = `${id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const { error } = await supabase.storage.from("document-originals").upload(sourcePath, file, { upsert: false }); if (error) throw error; }
      const { error } = await supabase.from("model_versions").insert({ model_id: id, version: (versions?.[0]?.version ?? 0) + 1, content: content as unknown as Json, status: approve ? "aprovado" : "rascunho", source_path: sourcePath, source_name: file?.name ?? null, change_note: note }); if (error) throw error;
      setOpen(false); await qc.invalidateQueries({ queryKey: ["models"] }); toast.success(approve ? "Modelo aprovado e disponível." : "Modelo salvo para revisão.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setBusy(false); }
  }
  async function action(id: string, type: "archive" | "favorite") {
    if (type === "archive") { if (!confirm("Arquivar o modelo? Documentos anteriores serão preservados.")) return; const { error } = await supabase.from("document_models").update({ archived: true }).eq("id", id); if (error) toast.error(error.message); else void qc.invalidateQueries({ queryKey: ["models"] }); }
    else { const exists = favorites.data?.some(x => x.model_id === id); const r = exists ? await supabase.from("model_favorites").delete().eq("user_id", app.userId).eq("model_id", id) : await supabase.from("model_favorites").insert({ user_id: app.userId, model_id: id }); if (r.error) toast.error(r.error.message); else void qc.invalidateQueries({ queryKey: ["model-favorites"] }); }
  }
  return <div>
    <PageHeader title="Central de modelos"><Button asChild variant="outline"><Link to="/documentos">Meus documentos</Link></Button>{canManage && <Button onClick={begin}><Plus /> Novo modelo</Button>}</PageHeader>
    <div className="mb-5 flex flex-wrap gap-2"><Button variant={scope === "rede" ? "default" : "outline"} onClick={() => setScope("rede")}>Modelo padrão oficial da rede</Button><Button variant={scope === "escola" ? "default" : "outline"} onClick={() => setScope("escola")}>Meus modelos e documentos</Button></div>
    <div className="mb-6 grid gap-2 sm:grid-cols-3"><Input placeholder="Pesquisar modelo…" value={search} onChange={e => setSearch(e.target.value)} /><NSelect value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas as categorias</option>{DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</NSelect><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> Mostrar arquivados</label></div>
    {q.isError && <p className="text-destructive">Não foi possível carregar os modelos.</p>}
    {q.isPending && <p>Carregando…</p>}
    <div className="grid gap-4 lg:grid-cols-2">{q.data?.filter(m => m.archived === archived && m.name.toLowerCase().includes(search.toLowerCase()) && (!category || m.category === category)).map(m => {
      const versions = [...m.model_versions].sort((a, b) => b.version - a.version); const latest = versions.find(v => v.status === "aprovado"); const v = latest ?? versions[0];
      const adopted = adoption.data?.find(a => a.model_id === m.id);
      return <article key={m.id} className="rounded-lg border bg-card p-5"><div className="mb-3 flex items-center justify-between"><span className={`text-xs font-semibold ${scope === "rede" ? "text-primary" : "text-agricultura"}`}>{scope === "rede" ? "Oficial da rede" : "Personalizado da escola"}</span><Button size="icon" variant="ghost" aria-label={`Favoritar ${m.name}`} onClick={() => void action(m.id, "favorite")}><Star className={favorites.data?.some(f => f.model_id === m.id) ? "fill-warning text-warning" : ""} /></Button></div><h2 className="text-lg font-bold">{m.name}</h2><p className="mt-1 text-sm text-muted-foreground">{m.category} · {v ? `Versão ${v.version} · ${v.status}` : "Sem versão"}</p>
      {latest && adopted && latest.id !== adopted.version_id && <p className="mt-3 text-sm font-semibold text-warning">Nova versão disponível. Seus documentos não foram alterados.</p>}
      <div className="mt-4 flex flex-wrap gap-2">{v && <Button variant="outline" onClick={() => { setOpen(true); setView(true); setName(m.name); setContent(contentOf(v.content)); setImported(null); setModelId(m.id); setFile(null); }}><FileText /> Visualizar</Button>}
      {latest && !archived && <Button asChild><Link to="/documentos" search={{ modelo: latest.id }}>Utilizar</Link></Button>}
      {latest && app.escola && <Button variant="outline" onClick={async () => { const { error } = await supabase.from("model_adoptions").upsert({ school_id: app.escola?.id ?? "", model_id: m.id, version_id: latest.id }); if (error) toast.error(error.message); else { await qc.invalidateQueries({ queryKey: ["adoptions"] }); toast.success("Versão adotada. Documentos anteriores preservados."); } }}><Check /> Adotar v{latest.version}</Button>}
      {canManage && v && <><Button variant="outline" onClick={() => { begin(); setName(m.name); setCat(m.category); setContent(contentOf(v.content)); setModelId(m.id); }}><Plus /> Nova versão</Button><Button variant="ghost" aria-label={`Duplicar ${m.name}`} onClick={() => { begin(); setName(`${m.name} — cópia`); setCat(m.category); setContent(contentOf(v.content)); }}><Copy /></Button><Button variant="ghost" aria-label={`Arquivar ${m.name}`} onClick={() => void action(m.id, "archive")}><Archive /></Button></>}
      </div><details className="mt-4 text-sm"><summary className="cursor-pointer text-primary">Histórico e alterações</summary>{versions.map(old => <div key={old.id} className="mt-2 border-t pt-2">v{old.version} · {new Date(old.created_at).toLocaleDateString("pt-BR")} · {old.change_note || "Sem observações"}<Button variant="link" onClick={() => { setOpen(true); setView(true); setContent(contentOf(old.content)); setName(m.name); }}>Visualizar versão</Button>{old.source_path && <Button variant="link" onClick={async () => { const { data, error } = await supabase.storage.from("document-originals").createSignedUrl(old.source_path ?? "", 60); if (error) toast.error(error.message); else window.open(data.signedUrl, "_blank", "noopener"); }}><Download /> Original</Button>}{canManage && old.status === "rascunho" && <Button variant="link" onClick={async () => { if (!confirm("Confirma a revisão e aprovação desta versão?")) return; const { error } = await supabase.from("model_versions").update({ status: "aprovado" }).eq("id", old.id); if (error) toast.error(error.message); else void qc.invalidateQueries({ queryKey: ["models"] }); }}>Aprovar</Button>}</div>)}</details></article>;
    })}</div>
    {q.data?.length === 0 && <p className="py-10 text-center text-muted-foreground">Nenhum modelo cadastrado.</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{view ? name : modelId ? "Nova versão do modelo" : "Importar modelo oficial"}</DialogTitle></DialogHeader>
      {!view && <><Input aria-label="Nome do modelo" placeholder="Nome do modelo" value={name} onChange={e => setName(e.target.value)} /><NSelect aria-label="Categoria" value={cat} onChange={e => setCat(e.target.value)}>{DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</NSelect><input ref={input} type="file" accept=".pdf,.xlsx,.xls,.docx,.doc,.csv,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void load(f); }} /><div className="border-2 border-dashed p-5 text-center" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void load(f); }}><Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload /> {busy ? "Interpretando…" : "Selecionar arquivo"}</Button><p className="mt-2 text-xs text-muted-foreground">PDF, Excel, Word, CSV ou imagem · até 10 MB · arraste e solte</p></div></>}
      {imported && <>{imported.preview && <div className="grid gap-3 md:grid-cols-2"><img src={imported.preview} alt="Pré-visualização do arquivo original" className="max-h-80 w-full border object-contain" /><div className="space-y-2">{imported.warnings.map(w => <p key={w} className="text-sm text-warning">{w}</p>)}<Button variant="outline" onClick={async () => { const data = await cropHeader(imported.preview, 0, 15); setContent({ ...content, headerImage: data }); }}>Usar parte superior como cabeçalho</Button></div></div>}</>}
      {content.headerImage && <img src={content.headerImage} alt="Cabeçalho preservado" className="max-h-24 w-full object-contain" />}
      <DocumentGrid value={content} onChange={setContent} readOnly={view} />
      {!view && <><Input aria-label="Resumo das alterações" placeholder="Resumo das alterações desta versão" value={note} onChange={e => setNote(e.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Revisei os campos, tabelas e cabeçalho; autorizo esta versão.</label><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy || !name.trim()} onClick={() => void save(false)}>Salvar rascunho</Button><Button disabled={busy || !confirmed || !name.trim()} onClick={() => void save(true)}><Check /> Aprovar e disponibilizar</Button></div></>}
    </DialogContent></Dialog>
  </div>;
}