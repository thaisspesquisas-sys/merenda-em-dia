import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp } from "@/lib/app-context";
import { fmtData, fmtQ, monthRange, type Movimento, type Produto } from "@/lib/estoque";
import { MesAno, NSelect, OrigemBadge, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MovList({ tipo, movs, produtos }: { tipo: "entrada" | "saida"; movs: Movimento[]; produtos: Produto[] }) {
  const { isAdmin } = useApp();
  const qc = useQueryClient();
  const now = new Date();
  const [modo, setModo] = useState<"mes" | "periodo">("mes");
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [prod, setProd] = useState("");
  const pmap = new Map(produtos.map((p) => [p.id, p]));
  const { start, end } = monthRange(ano, mes);

  const lista = movs
    .filter((m) => m.tipo === tipo)
    .filter((m) => (modo === "mes" ? m.data >= start && m.data < end : (!de || m.data >= de) && (!ate || m.data <= ate)))
    .filter((m) => !prod || m.product_id === prod)
    .slice()
    .reverse();
  const total = lista.reduce((a, m) => a + m.quantidade, 0);

  async function excluir(m: Movimento) {
    if (!confirm("Excluir este registro? A correção ficará registrada na auditoria.")) return;
    const { error } = await supabase.from("movements").delete().eq("id", m.id);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Registro excluído");
    qc.invalidateQueries({ queryKey: ["movimentos"] });
  }

  const tone = tipo === "entrada" ? "text-entrada" : "text-saida";
  return (
    <Panel className="p-0 md:p-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <h2 className="mr-auto font-display text-lg font-bold">Histórico de {tipo === "entrada" ? "entradas" : "saídas"}</h2>
        <NSelect value={modo} onChange={(e) => setModo(e.target.value as "mes" | "periodo")} className="w-32">
          <option value="mes">Por mês</option><option value="periodo">Por período</option>
        </NSelect>
        {modo === "mes" ? <MesAno mes={mes} ano={ano} onMes={setMes} onAno={setAno} /> : (
          <div className="flex gap-2"><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" /><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" /></div>
        )}
        <NSelect value={prod} onChange={(e) => setProd(e.target.value)} className="w-48">
          <option value="">Todos os produtos</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </NSelect>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Data</th><th className="p-3">Produto</th><th className="p-3 text-right">Quantidade</th><th className="p-3">Origem</th>
              {tipo === "entrada" ? <><th className="p-3">Fornecedor</th><th className="p-3">NF/Doc.</th></> : <><th className="p-3">Destino</th><th className="p-3">Responsável</th></>}
              <th className="p-3">Obs.</th>{isAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhum registro no período.</td></tr>}
            {lista.map((m) => {
              const p = pmap.get(m.product_id);
              return (
                <tr key={m.id} className="border-t">
                  <td className="p-3 whitespace-nowrap">{fmtData(m.data)}</td>
                  <td className="p-3 font-medium">{p?.nome}</td>
                  <td className={`p-3 text-right font-semibold tabular-nums ${tone}`}>{tipo === "entrada" ? "+" : "−"}{fmtQ(m.quantidade)} {p?.unidade}</td>
                  <td className="p-3"><OrigemBadge origem={m.origem} /></td>
                  <td className="p-3">{tipo === "entrada" ? m.fornecedor : m.destino}</td>
                  <td className="p-3">{tipo === "entrada" ? m.nota_fiscal : m.responsavel}</td>
                  <td className="p-3 text-muted-foreground">{m.observacoes}</td>
                  {isAdmin && <td className="p-3 text-right"><Button size="icon" variant="ghost" onClick={() => excluir(m)} aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {prod && lista.length > 0 && <div className="border-t p-3 text-right text-sm">Total: <b className={tone}>{fmtQ(total)} {pmap.get(prod)?.unidade}</b></div>}
    </Panel>
  );
}
