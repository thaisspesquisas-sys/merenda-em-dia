import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, RotateCcw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cropHeader, useReportHeader } from "@/lib/report-header";
import { renderHeaderFile } from "@/lib/import-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function ReportHeaderEditor() {
  const current = useReportHeader();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [top, setTop] = useState(0);
  const [size, setSize] = useState(20);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  async function crop(data: string, t: number, s: number) {
    setPreview(await cropHeader(data, t, s));
  }
  async function upload(file: File) {
    setBusy(true); setPreview(""); setSource("");
    try {
      const data = await renderHeaderFile(file);
      const full = /\.(png|jpe?g|webp)$/i.test(file.name);
      setName(file.name); setSource(data); setTop(0); setSize(full ? 100 : 20);
      await crop(data, 0, full ? 100 : 20);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível importar o modelo."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    const { error } = await supabase.from("report_header_template").upsert({ id: true, image_data: preview, source_name: name.slice(0, 255), updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { toast.error("Não foi possível salvar o cabeçalho."); return; }
    await qc.invalidateQueries({ queryKey: ["report-header"] });
    setOpen(false); toast.success("Cabeçalho aplicado a todos os relatórios.");
  }
  async function reset() {
    if (!confirm("Restaurar o cabeçalho padrão em todos os relatórios?")) return;
    setBusy(true);
    const { error } = await supabase.from("report_header_template").delete().eq("id", true);
    setBusy(false);
    if (error) { toast.error("Não foi possível restaurar o cabeçalho."); return; }
    await qc.invalidateQueries({ queryKey: ["report-header"] });
    setOpen(false); toast.success("Cabeçalho padrão restaurado.");
  }
  return <>
    <Button variant="outline" onClick={() => { setOpen(true); setSource(""); setPreview(""); }}><Upload /> Cabeçalho da Secretaria</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Cabeçalho da Secretaria</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Modelo único para todas as escolas e relatórios. Word (.docx), Excel (.xlsx ou .xls), PDF e imagens, até 10 MB. Para manter o desenho exato de modelos antigos, use PDF ou imagem.</p>
      <input ref={input} type="file" accept=".docx,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
      <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload /> {busy ? "Preparando…" : "Importar modelo"}</Button>
      {source && <>
        <p className="break-all text-sm font-medium">{name}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="header-top">Início do recorte: {top}%</Label><input id="header-top" type="range" min="0" max="90" value={top} disabled={busy} onChange={e => { const n = Number(e.target.value); setTop(n); void crop(source, n, size).catch(() => toast.error("Selecione uma área menor.")); }} /></div>
          <div className="grid gap-2"><Label htmlFor="header-size">Altura do recorte: {size}%</Label><input id="header-size" type="range" min="3" max="100" value={size} disabled={busy} onChange={e => { const n = Number(e.target.value); setSize(n); void crop(source, top, n).catch(() => toast.error("Selecione uma área menor.")); }} /></div>
        </div>
      </>}
      {(preview || current.data) && <div className="border bg-card p-3"><img src={preview || current.data?.image_data} alt="Prévia do cabeçalho da Secretaria" className="max-h-48 w-full object-contain" /></div>}
      {!preview && current.data && <p className="break-all text-xs text-muted-foreground">Modelo atual: {current.data.source_name}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {current.data && <Button variant="ghost" disabled={busy} onClick={reset}><RotateCcw /> Restaurar padrão</Button>}
        <Button disabled={!preview || busy} onClick={save}><Save /> Salvar cabeçalho</Button>
      </div>
    </DialogContent></Dialog>
  </>;
}