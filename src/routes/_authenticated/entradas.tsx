import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useMovimentos, useProdutos } from "@/lib/app-context";
import {
  computeSaldos,
  fmtQ,
  formatMovObservacoes,
  formatUnidade,
  hoje,
  setProductMeta,
  type Origem,
} from "@/lib/estoque";
import { enqueueOfflineMovement } from "@/lib/offline-sync";
import { NSelect, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { MovList } from "@/components/MovList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/entradas")({
  head: () =>
    pageMeta(
      "Entradas",
      "Registre os alimentos recebidos, fornecedor, nota fiscal, responsável pelo recebimento e preserve a origem no estoque escolar.",
    ),
  component: Entradas,
});

function Entradas() {
  const { escola, canWrite, nome } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const qc = useQueryClient();
  const ativos = (prods.data ?? []).filter((p) => p.ativo);
  const saldos = useMemo(() => computeSaldos(movs.data ?? []), [movs.data]);

  const [f, setF] = useState({
    data: hoje(),
    product_id: "",
    quantidade: "",
    origem: "mercado" as Origem,
    fornecedor: "",
    nota_fiscal: "",
    responsavel: nome || "",
    validade: "",
    lote: "",
    observacoes: "",
  });
  const [busy, setBusy] = useState(false);
  const prod = ativos.find((p) => p.id === f.product_id);
  const saldoAtual = f.product_id
    ? (saldos.get(f.product_id) ?? { mercado: 0, agricultura: 0, total: 0 })
    : null;
  const qNum = Number(f.quantidade) || 0;

  const possivelDuplicata = useMemo(() => {
    if (!f.product_id || !(qNum > 0)) return false;
    return (movs.data ?? []).some(
      (m) =>
        m.tipo === "entrada" &&
        m.product_id === f.product_id &&
        m.data === f.data &&
        Math.abs(m.quantidade - qNum) < 0.001 &&
        m.origem === f.origem,
    );
  }, [movs.data, f.product_id, f.data, qNum, f.origem]);

  if (!escola)
    return (
      <>
        <PageHeader title="Controle de Entradas" />
        <SemEscola />
      </>
    );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(f.quantidade);
    if (!f.product_id || !(q > 0)) {
      toast.error("Informe o produto e uma quantidade recebida válida.");
      return;
    }
    if (
      possivelDuplicata &&
      !confirm(
        "A inteligência artificial identificou que já existe uma entrada idêntica (mesmo produto, data, quantidade e origem) para esta escola. Deseja registrar mesmo assim?",
      )
    ) {
      return;
    }

    setBusy(true);
    const obsFormatted = formatMovObservacoes({
      texto: f.observacoes,
      validade: f.validade,
      lote: f.lote,
    });
    const respFinal = f.responsavel.trim() || escola?.responsavel || nome || null;

    if (f.validade || f.fornecedor || f.lote) {
      setProductMeta(f.product_id, {
        ...(f.validade ? { validade: f.validade } : {}),
        ...(f.fornecedor ? { fornecedor: f.fornecedor } : {}),
        ...(f.lote ? { lote: f.lote } : {}),
      });
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const queued = await enqueueOfflineMovement({
        schoolId: escola!.id,
        schoolName: escola!.nome,
        productId: f.product_id,
        productName: prod?.nome ?? "Produto",
        tipo: "entrada",
        data: f.data,
        quantidade: q,
        origem: f.origem,
        fornecedor: f.fornecedor.trim() || null,
        nota_fiscal: f.nota_fiscal.trim() || null,
        responsavel: respFinal,
        observacoes: obsFormatted || null,
      });
      setBusy(false);
      toast.success(
        queued.deduplicated
          ? "Este lançamento já estava na fila offline (duplicidade evitada)."
          : "Sem internet: Entrada salva localmente com segurança e será sincronizada automaticamente!",
      );
      setF({
        ...f,
        product_id: "",
        quantidade: "",
        nota_fiscal: "",
        validade: "",
        lote: "",
        observacoes: "",
      });
      qc.invalidateQueries({ queryKey: ["movimentos"] });
      return;
    }

    const { error } = await supabase.from("movements").insert({
      school_id: escola!.id,
      product_id: f.product_id,
      tipo: "entrada",
      data: f.data,
      quantidade: q,
      origem: f.origem,
      fornecedor: f.fornecedor.trim() || null,
      nota_fiscal: f.nota_fiscal.trim() || null,
      responsavel: respFinal,
      observacoes: obsFormatted || null,
    });
    setBusy(false);

    if (error) {
      const msg = errMsg(error);
      if (/fetch|network|offline|failed/i.test(msg)) {
        await enqueueOfflineMovement({
          schoolId: escola!.id,
          schoolName: escola!.nome,
          productId: f.product_id,
          productName: prod?.nome ?? "Produto",
          tipo: "entrada",
          data: f.data,
          quantidade: q,
          origem: f.origem,
          fornecedor: f.fornecedor.trim() || null,
          nota_fiscal: f.nota_fiscal.trim() || null,
          responsavel: respFinal,
          observacoes: obsFormatted || null,
        });
        toast.warning(
          "Conexão instável: Entrada armazenada localmente e será sincronizada quando a rede estabilizar.",
        );
        setF({
          ...f,
          product_id: "",
          quantidade: "",
          nota_fiscal: "",
          validade: "",
          lote: "",
          observacoes: "",
        });
        qc.invalidateQueries({ queryKey: ["movimentos"] });
        return;
      }
      toast.error(msg);
      return;
    }

    toast.success("Entrada registrada e estoque atualizado automaticamente!");
    setF({
      ...f,
      product_id: "",
      quantidade: "",
      nota_fiscal: "",
      validade: "",
      lote: "",
      observacoes: "",
    });
    qc.invalidateQueries({ queryKey: ["produtos"] });
    qc.invalidateQueries({ queryKey: ["movimentos"] });
    qc.invalidateQueries({ queryKey: ["movimentos-rede"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle de Entradas"
        desc={`Recebimento de gêneros alimentícios — ${escola.nome}`}
      />
      {canWrite && (
        <Panel className="border-l-4 border-l-entrada">
          <form onSubmit={salvar} className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-1.5">
              <Label>Data de entrada *</Label>
              <Input
                type="date"
                required
                value={f.data}
                onChange={(e) => setF({ ...f, data: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Produto *</Label>
              <NSelect
                required
                value={f.product_id}
                onChange={(e) => {
                  const p = ativos.find((x) => x.id === e.target.value);
                  setF({
                    ...f,
                    product_id: e.target.value,
                    origem: p?.origem_padrao ?? f.origem,
                    fornecedor: p?.fornecedor ?? f.fornecedor,
                    validade: p?.validade ?? f.validade,
                  });
                }}
              >
                <option value="">Selecione o produto…</option>
                {ativos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({formatUnidade(p)})
                  </option>
                ))}
              </NSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Quantidade recebida {prod && `(${formatUnidade(prod)})`} *</Label>
              <Input
                type="number"
                step="any"
                min="0"
                required
                value={f.quantidade}
                onChange={(e) => setF({ ...f, quantidade: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Unidade de medida</Label>
              <Input disabled value={prod ? formatUnidade(prod) : "—"} />
            </div>
            <div className="grid gap-1.5">
              <Label>Origem do produto *</Label>
              <NSelect
                value={f.origem}
                onChange={(e) => setF({ ...f, origem: e.target.value as Origem })}
              >
                <option value="mercado">Mercado</option>
                <option value="agricultura">Agricultura Familiar</option>
              </NSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Fornecedor</Label>
              <Input
                placeholder="Nome do fornecedor ou cooperativa"
                value={f.fornecedor}
                onChange={(e) => setF({ ...f, fornecedor: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Nº da Nota Fiscal / Documento</Label>
              <Input
                placeholder="Ex.: NF 001245 / Guia 12"
                value={f.nota_fiscal}
                onChange={(e) => setF({ ...f, nota_fiscal: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Responsável pelo recebimento *</Label>
              <Input
                required
                placeholder="Nome de quem conferiu e recebeu"
                value={f.responsavel}
                onChange={(e) => setF({ ...f, responsavel: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Validade do lote (opcional)</Label>
              <Input
                type="date"
                value={f.validade}
                onChange={(e) => setF({ ...f, validade: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Lote (opcional)</Label>
              <Input
                placeholder="Código do lote"
                value={f.lote}
                onChange={(e) => setF({ ...f, lote: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={1}
                placeholder="Condições de entrega, temperatura…"
                value={f.observacoes}
                onChange={(e) => setF({ ...f, observacoes: e.target.value })}
              />
            </div>
            <div className="flex items-end md:col-span-4">
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-entrada hover:bg-entrada/90 md:w-auto"
              >
                Confirmar entrada e atualizar estoque
              </Button>
            </div>
          </form>

          {prod && saldoAtual && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-lg bg-muted px-3 py-1.5">
                Estoque anterior:{" "}
                <b>
                  {fmtQ(saldoAtual.total)} {formatUnidade(prod)}
                </b>
              </span>
              <span className="rounded-lg bg-entrada-soft px-3 py-1.5 text-entrada">
                + Entrada:{" "}
                <b>
                  {fmtQ(qNum)} {formatUnidade(prod)}
                </b>
              </span>
              <span className="rounded-lg bg-saldo-soft px-3 py-1.5 text-saldo">
                = Novo estoque disponível:{" "}
                <b>
                  {fmtQ(saldoAtual.total + qNum)} {formatUnidade(prod)}
                </b>
              </span>
            </div>
          )}

          {possivelDuplicata && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning bg-warning-soft p-3 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <b>Alerta de Inteligência:</b> Já existe um lançamento de entrada para{" "}
                <b>{prod?.nome}</b> na data <b>{f.data}</b> com a quantidade <b>{fmtQ(qNum)}</b>.
                Verifique se não se trata de lançamento duplicado antes de confirmar.
              </span>
            </div>
          )}
        </Panel>
      )}
      <MovList tipo="entrada" movs={movs.data ?? []} produtos={prods.data ?? []} />
    </div>
  );
}
