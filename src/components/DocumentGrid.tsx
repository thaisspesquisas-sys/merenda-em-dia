import type { DocumentContent } from "@/lib/document-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
export function DocumentGrid({ value, onChange, readOnly = false }: { value: DocumentContent; onChange: (v: DocumentContent) => void; readOnly?: boolean }) {
  return <div className="space-y-4">
    {!readOnly && <><Input aria-label="Título do documento" value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /><Textarea aria-label="Cabeçalho institucional" value={value.header} onChange={e => { if (confirm("Autoriza alterar o cabeçalho institucional deste documento?")) onChange({ ...value, header: e.target.value }); }} /></>}
    <div className="overflow-x-auto border bg-card">
      <table className="w-full border-collapse text-sm"><thead><tr>{value.columns.map((c, i) => <th className="min-w-36 border bg-muted p-2" key={i}>{readOnly ? c : <Input aria-label={`Coluna ${i + 1}`} value={c} onChange={e => onChange({ ...value, columns: value.columns.map((v, j) => j === i ? e.target.value : v) })} />}</th>)}{!readOnly && <th className="no-print w-12" />}</tr></thead>
        <tbody>{value.rows.map((r, i) => <tr key={i}>{value.columns.map((_, j) => {
          const covered = value.merges.some(m => i >= m.r && i < m.r + m.rowspan && j >= m.c && j < m.c + m.colspan && (i !== m.r || j !== m.c));
          if (covered) return null;
          const merge = value.merges.find(m => m.r === i && m.c === j);
          return <td key={j} rowSpan={merge?.rowspan ?? 1} colSpan={merge?.colspan ?? 1} className="border p-1 align-top">{readOnly ? <span className="whitespace-pre-wrap">{r[j] ?? ""}</span> : <Textarea aria-label={`Linha ${i + 1}, coluna ${j + 1}`} rows={2} value={r[j] ?? ""} className="min-w-32 border-0 shadow-none" onChange={e => onChange({ ...value, rows: value.rows.map((rr, ri) => ri === i ? value.columns.map((_, ci) => ci === j ? e.target.value : rr[ci] ?? "") : rr) })} />}</td>;
        })}{!readOnly && <td className="no-print"><Button size="icon" variant="ghost" aria-label={`Excluir linha ${i + 1}`} onClick={() => { if (confirm("Excluir esta linha?")) onChange({ ...value, rows: value.rows.filter((_, index) => index !== i), merges: [] }); }}><Trash2 /></Button></td>}</tr>)}</tbody>
      </table>
    </div>
    {!readOnly && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => onChange({ ...value, rows: [...value.rows, value.columns.map(() => "")] })}><Plus /> Linha</Button>{value.allowColumns && <Button variant="outline" onClick={() => onChange({ ...value, columns: [...value.columns, "Nova coluna"], rows: value.rows.map(r => [...r, ""]) })}><Plus /> Coluna</Button>}</div>}
    {!readOnly && <Textarea aria-label="Observações do documento" placeholder="Observações" value={value.notes} onChange={e => onChange({ ...value, notes: e.target.value })} />}
  </div>;
}