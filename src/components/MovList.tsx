import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp } from "@/lib/app-context";
import {
  fmtData,
  fmtQ,
  formatUnidade,
  isSaldoInicial,
  monthRange,
  parseMovObservacoes,
  type Movimento,
  type Produto,
} from "@/lib/estoque";
import { MesAno, NSelect, OrigemBadge, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MovList({
  tipo,
  movs,
  produtos,
}: {
  tipo: "entrada" | "saida";
  movs: Movimento[];
  produtos: Produto[];
}) {
  const { isAdmin, escola } = useApp();
  const qc = useQueryClient();
  const now = new Date();
  const [modo, setModo] = useState<"mes" | "periodo" | "todos">("mes");
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [prod, setProd] = useState("");
  const pmap = new Map(produtos.map((p) => [p.id, p]));
  const { start, end } = monthRange(ano, mes);

  const lista = movs
    .filter((m) => m.tipo === tipo)
    .filter((m) => {
      if (modo === "todos") return true;
      if (modo === "mes") return m.data >= start && m.data < end;
      return (!de || m.data >= de) && (!ate || m.data <= ate);
    })
    .filter((m) => !prod || m.product_id === prod)
    .slice()
    .reverse();
  const total = lista.reduce((a, m) => a + m.quantidade, 0);

  async function excluir(m: Movimento) {
    if (
      !confirm(
        "Confirma a exclusão deste lançamento? A operação não é silenciosa e ficará integralmente registrada no log de auditoria com seu usuário, data e horário.",
      )
    )
      return;
    const { error } = await supabase.from("movements").delete().eq("id", m.id);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success("Registro excluído e registrado na auditoria");
    qc.invalidateQueries({ queryKey: ["movimentos"] });
    qc.invalidateQueries({ queryKey: ["movimentos-rede"] });
  }

  const tone = tipo === "entrada" ? "text-entrada" : "text-saida";
  return (
    <Panel className="p-0 md:p-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <h2 className="mr-auto font-display text-lg font-bold">
          Histórico de {tipo === "entrada" ? "entradas e saldo inicial" : "saídas"}
        </h2>
        <NSelect
          value={modo}
          onChange={(e) => setModo(e.target.value as "mes" | "periodo" | "todos")}
          className="w-36"
        >
          <option value="mes">Por mês</option>
          <option value="periodo">Por período</option>
          <option value="todos">Todo o histórico</option>
        </NSelect>
        {modo === "mes" && <MesAno mes={mes} ano={ano} onMes={setMes} onAno={setAno} />}
        {modo === "periodo" && (
          <div className="flex gap-2">
            <Input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="w-40"
            />
          </div>
        )}
        <NSelect value={prod} onChange={(e) => setProd(e.target.value)} className="w-48">
          <option value="">Todos os produtos</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </NSelect>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Produto</th>
              <th className="p-3 text-right">Quantidade</th>
              <th className="p-3">Origem</th>
              {tipo === "entrada" ? (
                <>
                  <th className="p-3">Fornecedor</th>
                  <th className="p-3">NF / Doc.</th>
                  <th className="p-3">Responsável</th>
                  <th className="p-3">Validade / Lote</th>
                </>
              ) : (
                <>
                  <th className="p-3">Escola de destino</th>
                  <th className="p-3">Finalidade</th>
                  <th className="p-3">Responsável</th>
                </>
              )}
              <th className="p-3">Obs.</th>
              {isAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  Nenhum registro no período.
                </td>
              </tr>
            )}
            {lista.map((m) => {
              const p = pmap.get(m.product_id);
              const parsedObs = parseMovObservacoes(m.observacoes);
              const saldoInic = isSaldoInicial(m);
              return (
                <tr key={m.id} className="border-t">
                  <td className="whitespace-nowrap p-3">{fmtData(m.data)}</td>
                  <td className="p-3 font-medium">
                    {p?.nome}
                    {saldoInic && (
                      <span className="ml-2 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                        Saldo Inicial Importado
                      </span>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap p-3 text-right font-semibold tabular-nums ${tone}`}
                  >
                    {tipo === "entrada" ? "+" : "−"}
                    {fmtQ(m.quantidade)} {p ? formatUnidade(p) : ""}
                  </td>
                  <td className="p-3">
                    <OrigemBadge origem={m.origem} />
                  </td>
                  {tipo === "entrada" ? (
                    <>
                      <td className="p-3">{m.fornecedor || "—"}</td>
                      <td className="p-3">{m.nota_fiscal || "—"}</td>
                      <td className="p-3">{m.responsavel || "—"}</td>
                      <td className="p-3 text-xs">
                        {parsedObs.validade ? `Val: ${fmtData(parsedObs.validade)}` : ""}
                        {parsedObs.validade && parsedObs.lote ? " · " : ""}
                        {parsedObs.lote ? `Lote: ${parsedObs.lote}` : ""}
                        {!parsedObs.validade && !parsedObs.lote ? "—" : ""}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3">{escola?.nome ?? "—"}</td>
                      <td className="p-3">{m.destino || "—"}</td>
                      <td className="p-3">{m.responsavel || "—"}</td>
                    </>
                  )}
                  <td className="p-3 text-muted-foreground">{parsedObs.texto || "—"}</td>
                  {isAdmin && (
                    <td className="p-3 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => excluir(m)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {prod && lista.length > 0 && (
        <div className="border-t p-3 text-right text-sm">
          Total:{" "}
          <b className={tone}>
            {fmtQ(total)} {pmap.get(prod) ? formatUnidade(pmap.get(prod)!) : ""}
          </b>
        </div>
      )}
    </Panel>
  );
}
