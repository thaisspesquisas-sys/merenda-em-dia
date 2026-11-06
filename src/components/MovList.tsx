import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Barcode, Trash2 } from "lucide-react";
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
import { parseBarcodeMovementMeta } from "@/lib/barcode";
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
  const [respFiltro, setRespFiltro] = useState("");
  const [tipoSaidaFiltro, setTipoSaidaFiltro] = useState("");
  const [origemMovFiltro, setOrigemMovFiltro] = useState<"todas" | "codigo_barras" | "manual">(
    "todas",
  );

  const pmap = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const { start, end } = monthRange(ano, mes);

  const responsaveisUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const m of movs) {
      if (m.tipo === tipo && m.responsavel?.trim()) {
        set.add(m.responsavel.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [movs, tipo]);

  const finalidadesUnicas = useMemo(() => {
    const set = new Set<string>();
    for (const m of movs) {
      if (m.tipo === "saida" && m.destino?.trim()) {
        set.add(m.destino.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [movs]);

  const lista = movs
    .filter((m) => m.tipo === tipo)
    .filter((m) => {
      if (modo === "todos") return true;
      if (modo === "mes") return m.data >= start && m.data < end;
      return (!de || m.data >= de) && (!ate || m.data <= ate);
    })
    .filter((m) => !prod || m.product_id === prod)
    .filter(
      (m) => !respFiltro || (m.responsavel ?? "").toLowerCase().includes(respFiltro.toLowerCase()),
    )
    .filter(
      (m) =>
        tipo !== "saida" ||
        !tipoSaidaFiltro ||
        (m.destino ?? "").toLowerCase().includes(tipoSaidaFiltro.toLowerCase()),
    )
    .filter((m) => {
      if (origemMovFiltro === "todas") return true;
      const meta = parseBarcodeMovementMeta(m);
      return origemMovFiltro === "codigo_barras" ? meta.isBarcodeExit : !meta.isBarcodeExit;
    })
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
              className="w-36"
            />
            <Input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="w-36"
            />
          </div>
        )}
        <NSelect value={prod} onChange={(e) => setProd(e.target.value)} className="w-44">
          <option value="">Todos os produtos</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </NSelect>
        <NSelect
          value={respFiltro}
          onChange={(e) => setRespFiltro(e.target.value)}
          className="w-44"
        >
          <option value="">Todos os responsáveis</option>
          {responsaveisUnicos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </NSelect>
        {tipo === "saida" && (
          <>
            <NSelect
              value={tipoSaidaFiltro}
              onChange={(e) => setTipoSaidaFiltro(e.target.value)}
              className="w-44"
            >
              <option value="">Todos os tipos de saída</option>
              {finalidadesUnicas.map((fin) => (
                <option key={fin} value={fin}>
                  {fin}
                </option>
              ))}
            </NSelect>
            <NSelect
              value={origemMovFiltro}
              onChange={(e) =>
                setOrigemMovFiltro(e.target.value as "todas" | "codigo_barras" | "manual")
              }
              className="w-48"
            >
              <option value="todas">Todas as origens de mov.</option>
              <option value="codigo_barras">Saída por código de barras</option>
              <option value="manual">Lançamento manual</option>
            </NSelect>
          </>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Data / Hora</th>
              <th className="p-3">Produto</th>
              <th className="p-3 text-right">Quantidade</th>
              <th className="p-3">Origem Recurso</th>
              {tipo === "entrada" ? (
                <>
                  <th className="p-3">Fornecedor</th>
                  <th className="p-3">NF / Doc.</th>
                  <th className="p-3">Responsável</th>
                  <th className="p-3">Validade / Lote</th>
                </>
              ) : (
                <>
                  <th className="p-3">Escola</th>
                  <th className="p-3">Finalidade / Origem Mov.</th>
                  <th className="p-3">Código Barras / Saldos</th>
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
                <td colSpan={11} className="p-6 text-center text-muted-foreground">
                  Nenhum registro no período com os filtros selecionados.
                </td>
              </tr>
            )}
            {lista.map((m) => {
              const p = pmap.get(m.product_id);
              const parsedObs = parseMovObservacoes(m.observacoes);
              const barcodeMeta = parseBarcodeMovementMeta(m);
              const saldoInic = isSaldoInicial(m);
              return (
                <tr key={m.id} className="border-t">
                  <td className="whitespace-nowrap p-3">
                    <div>{fmtData(m.data)}</div>
                    {barcodeMeta.horario && (
                      <div className="text-[11px] text-muted-foreground">{barcodeMeta.horario}</div>
                    )}
                  </td>
                  <td className="p-3 font-medium">
                    {p?.nome}
                    {saldoInic && (
                      <span className="ml-2 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                        Saldo Inicial
                      </span>
                    )}
                    {barcodeMeta.isBarcodeExit && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-saida/10 px-1.5 py-0.5 text-[11px] font-semibold text-saida">
                        <Barcode className="h-3 w-3" /> Saída por código de barras
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
                      <td className="p-3">
                        <div>{m.destino || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {barcodeMeta.origemMovimentacaoLabel}
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        {barcodeMeta.codigoBarras ? (
                          <div>
                            <span className="font-mono font-semibold">
                              EAN: {barcodeMeta.codigoBarras}
                            </span>
                            {barcodeMeta.saldoAnterior !== undefined &&
                              barcodeMeta.saldoPosterior !== undefined && (
                                <div className="text-[11px] text-muted-foreground">
                                  Saldo: {fmtQ(barcodeMeta.saldoAnterior)} →{" "}
                                  <b>{fmtQ(barcodeMeta.saldoPosterior)}</b>
                                </div>
                              )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3">{m.responsavel || "—"}</td>
                    </>
                  )}
                  <td className="p-3 text-muted-foreground">
                    {barcodeMeta.isBarcodeExit
                      ? barcodeMeta.textoLimpo || "—"
                      : parsedObs.texto || "—"}
                  </td>
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
