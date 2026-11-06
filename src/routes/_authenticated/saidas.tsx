import { createFileRoute, Link } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Barcode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useMovimentos, useProdutos } from "@/lib/app-context";
import {
  computeMensal,
  computeSaldos,
  FINALIDADES_SAIDA,
  fmtQ,
  formatUnidade,
  hoje,
  type Origem,
} from "@/lib/estoque";
import { enqueueOfflineMovement } from "@/lib/offline-sync";
import { NSelect, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { MovList } from "@/components/MovList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/saidas")({
  head: () =>
    pageMeta(
      "Saídas",
      "Registre a retirada e o consumo de alimentos destinados à preparação da merenda escolar com cálculo automático do saldo.",
    ),
  component: Saidas,
});

function Saidas() {
  const { escola, canWrite, nome } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const qc = useQueryClient();
  const saldos = useMemo(() => computeSaldos(movs.data ?? []), [movs.data]);
  const [f, setF] = useState({
    data: hoje(),
    product_id: "",
    quantidade: "",
    origem: "auto",
    destino: "Preparação de Almoço",
    responsavel: nome || "",
    observacoes: "",
  });
  const [busy, setBusy] = useState(false);
  const disponiveis = (prods.data ?? []).filter((p) => (saldos.get(p.id)?.total ?? 0) > 0);
  const prod = disponiveis.find((p) => p.id === f.product_id);
  const s = saldos.get(f.product_id) ?? { mercado: 0, agricultura: 0, total: 0 };
  const limite =
    f.origem === "mercado" ? s.mercado : f.origem === "agricultura" ? s.agricultura : s.total;
  const q = Number(f.quantidade) || 0;
  const excede = q > limite;

  const resumoFormula = useMemo(() => {
    if (!f.product_id || !prods.data || !movs.data) return null;
    const anoRef = Number(f.data.slice(0, 4)) || new Date().getFullYear();
    const mesRef = Number(f.data.slice(5, 7)) || new Date().getMonth() + 1;
    const mensal = computeMensal(prods.data, movs.data, anoRef, mesRef);
    return mensal.find((m) => m.product_id === f.product_id) ?? null;
  }, [f.product_id, f.data, prods.data, movs.data]);

  if (!escola)
    return (
      <>
        <PageHeader title="Controle de Saídas" />
        <SemEscola />
      </>
    );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.product_id || !(q > 0)) {
      toast.error("Informe o produto e uma quantidade retirada válida.");
      return;
    }
    if (excede) {
      toast.error(`Quantidade superior ao disponível (${fmtQ(limite)})`);
      return;
    }
    setBusy(true);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const queued = await enqueueOfflineMovement({
        schoolId: escola!.id,
        schoolName: escola!.nome,
        productId: f.product_id,
        productName: prod?.nome ?? "Produto",
        tipo: "saida",
        data: f.data,
        quantidade: q,
        origem: f.origem as Origem | "auto",
        destino: f.destino || "Preparação da merenda",
        responsavel: f.responsavel || nome || "",
        observacoes: f.observacoes || "",
      });
      setBusy(false);
      toast.success(
        queued.deduplicated
          ? "Esta saída já estava na fila offline (duplicidade evitada)."
          : "Sem internet: Saída salva localmente com segurança e será sincronizada automaticamente!",
      );
      setF({ ...f, product_id: "", quantidade: "", observacoes: "" });
      qc.invalidateQueries({ queryKey: ["movimentos"] });
      return;
    }

    const { error } = await supabase.rpc("registrar_saida", {
      _school: escola!.id,
      _product: f.product_id,
      _data: f.data,
      _quantidade: q,
      _origem: f.origem,
      _destino: f.destino || "Preparação da merenda",
      _responsavel: f.responsavel || nome || "",
      _observacoes: f.observacoes || "",
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
          tipo: "saida",
          data: f.data,
          quantidade: q,
          origem: f.origem as Origem | "auto",
          destino: f.destino || "Preparação da merenda",
          responsavel: f.responsavel || nome || "",
          observacoes: f.observacoes || "",
        });
        toast.warning(
          "Conexão instável: Saída armazenada localmente e será sincronizada quando a rede estabilizar.",
        );
        setF({ ...f, product_id: "", quantidade: "", observacoes: "" });
        qc.invalidateQueries({ queryKey: ["movimentos"] });
        return;
      }
      toast.error(msg);
      return;
    }
    toast.success(
      `Saída registrada. Saldo disponível atualizado: ${fmtQ(s.total - q)} ${prod ? formatUnidade(prod) : ""}`,
    );
    setF({ ...f, product_id: "", quantidade: "", observacoes: "" });
    qc.invalidateQueries({ queryKey: ["movimentos"] });
    qc.invalidateQueries({ queryKey: ["movimentos-rede"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle de Saídas"
        desc={`Retirada e uso na alimentação escolar — ${escola.nome}`}
      >
        <Button asChild className="bg-saida text-white hover:bg-saida/90">
          <Link to="/saida-rapida">
            <Barcode className="h-4 w-4" /> Saída Rápida por Código de Barras
          </Link>
        </Button>
      </PageHeader>
      {canWrite && (
        <Panel className="border-l-4 border-l-saida">
          <form onSubmit={salvar} className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-1.5">
              <Label>Data da saída *</Label>
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
                onChange={(e) => setF({ ...f, product_id: e.target.value })}
              >
                <option value="">Selecione o produto disponível…</option>
                {disponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — Disponível: {fmtQ(saldos.get(p.id)!.total)} {formatUnidade(p)}
                  </option>
                ))}
              </NSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Quantidade retirada {prod && `(${formatUnidade(prod)})`} *</Label>
              <Input
                type="number"
                step="any"
                min="0"
                required
                value={f.quantidade}
                onChange={(e) => setF({ ...f, quantidade: e.target.value })}
                className={excede ? "border-destructive" : ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Unidade de medida</Label>
              <Input disabled value={prod ? formatUnidade(prod) : "—"} />
            </div>
            <div className="grid gap-1.5">
              <Label>Escola de destino *</Label>
              <Input disabled value={escola.nome} />
            </div>
            <div className="grid gap-1.5">
              <Label>Finalidade da saída *</Label>
              <Input
                required
                list="finalidades-saida-list"
                value={f.destino}
                onChange={(e) => setF({ ...f, destino: e.target.value })}
                placeholder="Ex.: Almoço, Lanche da Manhã…"
              />
              <datalist id="finalidades-saida-list">
                {FINALIDADES_SAIDA.map((fin) => (
                  <option key={fin} value={fin} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-1.5">
              <Label>Responsável pela retirada *</Label>
              <Input
                required
                value={f.responsavel}
                onChange={(e) => setF({ ...f, responsavel: e.target.value })}
                placeholder="Nome do responsável"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Origem da retirada</Label>
              <NSelect value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })}>
                <option value="auto">Automática (Mercado primeiro)</option>
                <option value="mercado">Mercado</option>
                <option value="agricultura">Agricultura Familiar</option>
              </NSelect>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                rows={1}
                value={f.observacoes}
                onChange={(e) => setF({ ...f, observacoes: e.target.value })}
                placeholder="Turno, cardápio atendido, observações…"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={busy || excede}
                className="w-full bg-saida hover:bg-saida/90"
              >
                Registrar saída
              </Button>
            </div>
          </form>

          {prod && (
            <div className="mt-4 space-y-2 border-t pt-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-lg bg-mercado-soft px-3 py-1.5 text-mercado">
                  Mercado disponível: <b>{fmtQ(s.mercado)}</b>
                </span>
                <span className="rounded-lg bg-agricultura-soft px-3 py-1.5 text-agricultura">
                  Agric. Familiar disponível: <b>{fmtQ(s.agricultura)}</b>
                </span>
                <span className="rounded-lg bg-saldo-soft px-3 py-1.5 text-saldo">
                  Saldo após retirada:{" "}
                  <b>
                    {fmtQ(Math.max(0, s.total - q))} {formatUnidade(prod)}
                  </b>
                </span>
                {excede && (
                  <span className="rounded-lg bg-saida-soft px-3 py-1.5 font-semibold text-destructive">
                    Quantidade maior que o saldo disponível ({fmtQ(limite)})
                  </span>
                )}
              </div>
              {resumoFormula && (
                <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  <b>Fórmula do período (Estoque atual = Estoque anterior + Entradas − Saídas):</b>{" "}
                  Estoque anterior ({fmtQ(resumoFormula.ant_t)}) + Entradas (
                  {fmtQ(resumoFormula.ent_t)}) − Saídas com esta retirada (
                  {fmtQ(resumoFormula.sai_t + q)}) ={" "}
                  <b className="text-foreground">
                    {fmtQ(
                      Math.max(
                        0,
                        resumoFormula.ant_t + resumoFormula.ent_t - (resumoFormula.sai_t + q),
                      ),
                    )}{" "}
                    {formatUnidade(prod)}
                  </b>
                </div>
              )}
            </div>
          )}
        </Panel>
      )}
      <MovList tipo="saida" movs={movs.data ?? []} produtos={prods.data ?? []} />
    </div>
  );
}
