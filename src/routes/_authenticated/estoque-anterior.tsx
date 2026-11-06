import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useMovimentos, useProdutos } from "@/lib/app-context";
import {
  CATEGORIAS,
  computeResumoEstoqueAnterior,
  ESTOQUE_ANTERIOR_TAG,
  fmtData,
  fmtQ,
  formatMovObservacoes,
  formatUnidade,
  hoje,
  isSaldoInicial,
  mapToDbUnidade,
  ORIGEM_LABEL,
  parseMovObservacoes,
  setProductMeta,
  UNIDADE_APRESENTACAO_LABEL,
  UNIDADES_APRESENTACAO,
  type Movimento,
  type Origem,
  type ResumoEstoqueAnterior,
  type UnidadeApresentacao,
} from "@/lib/estoque";
import { enqueueOfflineMovement } from "@/lib/offline-sync";
import { DocView } from "@/components/DocView";
import { NSelect, OrigemBadge, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "entrada" | "saida";
}) {
  const color =
    tone === "primary"
      ? "text-primary"
      : tone === "entrada"
        ? "text-entrada"
        : tone === "saida"
          ? "text-saida"
          : "text-foreground";
  return (
    <Panel className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1.5 font-display text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Panel>
  );
}

export const Route = createFileRoute("/_authenticated/estoque-anterior")({
  head: () =>
    pageMeta(
      "Estoque Anterior (Saldo Inicial)",
      "Registre manualmente os produtos que já existem no estoque da unidade escolar antes do início da utilização do aplicativo, com divisão por origem, integração em tempo real e relatório oficial.",
    ),
  component: EstoqueAnteriorPage,
});

interface DraftItem {
  key: string;
  modoProduto: "existente" | "novo";
  product_id: string;
  novo_nome: string;
  categoria: string;
  unidade_apresentacao: UnidadeApresentacao;
  modoOrigem: "dividido" | "mercado" | "agricultura";
  qtd_mercado: string;
  qtd_agricultura: string;
  qtd_unica: string;
  data: string;
  responsavel: string;
  observacoes: string;
}

export interface EstoqueAnteriorAuditEntry {
  id: string;
  schoolId: string;
  schoolName: string;
  timestamp: string;
  responsavel: string;
  acao: "inclusao" | "edicao_autorizada" | "exclusao_autorizada" | "duplicidade_autorizada";
  produtoNome: string;
  detalhes: string;
  justificativa?: string;
}

const AUDIT_STORAGE_KEY = "merenda_estoque_anterior_audit_v1";

function loadEstoqueAnteriorAudit(schoolId?: string): EstoqueAnteriorAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AUDIT_STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as EstoqueAnteriorAuditEntry[]) : [];
    return schoolId ? list.filter((x) => x.schoolId === schoolId) : list;
  } catch {
    return [];
  }
}

function appendEstoqueAnteriorAudit(entry: Omit<EstoqueAnteriorAuditEntry, "id" | "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    const all = loadEstoqueAnteriorAudit();
    const record: EstoqueAnteriorAuditEntry = {
      ...entry,
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    all.unshift(record);
    window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(all.slice(0, 500)));
  } catch {
    // ignore storage errors
  }
}

function criarDraftItem(defaultResp: string, defaultDate?: string): DraftItem {
  return {
    key:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    modoProduto: "existente",
    product_id: "",
    novo_nome: "",
    categoria: "Cereais",
    unidade_apresentacao: "kg",
    modoOrigem: "dividido",
    qtd_mercado: "",
    qtd_agricultura: "",
    qtd_unica: "",
    data: defaultDate || hoje(),
    responsavel: defaultResp,
    observacoes: "",
  };
}

function EstoqueAnteriorPage() {
  const { escola, canWrite, isAdmin, nome } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const qc = useQueryClient();

  const [aba, setAba] = useState<"cadastro" | "gerenciar" | "relatorio" | "auditoria">("cadastro");
  const [dataPadrao, setDataPadrao] = useState(hoje());
  const [responsavelPadrao, setResponsavelPadrao] = useState(nome || escola?.responsavel || "");
  const [items, setItems] = useState<DraftItem[]>(() => [
    criarDraftItem(nome || escola?.responsavel || "", hoje()),
  ]);
  const [busy, setBusy] = useState(false);

  // Modal de autorização para duplicidade de estoque anterior
  const [dupAuthModal, setDupAuthModal] = useState<{
    open: boolean;
    produtosDuplicados: string[];
    justificativa: string;
    autorizador: string;
  } | null>(null);

  // Modal de edição autorizada de lançamento existente
  const [editModal, setEditModal] = useState<{
    movimento?: Movimento;
    resumo?: ResumoEstoqueAnterior;
    modo: "resumo" | "movimento";
    nomeProduto: string;
    categoria: string;
    unidade_apresentacao: UnidadeApresentacao;
    qtd_mercado: string;
    qtd_agricultura: string;
    qtd_unica: string;
    origem_unica: Origem;
    data: string;
    responsavel: string;
    observacoes: string;
    justificativa: string;
  } | null>(null);

  // Modal de exclusão autorizada
  const [deleteModal, setDeleteModal] = useState<{
    movimentoIds: string[];
    produtoNome: string;
    justificativa: string;
    responsavel: string;
  } | null>(null);

  const [auditVersion, setAuditVersion] = useState(0);

  const produtosLista = useMemo(() => prods.data ?? [], [prods.data]);
  const pmap = useMemo(() => new Map(produtosLista.map((p) => [p.id, p])), [produtosLista]);

  const resumos = useMemo(
    () => computeResumoEstoqueAnterior(produtosLista, movs.data ?? []),
    [produtosLista, movs.data],
  );

  const lancamentosSaldoInicial = useMemo(
    () =>
      (movs.data ?? [])
        .filter((m) => m.tipo === "entrada" && isSaldoInicial(m))
        .slice()
        .reverse(),
    [movs.data],
  );

  const auditLogs = useMemo(() => {
    void auditVersion;
    return loadEstoqueAnteriorAudit(escola?.id);
  }, [escola?.id, auditVersion]);

  const totaisGerais = useMemo(() => {
    let mercado = 0;
    let agricultura = 0;
    let inicial = 0;
    let saldoAtual = 0;
    for (const r of resumos) {
      mercado += r.quantidade_mercado;
      agricultura += r.quantidade_agricultura;
      inicial += r.quantidade_inicial;
      saldoAtual += r.saldo_atual;
    }
    return {
      produtosComSaldoInicial: resumos.length,
      mercado: Math.round(mercado * 1000) / 1000,
      agricultura: Math.round(agricultura * 1000) / 1000,
      inicial: Math.round(inicial * 1000) / 1000,
      saldoAtual: Math.round(saldoAtual * 1000) / 1000,
    };
  }, [resumos]);

  if (!escola) {
    return (
      <>
        <PageHeader title="Estoque Anterior (Saldo Inicial)" />
        <SemEscola />
      </>
    );
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function addItemRow() {
    setItems((prev) => [...prev, criarDraftItem(responsavelPadrao || nome || "", dataPadrao)]);
  }

  function removeItemRow(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  function calcTotalItem(it: DraftItem): { m: number; a: number; total: number } {
    if (it.modoOrigem === "dividido") {
      const m = Math.max(0, Number(it.qtd_mercado) || 0);
      const a = Math.max(0, Number(it.qtd_agricultura) || 0);
      return { m, a, total: Math.round((m + a) * 1000) / 1000 };
    }
    const u = Math.max(0, Number(it.qtd_unica) || 0);
    return it.modoOrigem === "mercado" ? { m: u, a: 0, total: u } : { m: 0, a: u, total: u };
  }

  function detectarDuplicidades(): string[] {
    const duplicados: string[] = [];
    for (const it of items) {
      const { m, a, total } = calcTotalItem(it);
      if (total <= 0) continue;
      let prodId = it.product_id;
      let prodNome = "";
      if (it.modoProduto === "existente") {
        const p = pmap.get(it.product_id);
        prodNome = p?.nome ?? "";
      } else {
        const existente = produtosLista.find(
          (p) => p.nome.trim().toLowerCase() === it.novo_nome.trim().toLowerCase(),
        );
        if (existente) {
          prodId = existente.id;
          prodNome = existente.nome;
        } else {
          prodNome = it.novo_nome.trim();
        }
      }
      if (!prodId) continue;

      const jaTemMercado =
        m > 0 &&
        lancamentosSaldoInicial.some((x) => x.product_id === prodId && x.origem === "mercado");
      const jaTemAgric =
        a > 0 &&
        lancamentosSaldoInicial.some((x) => x.product_id === prodId && x.origem === "agricultura");

      if (jaTemMercado || jaTemAgric) {
        duplicados.push(prodNome || "Produto selecionado");
      }
    }
    return Array.from(new Set(duplicados));
  }

  async function handleSubmitCadastro(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite && !isAdmin) {
      toast.error("Apenas usuários autorizados podem registrar o Estoque Anterior.");
      return;
    }

    // Validar linhas preenchidas
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      const { total } = calcTotalItem(it);
      if (it.modoProduto === "existente" && !it.product_id) {
        toast.error(`Item #${i + 1}: Selecione um produto cadastrado ou escolha "Novo produto".`);
        return;
      }
      if (it.modoProduto === "novo" && !it.novo_nome.trim()) {
        toast.error(`Item #${i + 1}: Informe o nome do novo produto.`);
        return;
      }
      if (!(total > 0)) {
        toast.error(
          `Item #${i + 1}: Informe uma quantidade existente maior que zero (Mercado e/ou Agricultura Familiar).`,
        );
        return;
      }
      if (!it.data) {
        toast.error(`Item #${i + 1}: Informe a data de referência do levantamento.`);
        return;
      }
    }

    const duplicados = detectarDuplicidades();
    if (duplicados.length > 0) {
      setDupAuthModal({
        open: true,
        produtosDuplicados: duplicados,
        justificativa: "",
        autorizador: responsavelPadrao || nome || "",
      });
      return;
    }

    await efetivarSalvamento();
  }

  async function efetivarSalvamento(autorizacaoDuplicidade?: {
    autorizador: string;
    justificativa: string;
  }) {
    setBusy(true);
    try {
      let lancamentosCriados = 0;

      for (const it of items) {
        const { m, a, total } = calcTotalItem(it);
        if (total <= 0) continue;

        let prodId = it.product_id;
        let prodNome = "";
        let categoriaFinal = it.categoria;
        let unidadeFinal = it.unidade_apresentacao;

        if (it.modoProduto === "existente") {
          const p = pmap.get(it.product_id);
          if (!p) continue;
          prodId = p.id;
          prodNome = p.nome;
          categoriaFinal = it.categoria || p.categoria;
          unidadeFinal = it.unidade_apresentacao || p.unidade_apresentacao || p.unidade;
          // Atualiza metadados de categoria/unidade de apresentação caso o usuário tenha ajustado
          setProductMeta(prodId, {
            unidade_apresentacao: unidadeFinal,
          });
        } else {
          const nomeLimpo = it.novo_nome.trim();
          const existente = produtosLista.find(
            (p) => p.nome.trim().toLowerCase() === nomeLimpo.toLowerCase(),
          );
          if (existente) {
            prodId = existente.id;
            prodNome = existente.nome;
            setProductMeta(prodId, { unidade_apresentacao: unidadeFinal });
          } else {
            const dbUnidade = mapToDbUnidade(unidadeFinal);
            const origemPadrao: Origem = a > m ? "agricultura" : "mercado";
            const { data: created, error: prodErr } = await supabase
              .from("products")
              .insert({
                nome: nomeLimpo,
                unidade: dbUnidade,
                categoria: categoriaFinal || "Outros",
                origem_padrao: origemPadrao,
                ativo: true,
                estoque_minimo: 0,
              })
              .select("id, nome")
              .single();

            if (prodErr || !created) {
              throw new Error(
                `Não foi possível cadastrar o produto "${nomeLimpo}": ${errMsg(prodErr)}`,
              );
            }
            prodId = created.id;
            prodNome = created.nome;
            setProductMeta(prodId, {
              unidade_apresentacao: unidadeFinal,
            });
          }
        }

        const respFinal =
          it.responsavel.trim() || responsavelPadrao.trim() || escola?.responsavel || nome || null;
        const obsTexto = [
          it.observacoes.trim(),
          autorizacaoDuplicidade
            ? `Autorizado por ${autorizacaoDuplicidade.autorizador}: ${autorizacaoDuplicidade.justificativa}`
            : "",
        ]
          .filter(Boolean)
          .join(" | ");

        const obsFormatted = formatMovObservacoes({
          texto: obsTexto ? `[ESTOQUE_ANTERIOR] ${obsTexto}` : "[ESTOQUE_ANTERIOR]",
          saldoInicial: true,
        });

        const origensParaInserir: { origem: Origem; quantidade: number }[] = [];
        if (m > 0) origensParaInserir.push({ origem: "mercado", quantidade: m });
        if (a > 0) origensParaInserir.push({ origem: "agricultura", quantidade: a });

        for (const orig of origensParaInserir) {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            await enqueueOfflineMovement({
              schoolId: escola!.id,
              schoolName: escola!.nome,
              productId: prodId,
              productName: prodNome,
              tipo: "entrada",
              data: it.data,
              quantidade: orig.quantidade,
              origem: orig.origem,
              fornecedor: "Estoque Anterior (Levantamento Manual)",
              nota_fiscal: ESTOQUE_ANTERIOR_TAG,
              destino: "SALDO_INICIAL",
              responsavel: respFinal,
              observacoes: obsFormatted,
            });
            lancamentosCriados++;
            continue;
          }

          const { error: movErr } = await supabase.from("movements").insert({
            school_id: escola!.id,
            product_id: prodId,
            tipo: "entrada",
            data: it.data,
            quantidade: orig.quantidade,
            origem: orig.origem,
            fornecedor: "Estoque Anterior (Levantamento Manual)",
            nota_fiscal: ESTOQUE_ANTERIOR_TAG,
            destino: "SALDO_INICIAL",
            responsavel: respFinal,
            observacoes: obsFormatted,
          });

          if (movErr) {
            throw new Error(errMsg(movErr));
          }
          lancamentosCriados++;
        }

        appendEstoqueAnteriorAudit({
          schoolId: escola!.id,
          schoolName: escola!.nome,
          responsavel: respFinal ?? "Usuário autenticado",
          acao: autorizacaoDuplicidade ? "duplicidade_autorizada" : "inclusao",
          produtoNome: prodNome,
          detalhes: `Estoque Inicial: ${fmtQ(total)} ${UNIDADE_APRESENTACAO_LABEL[unidadeFinal]} (Mercado: ${fmtQ(m)} | Agric. Familiar: ${fmtQ(a)}) — Ref.: ${fmtData(it.data)}`,
          justificativa:
            autorizacaoDuplicidade?.justificativa || it.observacoes.trim() || undefined,
        });
      }

      setAuditVersion((v) => v + 1);
      setDupAuthModal(null);
      setItems([criarDraftItem(responsavelPadrao || nome || "", dataPadrao)]);
      toast.success(
        `${lancamentosCriados} lançamento(s) de Estoque Anterior incorporado(s) ao saldo disponível com sucesso!`,
      );
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["movimentos"] });
      qc.invalidateQueries({ queryKey: ["movimentos-rede"] });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  function abrirEdicaoResumo(r: ResumoEstoqueAnterior) {
    const p = pmap.get(r.product_id);
    setEditModal({
      resumo: r,
      modo: "resumo",
      nomeProduto: r.nome,
      categoria: p?.categoria ?? r.categoria,
      unidade_apresentacao: p?.unidade_apresentacao ?? p?.unidade ?? "kg",
      qtd_mercado: String(r.quantidade_mercado),
      qtd_agricultura: String(r.quantidade_agricultura),
      qtd_unica: String(r.quantidade_inicial),
      origem_unica: "mercado",
      data: r.data_levantamento || hoje(),
      responsavel: r.responsavel || nome || "",
      observacoes: r.observacoes || "",
      justificativa: "",
    });
  }

  function abrirEdicaoMovimento(m: Movimento) {
    const p = pmap.get(m.product_id);
    const parsed = parseMovObservacoes(m.observacoes);
    setEditModal({
      movimento: m,
      modo: "movimento",
      nomeProduto: p?.nome ?? "Produto",
      categoria: p?.categoria ?? "Cereais",
      unidade_apresentacao: p?.unidade_apresentacao ?? p?.unidade ?? "kg",
      qtd_mercado: m.origem === "mercado" ? String(m.quantidade) : "0",
      qtd_agricultura: m.origem === "agricultura" ? String(m.quantidade) : "0",
      qtd_unica: String(m.quantidade),
      origem_unica: m.origem,
      data: m.data,
      responsavel: m.responsavel || nome || "",
      observacoes: parsed.texto,
      justificativa: "",
    });
  }

  async function salvarEdicaoAutorizada(e: React.FormEvent) {
    e.preventDefault();
    if (!editModal) return;
    if (!canWrite && !isAdmin) {
      toast.error("Somente usuários autorizados podem corrigir o saldo inicial.");
      return;
    }
    if (!editModal.justificativa.trim()) {
      toast.error("Informe o motivo/justificativa da correção para registro na auditoria.");
      return;
    }

    setBusy(true);
    try {
      const obsFormatted = formatMovObservacoes({
        texto:
          `[ESTOQUE_ANTERIOR] ${editModal.observacoes.trim()} (Corrigido por ${editModal.responsavel}: ${editModal.justificativa.trim()})`.trim(),
        saldoInicial: true,
      });

      if (editModal.modo === "movimento" && editModal.movimento) {
        const q = Number(editModal.qtd_unica);
        if (!(q > 0)) {
          toast.error("Informe uma quantidade inicial maior que zero.");
          setBusy(false);
          return;
        }
        const prodId = editModal.movimento.product_id;
        await supabase
          .from("products")
          .update({
            categoria: editModal.categoria,
            unidade: mapToDbUnidade(editModal.unidade_apresentacao),
          })
          .eq("id", prodId);
        setProductMeta(prodId, { unidade_apresentacao: editModal.unidade_apresentacao });

        const { error } = await supabase
          .from("movements")
          .update({
            quantidade: q,
            origem: editModal.origem_unica,
            data: editModal.data,
            responsavel: editModal.responsavel.trim() || nome || null,
            observacoes: obsFormatted,
          })
          .eq("id", editModal.movimento.id);

        if (error) throw new Error(errMsg(error));

        appendEstoqueAnteriorAudit({
          schoolId: escola!.id,
          schoolName: escola!.nome,
          responsavel: editModal.responsavel.trim() || nome || "Usuário autorizado",
          acao: "edicao_autorizada",
          produtoNome: editModal.nomeProduto,
          detalhes: `Quantidade anterior: ${fmtQ(editModal.movimento.quantidade)} → Nova quantidade: ${fmtQ(q)} (${ORIGEM_LABEL[editModal.origem_unica]}) — Data ref.: ${fmtData(editModal.data)}`,
          justificativa: editModal.justificativa.trim(),
        });
      } else if (editModal.modo === "resumo" && editModal.resumo) {
        const qM = Math.max(0, Number(editModal.qtd_mercado) || 0);
        const qA = Math.max(0, Number(editModal.qtd_agricultura) || 0);
        if (qM + qA <= 0) {
          toast.error(
            "A soma das quantidades (Mercado + Agricultura Familiar) deve ser maior que zero.",
          );
          setBusy(false);
          return;
        }
        const prodId = editModal.resumo.product_id;
        await supabase
          .from("products")
          .update({
            categoria: editModal.categoria,
            unidade: mapToDbUnidade(editModal.unidade_apresentacao),
          })
          .eq("id", prodId);
        setProductMeta(prodId, { unidade_apresentacao: editModal.unidade_apresentacao });

        // Remove os registros anteriores de saldo inicial deste produto na escola e recria consolidado
        const idsAntigos = lancamentosSaldoInicial
          .filter((x) => x.product_id === prodId)
          .map((x) => x.id);

        if (idsAntigos.length > 0) {
          const { error: delErr } = await supabase.from("movements").delete().in("id", idsAntigos);
          if (delErr) throw new Error(errMsg(delErr));
        }

        const novos: { origem: Origem; quantidade: number }[] = [];
        if (qM > 0) novos.push({ origem: "mercado", quantidade: qM });
        if (qA > 0) novos.push({ origem: "agricultura", quantidade: qA });

        for (const item of novos) {
          const { error: insErr } = await supabase.from("movements").insert({
            school_id: escola!.id,
            product_id: prodId,
            tipo: "entrada",
            data: editModal.data,
            quantidade: item.quantidade,
            origem: item.origem,
            fornecedor: "Estoque Anterior (Levantamento Manual)",
            nota_fiscal: ESTOQUE_ANTERIOR_TAG,
            destino: "SALDO_INICIAL",
            responsavel: editModal.responsavel.trim() || nome || null,
            observacoes: obsFormatted,
          });
          if (insErr) throw new Error(errMsg(insErr));
        }

        appendEstoqueAnteriorAudit({
          schoolId: escola!.id,
          schoolName: escola!.nome,
          responsavel: editModal.responsavel.trim() || nome || "Usuário autorizado",
          acao: "edicao_autorizada",
          produtoNome: editModal.nomeProduto,
          detalhes: `Anterior: ${fmtQ(editModal.resumo.quantidade_inicial)} (M: ${fmtQ(editModal.resumo.quantidade_mercado)} | AF: ${fmtQ(editModal.resumo.quantidade_agricultura)}) → Novo: ${fmtQ(qM + qA)} (M: ${fmtQ(qM)} | AF: ${fmtQ(qA)})`,
          justificativa: editModal.justificativa.trim(),
        });
      }

      setAuditVersion((v) => v + 1);
      setEditModal(null);
      toast.success("Saldo inicial atualizado e registrado no histórico de auditoria!");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["movimentos"] });
      qc.invalidateQueries({ queryKey: ["movimentos-rede"] });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmarExclusaoAutorizada(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteModal) return;
    if (!canWrite && !isAdmin) {
      toast.error("Somente usuários autorizados podem excluir lançamentos de estoque anterior.");
      return;
    }
    if (!deleteModal.justificativa.trim()) {
      toast.error("Informe a justificativa da exclusão para registro permanente na auditoria.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase
        .from("movements")
        .delete()
        .in("id", deleteModal.movimentoIds);
      if (error) throw new Error(errMsg(error));

      appendEstoqueAnteriorAudit({
        schoolId: escola!.id,
        schoolName: escola!.nome,
        responsavel: deleteModal.responsavel.trim() || nome || "Usuário autorizado",
        acao: "exclusao_autorizada",
        produtoNome: deleteModal.produtoNome,
        detalhes: `${deleteModal.movimentoIds.length} lançamento(s) de Estoque Anterior removido(s).`,
        justificativa: deleteModal.justificativa.trim(),
      });

      setAuditVersion((v) => v + 1);
      setDeleteModal(null);
      toast.success("Lançamento de Estoque Anterior excluído e registrado na auditoria.");
      qc.invalidateQueries({ queryKey: ["movimentos"] });
      qc.invalidateQueries({ queryKey: ["movimentos-rede"] });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  // Colunas e linhas do Relatório Oficial de Estoque Anterior (Seção 4)
  const relatorioColumns = [
    "Nome dos Produtos",
    "Quantidade Inicial",
    "Unidade de Medida",
    "Qtd. Mercado",
    "Qtd. Agricultura Familiar",
    "Data do Levantamento",
    "Responsável pelo Lançamento",
  ];

  const relatorioRows = resumos.map((r) => [
    r.nome,
    r.quantidade_inicial,
    r.unidade,
    r.quantidade_mercado,
    r.quantidade_agricultura,
    fmtData(r.data_levantamento),
    r.responsavel || escola.responsavel || nome || "—",
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque Anterior (Saldo Inicial / Abertura)"
        desc={`Registre manualmente os produtos que já estavam armazenados na unidade escolar (${escola.nome}) antes do início do uso do aplicativo`}
      />

      {/* Indicadores de Integração em Tempo Real */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          label="Produtos com Saldo Inicial"
          value={totaisGerais.produtosComSaldoInicial}
          hint="Itens abertos no levantamento"
        />
        <Kpi
          label="Estoque Inicial Total"
          value={fmtQ(totaisGerais.inicial)}
          tone="primary"
          hint="Mercado + Agricultura Familiar"
        />
        <Kpi
          label="Origem Mercado"
          value={fmtQ(totaisGerais.mercado)}
          hint="Saldo de abertura (Mercado)"
        />
        <Kpi
          label="Origem Agric. Familiar"
          value={fmtQ(totaisGerais.agricultura)}
          tone="entrada"
          hint="Saldo de abertura (PNAE / AF)"
        />
        <Kpi
          label="Saldo Atual Integrado"
          value={fmtQ(totaisGerais.saldoAtual)}
          tone="entrada"
          hint="Inicial + Entradas − Saídas"
        />
      </div>

      {/* Navegação em Abas */}
      <div className="no-print flex flex-wrap gap-2 border-b pb-3">
        <Button
          variant={aba === "cadastro" ? "default" : "outline"}
          onClick={() => setAba("cadastro")}
        >
          <Plus className="h-4 w-4" /> 1. Lançar Estoque Anterior
        </Button>
        <Button
          variant={aba === "gerenciar" ? "default" : "outline"}
          onClick={() => setAba("gerenciar")}
        >
          <ClipboardList className="h-4 w-4" /> 2. Saldo Integrado e Correções ({resumos.length})
        </Button>
        <Button
          variant={aba === "relatorio" ? "default" : "outline"}
          onClick={() => setAba("relatorio")}
        >
          <FileText className="h-4 w-4" /> 3. Relatório de Estoque Anterior (PDF / Excel)
        </Button>
        <Button
          variant={aba === "auditoria" ? "default" : "outline"}
          onClick={() => setAba("auditoria")}
        >
          <History className="h-4 w-4" /> 4. Histórico e Auditoria ({auditLogs.length})
        </Button>
      </div>

      {/* ABA 1: CADASTRO MANUAL DO ESTOQUE ANTERIOR */}
      {aba === "cadastro" && (
        <div className="space-y-4">
          <Panel className="border-l-4 border-l-primary bg-primary/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2 font-display text-base font-bold text-primary">
                  <ArchiveRestore className="h-5 w-5" /> Como funciona o Estoque Anterior (Saldo de
                  Abertura)
                </div>
                <p className="text-muted-foreground">
                  Os produtos lançados aqui são identificados como{" "}
                  <b>Saldo Inicial / Estoque de Abertura</b>. Eles{" "}
                  <b>não são somados como compras/entradas do mês atual</b>, mas sim incorporados
                  automaticamente como <b>Estoque Anterior</b>, servindo de ponto de partida para
                  somar novas entradas e subtrair saídas em tempo real.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Data padrão do levantamento</Label>
                  <Input
                    type="date"
                    value={dataPadrao}
                    onChange={(e) => {
                      const d = e.target.value;
                      setDataPadrao(d);
                      setItems((prev) => prev.map((it) => ({ ...it, data: d })));
                    }}
                    className="h-9 w-40 bg-card"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Responsável pelo levantamento</Label>
                  <Input
                    placeholder="Nome do responsável"
                    value={responsavelPadrao}
                    onChange={(e) => {
                      const r = e.target.value;
                      setResponsavelPadrao(r);
                      setItems((prev) => prev.map((it) => ({ ...it, responsavel: r })));
                    }}
                    className="h-9 w-56 bg-card"
                  />
                </div>
              </div>
            </div>
          </Panel>

          <form onSubmit={handleSubmitCadastro} className="space-y-4">
            {items.map((it, idx) => {
              const pSel = it.modoProduto === "existente" ? pmap.get(it.product_id) : undefined;
              const { m, a, total } = calcTotalItem(it);
              const resumoExistente =
                it.modoProduto === "existente" && it.product_id
                  ? resumos.find((r) => r.product_id === it.product_id)
                  : undefined;

              return (
                <Panel key={it.key} className="space-y-4 border-l-4 border-l-entrada">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {idx + 1}
                      </span>
                      <h3 className="font-display text-sm font-bold">
                        Produto #{idx + 1} do Levantamento de Estoque Anterior
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-lg border bg-muted p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => updateItem(it.key, { modoProduto: "existente" })}
                          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                            it.modoProduto === "existente"
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground"
                          }`}
                        >
                          Selecionar produto cadastrado
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateItem(it.key, { modoProduto: "novo", product_id: "" })
                          }
                          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                            it.modoProduto === "novo"
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground"
                          }`}
                        >
                          + Cadastrar novo produto
                        </button>
                      </div>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeItemRow(it.key)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" /> Remover
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Linha 1: Produto, Categoria e Unidade de Medida */}
                  <div className="grid gap-3 md:grid-cols-4">
                    {it.modoProduto === "existente" ? (
                      <div className="grid gap-1.5 md:col-span-2">
                        <Label>Nome do produto *</Label>
                        <NSelect
                          required
                          value={it.product_id}
                          onChange={(e) => {
                            const prod = pmap.get(e.target.value);
                            updateItem(it.key, {
                              product_id: e.target.value,
                              categoria: prod?.categoria ?? it.categoria,
                              unidade_apresentacao:
                                prod?.unidade_apresentacao ??
                                prod?.unidade ??
                                it.unidade_apresentacao,
                            });
                          }}
                        >
                          <option value="">Selecione um produto do catálogo…</option>
                          {produtosLista.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome} ({formatUnidade(p)} — {p.categoria})
                            </option>
                          ))}
                        </NSelect>
                      </div>
                    ) : (
                      <div className="grid gap-1.5 md:col-span-2">
                        <Label>Nome do novo produto *</Label>
                        <Input
                          required
                          placeholder="Ex.: Ovos de Galinha / Feijão Carioca / Óleo de Soja"
                          value={it.novo_nome}
                          onChange={(e) => updateItem(it.key, { novo_nome: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="grid gap-1.5">
                      <Label>Categoria do produto *</Label>
                      <NSelect
                        value={it.categoria}
                        onChange={(e) => updateItem(it.key, { categoria: e.target.value })}
                      >
                        {CATEGORIAS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </NSelect>
                    </div>

                    <div className="grid gap-1.5">
                      <Label>Unidade de medida *</Label>
                      <NSelect
                        value={it.unidade_apresentacao}
                        onChange={(e) =>
                          updateItem(it.key, {
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
                  </div>

                  {/* Linha 2: Origem e Quantidades (Mercado / Agricultura Familiar / Dividido) */}
                  <div className="rounded-lg border bg-muted/30 p-3.5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Origem do Produto e Quantidade Existente Anteriormente
                      </Label>
                      <div className="inline-flex rounded-lg border bg-card p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => updateItem(it.key, { modoOrigem: "dividido" })}
                          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                            it.modoOrigem === "dividido"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          Dividir: Mercado + Agricultura Familiar
                        </button>
                        <button
                          type="button"
                          onClick={() => updateItem(it.key, { modoOrigem: "mercado" })}
                          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                            it.modoOrigem === "mercado"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          Apenas Mercado
                        </button>
                        <button
                          type="button"
                          onClick={() => updateItem(it.key, { modoOrigem: "agricultura" })}
                          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                            it.modoOrigem === "agricultura"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          Apenas Agricultura Familiar
                        </button>
                      </div>
                    </div>

                    {it.modoOrigem === "dividido" ? (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="grid gap-1.5">
                          <Label>
                            Quantidade existente — <b>Mercado</b> (
                            {UNIDADE_APRESENTACAO_LABEL[it.unidade_apresentacao]})
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0"
                            value={it.qtd_mercado}
                            onChange={(e) => updateItem(it.key, { qtd_mercado: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label>
                            Quantidade existente — <b>Agricultura Familiar</b> (
                            {UNIDADE_APRESENTACAO_LABEL[it.unidade_apresentacao]})
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0"
                            value={it.qtd_agricultura}
                            onChange={(e) =>
                              updateItem(it.key, { qtd_agricultura: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex flex-col justify-center rounded-lg border bg-card px-3.5 py-2">
                          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                            Estoque Inicial Calculado
                          </span>
                          <span className="font-display text-lg font-bold text-primary tabular-nums">
                            {fmtQ(total)} {UNIDADE_APRESENTACAO_LABEL[it.unidade_apresentacao]}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Mercado: {fmtQ(m)} + Agric. Familiar: {fmtQ(a)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="grid gap-1.5">
                          <Label>Origem selecionada</Label>
                          <NSelect
                            value={it.modoOrigem}
                            onChange={(e) =>
                              updateItem(it.key, {
                                modoOrigem: e.target.value as "mercado" | "agricultura",
                              })
                            }
                          >
                            <option value="mercado">Mercado</option>
                            <option value="agricultura">Agricultura Familiar</option>
                          </NSelect>
                        </div>
                        <div className="grid gap-1.5">
                          <Label>
                            Quantidade existente anteriormente (
                            {UNIDADE_APRESENTACAO_LABEL[it.unidade_apresentacao]}) *
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            required
                            placeholder="0"
                            value={it.qtd_unica}
                            onChange={(e) => updateItem(it.key, { qtd_unica: e.target.value })}
                          />
                        </div>
                        <div className="flex flex-col justify-center rounded-lg border bg-card px-3.5 py-2">
                          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                            Estoque Inicial Calculado
                          </span>
                          <span className="font-display text-lg font-bold text-primary tabular-nums">
                            {fmtQ(total)} {UNIDADE_APRESENTACAO_LABEL[it.unidade_apresentacao]}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            100% {ORIGEM_LABEL[it.modoOrigem]}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Alerta caso o produto já possua estoque anterior lançado */}
                  {resumoExistente && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-warning bg-warning-soft p-3 text-xs">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <div>
                        <b>Atenção — Estoque Anterior já registrado para {pSel?.nome}:</b> Já consta
                        um saldo inicial de{" "}
                        <b>
                          {fmtQ(resumoExistente.quantidade_inicial)} {resumoExistente.unidade}
                        </b>{" "}
                        (Mercado: {fmtQ(resumoExistente.quantidade_mercado)} | Agricultura Familiar:{" "}
                        {fmtQ(resumoExistente.quantidade_agricultura)}) levantado em{" "}
                        {fmtData(resumoExistente.data_levantamento)}. Para evitar duplicidade, o
                        sistema solicitará confirmação e justificativa de autorização ao salvar, ou
                        você pode corrigir o registro existente na aba{" "}
                        <button
                          type="button"
                          className="font-semibold underline"
                          onClick={() => setAba("gerenciar")}
                        >
                          Saldo Integrado e Correções
                        </button>
                        .
                      </div>
                    </div>
                  )}

                  {/* Linha 3: Data de referência, Responsável e Observações */}
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label>Data de referência do levantamento *</Label>
                      <Input
                        type="date"
                        required
                        value={it.data}
                        onChange={(e) => updateItem(it.key, { data: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Responsável pelo levantamento *</Label>
                      <Input
                        required
                        placeholder="Nome do responsável pela conferência física"
                        value={it.responsavel}
                        onChange={(e) => updateItem(it.key, { responsavel: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Observações (opcional)</Label>
                      <Input
                        placeholder="Ex.: Contagem física de abertura na despensa da escola"
                        value={it.observacoes}
                        onChange={(e) => updateItem(it.key, { observacoes: e.target.value })}
                      />
                    </div>
                  </div>
                </Panel>
              );
            })}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
              <Button type="button" variant="outline" onClick={addItemRow}>
                <Plus className="h-4 w-4" /> Adicionar mais um produto ao levantamento
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {items.length} produto(s) na lista de lançamento
                </span>
                <Button
                  type="submit"
                  disabled={busy}
                  className="bg-entrada hover:bg-entrada/90 text-primary-foreground"
                >
                  <CheckCircle2 className="h-4 w-4" />{" "}
                  {busy
                    ? "Incorporando ao estoque…"
                    : "Salvar Estoque Anterior e Integrar ao Saldo"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ABA 2: GERENCIAR SALDO INICIAL E INTEGRAÇÃO EM TEMPO REAL */}
      {aba === "gerenciar" && (
        <div className="space-y-6">
          <Panel className="p-0 md:p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <div>
                <h2 className="font-display text-lg font-bold">
                  Integração Automática com o Estoque Atual (Tempo Real)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Fórmula aplicada em tempo real:{" "}
                  <b>
                    Saldo Atual = Estoque Inicial (Mercado + Agric. Familiar) + Entradas − Saídas
                  </b>
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAba("relatorio")}>
                <FileText className="h-4 w-4" /> Exportar Relatório (PDF / Excel)
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Categoria</th>
                    <th className="p-3">Unid.</th>
                    <th className="p-3 text-right">Inicial Mercado</th>
                    <th className="p-3 text-right">Inicial Agric. Fam.</th>
                    <th className="p-3 text-right font-bold text-foreground">
                      Estoque Inicial Total
                    </th>
                    <th className="p-3 text-right text-entrada">+ Entradas Posteriores</th>
                    <th className="p-3 text-right text-saida">− Saídas</th>
                    <th className="p-3 text-right font-bold text-primary">Saldo Atual</th>
                    <th className="p-3">Data Levantamento</th>
                    <th className="p-3">Responsável</th>
                    {(canWrite || isAdmin) && <th className="p-3 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {resumos.length === 0 && (
                    <tr>
                      <td colSpan={12} className="p-8 text-center text-muted-foreground">
                        Nenhum lançamento de Estoque Anterior registrado para esta unidade escolar.
                      </td>
                    </tr>
                  )}
                  {resumos.map((r) => (
                    <tr key={r.product_id} className="border-t">
                      <td className="p-3 font-medium">
                        {r.nome}
                        <span className="ml-2 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Saldo de Abertura
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{r.categoria}</td>
                      <td className="p-3">{r.unidade}</td>
                      <td className="p-3 text-right tabular-nums">{fmtQ(r.quantidade_mercado)}</td>
                      <td className="p-3 text-right tabular-nums">
                        {fmtQ(r.quantidade_agricultura)}
                      </td>
                      <td className="bg-primary/5 p-3 text-right font-bold tabular-nums">
                        {fmtQ(r.quantidade_inicial)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-entrada">
                        +{fmtQ(r.entradas_posteriores)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-saida">
                        −{fmtQ(r.saidas_posteriores)}
                      </td>
                      <td className="bg-entrada-soft/40 p-3 text-right font-bold tabular-nums text-entrada">
                        {fmtQ(r.saldo_atual)}
                      </td>
                      <td className="whitespace-nowrap p-3">{fmtData(r.data_levantamento)}</td>
                      <td className="p-3 text-xs">{r.responsavel || "—"}</td>
                      {(canWrite || isAdmin) && (
                        <td className="whitespace-nowrap p-3 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Corrigir Saldo Inicial"
                            onClick={() => abrirEdicaoResumo(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Excluir Saldo Inicial"
                            onClick={() => {
                              const ids = lancamentosSaldoInicial
                                .filter((x) => x.product_id === r.product_id)
                                .map((x) => x.id);
                              setDeleteModal({
                                movimentoIds: ids,
                                produtoNome: r.nome,
                                justificativa: "",
                                responsavel: nome || escola.responsavel || "",
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Lançamentos individuais detalhados por origem */}
          <Panel className="p-0 md:p-0">
            <div className="border-b p-4">
              <h3 className="font-display text-base font-bold">
                Registros Individuais de Estoque Anterior por Origem
              </h3>
              <p className="text-xs text-muted-foreground">
                Cada registro fica armazenado permanentemente e pode ser editado ou excluído
                individualmente por usuário autorizado mediante justificativa auditada.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Data Ref.</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Origem</th>
                    <th className="p-3 text-right">Quantidade Inicial</th>
                    <th className="p-3">Identificação</th>
                    <th className="p-3">Responsável</th>
                    <th className="p-3">Observações</th>
                    {(canWrite || isAdmin) && <th className="p-3 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {lancamentosSaldoInicial.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        Nenhum lançamento individual encontrado.
                      </td>
                    </tr>
                  )}
                  {lancamentosSaldoInicial.map((m) => {
                    const p = pmap.get(m.product_id);
                    const parsed = parseMovObservacoes(m.observacoes);
                    return (
                      <tr key={m.id} className="border-t">
                        <td className="whitespace-nowrap p-3">{fmtData(m.data)}</td>
                        <td className="p-3 font-medium">{p?.nome ?? "—"}</td>
                        <td className="p-3">
                          <OrigemBadge origem={m.origem} />
                        </td>
                        <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">
                          {fmtQ(m.quantidade)} {p ? formatUnidade(p) : ""}
                        </td>
                        <td className="p-3">
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            Saldo Inicial / Estoque de Abertura
                          </span>
                        </td>
                        <td className="p-3">{m.responsavel || "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">{parsed.texto || "—"}</td>
                        {(canWrite || isAdmin) && (
                          <td className="whitespace-nowrap p-3 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => abrirEdicaoMovimento(m)}
                              aria-label="Editar lançamento"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                setDeleteModal({
                                  movimentoIds: [m.id],
                                  produtoNome: `${p?.nome ?? "Produto"} (${ORIGEM_LABEL[m.origem]})`,
                                  justificativa: "",
                                  responsavel: nome || escola.responsavel || "",
                                })
                              }
                              aria-label="Excluir lançamento"
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
          </Panel>
        </div>
      )}

      {/* ABA 3: RELATÓRIO DE ESTOQUE ANTERIOR (PDF, EXCEL, WORD E IMPRESSÃO) */}
      {aba === "relatorio" && (
        <DocView
          info={{
            titulo: "Relatório Oficial de Estoque Anterior (Saldo Inicial / Abertura)",
            escola: escola.nome,
            mes: "Levantamento de Abertura",
            ano: new Date().getFullYear(),
            responsavel: responsavelPadrao || escola.responsavel || nome || "",
          }}
          columns={relatorioColumns}
          rows={relatorioRows}
          filename={`relatorio-estoque-anterior-${escola.nome.toLowerCase().replace(/\s+/g, "-")}`}
        />
      )}

      {/* ABA 4: HISTÓRICO PERMANENTE E AUDITORIA DE ALTERAÇÕES */}
      {aba === "auditoria" && (
        <Panel className="p-0 md:p-0">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <ShieldCheck className="h-5 w-5 text-primary" /> Histórico de Lançamentos e
                Correções do Estoque Anterior
              </h2>
              <p className="text-xs text-muted-foreground">
                Registro permanente de data, horário, responsável e justificativa de cada inclusão,
                correção ou exclusão do saldo inicial.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Data e Horário</th>
                  <th className="p-3">Ação</th>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Detalhes da Operação</th>
                  <th className="p-3">Justificativa / Observação</th>
                  <th className="p-3">Responsável Autorizado</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Nenhuma alteração registrada no histórico local desta unidade escolar ainda.
                    </td>
                  </tr>
                )}
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="whitespace-nowrap p-3 text-xs">
                      {new Date(log.timestamp).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          log.acao === "inclusao"
                            ? "bg-entrada-soft text-entrada"
                            : log.acao === "exclusao_autorizada"
                              ? "bg-saida-soft text-destructive"
                              : "bg-warning-soft text-warning"
                        }`}
                      >
                        {log.acao === "inclusao"
                          ? "Inclusão de Saldo Inicial"
                          : log.acao === "edicao_autorizada"
                            ? "Correção Autorizada"
                            : log.acao === "duplicidade_autorizada"
                              ? "Complemento Autorizado"
                              : "Exclusão Autorizada"}
                      </span>
                    </td>
                    <td className="p-3 font-medium">{log.produtoNome}</td>
                    <td className="p-3 text-xs">{log.detalhes}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {log.justificativa || "—"}
                    </td>
                    <td className="p-3 font-medium">{log.responsavel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* MODAL DE BLOQUEIO / AUTORIZAÇÃO CONTRA DUPLICIDADE */}
      <Dialog open={!!dupAuthModal?.open} onOpenChange={(o) => !o && setDupAuthModal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" /> Estoque Anterior Já Registrado — Autorização
              Necessária
            </DialogTitle>
          </DialogHeader>
          {dupAuthModal && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                O sistema bloqueou o lançamento direto porque o(s) seguinte(s) produto(s) já
                possui(em) <b>Estoque Anterior / Saldo Inicial</b> cadastrado nesta escola:
              </p>
              <ul className="list-disc space-y-1 rounded-lg border bg-muted/50 p-3 pl-7 font-semibold">
                {dupAuthModal.produtosDuplicados.map((nomeProd) => (
                  <li key={nomeProd}>{nomeProd}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Para evitar duplicidade acidental, confirme apenas se desejar adicionar um lote
                complementar de abertura com autorização registrada, ou cancele e utilize a aba{" "}
                <b>Saldo Integrado e Correções</b> para editar o saldo existente.
              </p>
              <div className="grid gap-2">
                <Label>Responsável pela autorização *</Label>
                <Input
                  value={dupAuthModal.autorizador}
                  onChange={(e) =>
                    setDupAuthModal({ ...dupAuthModal, autorizador: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Justificativa obrigatória para autorizar novo lançamento *</Label>
                <Textarea
                  rows={2}
                  placeholder="Ex.: Segundo lote encontrado no depósito anexo durante conferência complementar"
                  value={dupAuthModal.justificativa}
                  onChange={(e) =>
                    setDupAuthModal({ ...dupAuthModal, justificativa: e.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDupAuthModal(null)}>
                  Cancelar
                </Button>
                <Button
                  disabled={
                    busy || !dupAuthModal.autorizador.trim() || !dupAuthModal.justificativa.trim()
                  }
                  onClick={() =>
                    efetivarSalvamento({
                      autorizador: dupAuthModal.autorizador.trim(),
                      justificativa: dupAuthModal.justificativa.trim(),
                    })
                  }
                >
                  Autorizar e Registrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE EDIÇÃO / CORREÇÃO AUTORIZADA DO SALDO INICIAL */}
      <Dialog open={!!editModal} onOpenChange={(o) => !o && setEditModal(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Correção Autorizada de Estoque Anterior — {editModal?.nomeProduto}
            </DialogTitle>
          </DialogHeader>
          {editModal && (
            <form onSubmit={salvarEdicaoAutorizada} className="grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Categoria</Label>
                  <NSelect
                    value={editModal.categoria}
                    onChange={(e) => setEditModal({ ...editModal, categoria: e.target.value })}
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </NSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label>Unidade de medida</Label>
                  <NSelect
                    value={editModal.unidade_apresentacao}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
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
              </div>

              {editModal.modo === "resumo" ? (
                <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                  <div className="grid gap-1.5">
                    <Label>Quantidade Mercado</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={editModal.qtd_mercado}
                      onChange={(e) => setEditModal({ ...editModal, qtd_mercado: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Quantidade Agricultura Familiar</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={editModal.qtd_agricultura}
                      onChange={(e) =>
                        setEditModal({ ...editModal, qtd_agricultura: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2 text-xs font-semibold text-primary">
                    Novo Estoque Inicial Total:{" "}
                    {fmtQ(
                      (Number(editModal.qtd_mercado) || 0) +
                        (Number(editModal.qtd_agricultura) || 0),
                    )}{" "}
                    {UNIDADE_APRESENTACAO_LABEL[editModal.unidade_apresentacao]}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Origem</Label>
                    <NSelect
                      value={editModal.origem_unica}
                      onChange={(e) =>
                        setEditModal({ ...editModal, origem_unica: e.target.value as Origem })
                      }
                    >
                      <option value="mercado">Mercado</option>
                      <option value="agricultura">Agricultura Familiar</option>
                    </NSelect>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Quantidade Inicial *</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={editModal.qtd_unica}
                      onChange={(e) => setEditModal({ ...editModal, qtd_unica: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Data do levantamento *</Label>
                  <Input
                    type="date"
                    required
                    value={editModal.data}
                    onChange={(e) => setEditModal({ ...editModal, data: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Responsável pela correção *</Label>
                  <Input
                    required
                    value={editModal.responsavel}
                    onChange={(e) => setEditModal({ ...editModal, responsavel: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Observações</Label>
                <Input
                  value={editModal.observacoes}
                  onChange={(e) => setEditModal({ ...editModal, observacoes: e.target.value })}
                />
              </div>

              <div className="grid gap-1.5">
                <Label>Motivo / Justificativa da Correção (Obrigatório para Auditoria) *</Label>
                <Textarea
                  required
                  rows={2}
                  placeholder="Informe o motivo da correção do saldo inicial…"
                  value={editModal.justificativa}
                  onChange={(e) => setEditModal({ ...editModal, justificativa: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditModal(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  Salvar Correção Auditada
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE EXCLUSÃO AUTORIZADA */}
      <Dialog open={!!deleteModal} onOpenChange={(o) => !o && setDeleteModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Excluir Lançamento de Estoque Anterior
            </DialogTitle>
          </DialogHeader>
          {deleteModal && (
            <form onSubmit={confirmarExclusaoAutorizada} className="grid gap-3 text-sm">
              <p className="text-muted-foreground">
                Confirma a exclusão do lançamento de Estoque Anterior do produto{" "}
                <b>{deleteModal.produtoNome}</b>? Esta ação ficará registrada no histórico de
                auditoria com data, horário e responsável.
              </p>
              <div className="grid gap-1.5">
                <Label>Responsável pela exclusão *</Label>
                <Input
                  required
                  value={deleteModal.responsavel}
                  onChange={(e) => setDeleteModal({ ...deleteModal, responsavel: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Justificativa obrigatória *</Label>
                <Textarea
                  required
                  rows={2}
                  placeholder="Informe o motivo da exclusão deste saldo inicial…"
                  value={deleteModal.justificativa}
                  onChange={(e) =>
                    setDeleteModal({ ...deleteModal, justificativa: e.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDeleteModal(null)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive" disabled={busy}>
                  Confirmar Exclusão Auditada
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
