import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Link2,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useMovimentos, useProdutos } from "@/lib/app-context";
import {
  computeSaldos,
  FINALIDADES_SAIDA,
  fmtQ,
  formatUnidade,
  hoje,
  type Origem,
  type Produto,
} from "@/lib/estoque";
import {
  BARCODE_EXIT_ORIGIN_LABEL,
  findProductByBarcode,
  formatBarcodeExitObservacoes,
  linkBarcodeToProduct,
  normalizeBarcode,
  syncBarcodesRegistryWithCloud,
  type CodigoBarrasVinculado,
} from "@/lib/barcode";
import { enqueueOfflineMovement } from "@/lib/offline-sync";
import { BarcodeScannerCamera } from "@/components/BarcodeScannerCamera";
import { MovList } from "@/components/MovList";
import { NSelect, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/saida-rapida")({
  head: () =>
    pageMeta(
      "Saída Rápida de Mercadorias (Leitor de Código de Barras)",
      "Realize a baixa automática e transacional de produtos da merenda escolar utilizando o leitor de código de barras pela câmera do celular.",
    ),
  component: SaidaRapidaPage,
});

export interface ItemSaidaRapida {
  itemId: string;
  product_id: string;
  produtoNome: string;
  unidadeLabel: string;
  codigoBarras: string;
  marcaApresentacao?: string;
  quantidade: number;
  saldoAnterior: number;
  saldoMercadoDisp: number;
  saldoAgricDisp: number;
}

function SaidaRapidaPage() {
  const { escola, canWrite, isAdmin, nome } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const qc = useQueryClient();

  const [codigoInput, setCodigoInput] = useState("");
  const [codigoAtivo, setCodigoAtivo] = useState("");
  const [produtoIdentificado, setProdutoIdentificado] = useState<Produto | null>(null);
  const [vinculoIdentificado, setVinculoIdentificado] = useState<CodigoBarrasVinculado | null>(
    null,
  );
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const [quantidadeSaida, setQuantidadeSaida] = useState("1");
  const [listaItens, setListaItens] = useState<ItemSaidaRapida[]>([]);

  // Dados gerais da operação de saída
  const [dataSaida, setDataSaida] = useState(hoje());
  const [finalidade, setFinalidade] = useState("Preparação de Almoço");
  const [responsavel, setResponsavel] = useState(nome || escola?.responsavel || "");
  const [observacaoGeral, setObservacaoGeral] = useState("");

  // Pesquisa manual / Associação de código não encontrado a produto existente
  const [mostrarPesquisaManual, setMostrarPesquisaManual] = useState(false);
  const [buscaManual, setBuscaManual] = useState("");
  const [produtoParaVincularId, setProdutoParaVincularId] = useState("");
  const [marcaParaVincular, setMarcaParaVincular] = useState("");
  const [autorizoVinculo, setAutorizoVinculo] = useState(false);

  const [busyConfirm, setBusyConfirm] = useState(false);
  const lastConfirmedBatchHashRef = useRef<string>("");

  useEffect(() => {
    if (escola?.id) {
      void syncBarcodesRegistryWithCloud(escola.id).then(() => {
        qc.invalidateQueries({ queryKey: ["produtos"] });
      });
    }
  }, [escola?.id, qc]);

  const produtosAtivos = useMemo(() => (prods.data ?? []).filter((p) => p.ativo), [prods.data]);
  const saldos = useMemo(() => computeSaldos(movs.data ?? []), [movs.data]);

  // Calcula quanto de cada produto já está reservado na lista de seleção atual
  const reservadoPorProduto = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of listaItens) {
      map.set(
        it.product_id,
        Math.round(((map.get(it.product_id) ?? 0) + it.quantidade) * 1000) / 1000,
      );
    }
    return map;
  }, [listaItens]);

  const processarCodigoLido = useCallback(
    (rawCode: string) => {
      const clean = normalizeBarcode(rawCode);
      if (!clean) return;

      setCodigoInput(clean);
      setCodigoAtivo(clean);

      const match = findProductByBarcode(clean, prods.data ?? []);
      if (match) {
        setProdutoIdentificado(match.produto);
        setVinculoIdentificado(match.vinculo);
        setNaoEncontrado(false);
        setMostrarPesquisaManual(false);
        setQuantidadeSaida("1");
        toast.success(`Produto identificado: ${match.produto.nome}`);
      } else {
        setProdutoIdentificado(null);
        setVinculoIdentificado(null);
        setNaoEncontrado(true);
        setProdutoParaVincularId("");
        setMarcaParaVincular("");
        setAutorizoVinculo(false);
        toast.warning(
          "PRODUTO NÃO ENCONTRADO. Verifique o cadastro ou localize o produto manualmente.",
        );
      }
    },
    [prods.data],
  );

  if (!escola) {
    return (
      <>
        <PageHeader title="SAÍDA RÁPIDA DE MERCADORIAS" />
        <SemEscola />
      </>
    );
  }

  const saldoProdIdentificado = produtoIdentificado
    ? (saldos.get(produtoIdentificado.id) ?? {
        product_id: produtoIdentificado.id,
        mercado: 0,
        agricultura: 0,
        total: 0,
      })
    : null;

  const jaNaListaProdIdentificado = produtoIdentificado
    ? (reservadoPorProduto.get(produtoIdentificado.id) ?? 0)
    : 0;

  const disponivelLiquido = saldoProdIdentificado
    ? Math.max(
        0,
        Math.round((saldoProdIdentificado.total - jaNaListaProdIdentificado) * 1000) / 1000,
      )
    : 0;

  const qtdInformadaNum = Number(quantidadeSaida) || 0;
  const fatorConv =
    vinculoIdentificado?.fator_conversao && vinculoIdentificado.fator_conversao > 0
      ? vinculoIdentificado.fator_conversao
      : 1;
  const qtdEfetivaEstoque = Math.round(qtdInformadaNum * fatorConv * 1000) / 1000;
  const excedeDisponivel = qtdEfetivaEstoque > disponivelLiquido;

  function handleAssociarCodigoAoProduto() {
    if (!codigoAtivo || !produtoParaVincularId) {
      toast.error("Selecione o produto existente ao qual deseja vincular o código lido.");
      return;
    }
    if (!autorizoVinculo) {
      toast.error("Confirme a autorização para vincular este código de barras ao produto.");
      return;
    }

    const res = linkBarcodeToProduct({
      productId: produtoParaVincularId,
      codigo: codigoAtivo,
      marca_apresentacao: marcaParaVincular.trim() || undefined,
      responsavel: responsavel || nome || "Usuário autorizado",
      produtos: prods.data ?? [],
    });

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    void syncBarcodesRegistryWithCloud(escola?.id);
    qc.invalidateQueries({ queryKey: ["produtos"] });

    const prod = (prods.data ?? []).find((p) => p.id === produtoParaVincularId) ?? null;
    if (prod) {
      setProdutoIdentificado(prod);
      setVinculoIdentificado({
        codigo: codigoAtivo,
        principal: (res.barcodes?.length ?? 1) === 1,
        marca_apresentacao: marcaParaVincular.trim() || undefined,
        fator_conversao: 1,
      });
      setNaoEncontrado(false);
      toast.success(`Código ${codigoAtivo} vinculado com sucesso ao produto "${prod.nome}"!`);
    }
  }

  function handleSelecionarProdutoManual(prod: Produto) {
    const cod =
      prod.codigo_barras ||
      prod.codigos_barras?.[0]?.codigo ||
      codigoAtivo ||
      `MANUAL-${prod.id.slice(0, 6).toUpperCase()}`;
    setProdutoIdentificado(prod);
    setVinculoIdentificado({
      codigo: cod,
      principal: true,
      fator_conversao: 1,
    });
    setCodigoInput(cod);
    setCodigoAtivo(cod);
    setNaoEncontrado(false);
    setMostrarPesquisaManual(false);
    setQuantidadeSaida("1");
  }

  function handleAdicionarALista() {
    if (!produtoIdentificado) {
      toast.error("Identifique um produto válido antes de adicionar à lista.");
      return;
    }
    if (!(qtdEfetivaEstoque > 0)) {
      toast.error("Informe uma quantidade de saída maior que zero.");
      return;
    }
    if (excedeDisponivel) {
      toast.error(
        `Saída superior à quantidade disponível! Disponível: ${fmtQ(disponivelLiquido)} ${formatUnidade(produtoIdentificado)}.`,
      );
      return;
    }

    const saldoTotal = saldoProdIdentificado?.total ?? 0;
    const codigoUsado =
      vinculoIdentificado?.codigo || codigoAtivo || produtoIdentificado.codigo_barras || "SEM-EAN";

    setListaItens((prev) => {
      const idxExistente = prev.findIndex((x) => x.product_id === produtoIdentificado.id);
      if (idxExistente >= 0) {
        const atual = prev[idxExistente]!;
        const novaQtd = Math.round((atual.quantidade + qtdEfetivaEstoque) * 1000) / 1000;
        if (novaQtd > saldoTotal) {
          toast.error(
            `A soma na lista (${fmtQ(novaQtd)}) ultrapassa o estoque disponível (${fmtQ(saldoTotal)}).`,
          );
          return prev;
        }
        const copia = [...prev];
        copia[idxExistente] = {
          ...atual,
          quantidade: novaQtd,
          codigoBarras: codigoUsado,
        };
        return copia;
      }

      return [
        ...prev,
        {
          itemId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          product_id: produtoIdentificado.id,
          produtoNome: produtoIdentificado.nome,
          unidadeLabel: formatUnidade(produtoIdentificado),
          codigoBarras: codigoUsado,
          marcaApresentacao: vinculoIdentificado?.marca_apresentacao,
          quantidade: qtdEfetivaEstoque,
          saldoAnterior: saldoTotal,
          saldoMercadoDisp: saldoProdIdentificado?.mercado ?? 0,
          saldoAgricDisp: saldoProdIdentificado?.agricultura ?? 0,
        },
      ];
    });

    toast.success(
      `${produtoIdentificado.nome} (${fmtQ(qtdEfetivaEstoque)} ${formatUnidade(produtoIdentificado)}) adicionado à lista!`,
    );
    // Limpa o produto em foco para permitir continuar lendo outros produtos sem fechar a tela
    setProdutoIdentificado(null);
    setVinculoIdentificado(null);
    setCodigoInput("");
    setCodigoAtivo("");
    setQuantidadeSaida("1");
  }

  function handleRemoverItem(itemId: string) {
    setListaItens((prev) => prev.filter((x) => x.itemId !== itemId));
  }

  function handleCancelarOperacao() {
    if (
      listaItens.length > 0 &&
      !confirm("Deseja cancelar a operação atual e limpar a lista de produtos selecionados?")
    ) {
      return;
    }
    setListaItens([]);
    setProdutoIdentificado(null);
    setVinculoIdentificado(null);
    setNaoEncontrado(false);
    setCodigoInput("");
    setCodigoAtivo("");
    setQuantidadeSaida("1");
    toast.info("Operação cancelada e lista limpa.");
  }

  async function handleConfirmarSaidas() {
    if (!canWrite && !isAdmin) {
      toast.error(
        "Somente usuários com permissão para registrar saídas podem confirmar a operação.",
      );
      return;
    }
    if (listaItens.length === 0) {
      toast.error("Adicione pelo menos um produto à lista antes de confirmar as saídas.");
      return;
    }
    if (!responsavel.trim()) {
      toast.error("Informe o nome do funcionário responsável pela retirada.");
      return;
    }

    // 1. Validação rigorosa pré-transação de todos os itens contra o saldo atual
    const saldosAtuais = computeSaldos(movs.data ?? []);
    for (const item of listaItens) {
      if (!item.product_id) {
        toast.error("Há um item sem identificação válida na lista.");
        return;
      }
      if (!(item.quantidade > 0)) {
        toast.error(
          `O produto "${item.produtoNome}" possui quantidade inválida (${item.quantidade}).`,
        );
        return;
      }
      const saldoReal = saldosAtuais.get(item.product_id)?.total ?? 0;
      if (item.quantidade > saldoReal) {
        toast.error(
          `Saldo insuficiente para "${item.produtoNome}": solicitado ${fmtQ(item.quantidade)}, disponível ${fmtQ(saldoReal)}.`,
        );
        return;
      }
    }

    // 2. Proteção contra registro duplicado da mesma operação
    const batchSignature = JSON.stringify({
      schoolId: escola.id,
      data: dataSaida,
      items: listaItens.map((i) => ({
        p: i.product_id,
        q: i.quantidade,
        c: i.codigoBarras,
      })),
    });
    if (lastConfirmedBatchHashRef.current === batchSignature) {
      toast.warning("Esta operação já acabou de ser confirmada (proteção contra duplicidade).");
      return;
    }

    setBusyConfirm(true);
    const insertedMovementIds: string[] = [];
    const horaAtual = new Date().toLocaleTimeString("pt-BR", { hour12: false });

    try {
      // Modo offline: enfileira todos os itens com segurança no IndexedDB
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        for (const item of listaItens) {
          const saldoPos = Math.max(
            0,
            Math.round((item.saldoAnterior - item.quantidade) * 1000) / 1000,
          );
          const obs = formatBarcodeExitObservacoes({
            codigoBarras: item.codigoBarras,
            saldoAnterior: item.saldoAnterior,
            saldoPosterior: saldoPos,
            horario: horaAtual,
            observacaoExtra: observacaoGeral.trim() || BARCODE_EXIT_ORIGIN_LABEL,
          });

          await enqueueOfflineMovement({
            schoolId: escola.id,
            schoolName: escola.nome,
            productId: item.product_id,
            productName: item.produtoNome,
            tipo: "saida",
            data: dataSaida,
            quantidade: item.quantidade,
            origem: "auto",
            destino: `${finalidade} (${BARCODE_EXIT_ORIGIN_LABEL})`,
            responsavel: responsavel.trim(),
            observacoes: obs,
          });
        }

        lastConfirmedBatchHashRef.current = batchSignature;
        setListaItens([]);
        toast.success(
          "Sem internet: Saídas por código de barras armazenadas localmente e serão sincronizadas automaticamente!",
        );
        qc.invalidateQueries({ queryKey: ["movimentos"] });
        setBusyConfirm(false);
        return;
      }

      // 3. Execução Transacional no Banco de Dados:
      // Prepara todas as linhas de movimentação respeitando a divisão de saldo por origem (Mercado primeiro, depois Agricultura Familiar)
      const payloadsToInsert: {
        school_id: string;
        product_id: string;
        tipo: "saida";
        data: string;
        quantidade: number;
        origem: Origem;
        destino: string;
        responsavel: string;
        observacoes: string;
      }[] = [];

      for (const item of listaItens) {
        const s = saldosAtuais.get(item.product_id) ?? {
          product_id: item.product_id,
          mercado: 0,
          agricultura: 0,
          total: 0,
        };
        const saldoPos = Math.max(0, Math.round((s.total - item.quantidade) * 1000) / 1000);
        const obs = formatBarcodeExitObservacoes({
          codigoBarras: item.codigoBarras,
          saldoAnterior: s.total,
          saldoPosterior: saldoPos,
          horario: horaAtual,
          observacaoExtra: observacaoGeral.trim() || BARCODE_EXIT_ORIGIN_LABEL,
        });
        const destinoFormatado = `${finalidade} — ${BARCODE_EXIT_ORIGIN_LABEL}`;

        if (item.quantidade <= s.mercado) {
          payloadsToInsert.push({
            school_id: escola.id,
            product_id: item.product_id,
            tipo: "saida",
            data: dataSaida,
            quantidade: item.quantidade,
            origem: "mercado",
            destino: destinoFormatado,
            responsavel: responsavel.trim(),
            observacoes: obs,
          });
        } else {
          const deMercado = Math.max(0, Math.round(s.mercado * 1000) / 1000);
          const deAgric = Math.round((item.quantidade - deMercado) * 1000) / 1000;
          if (deMercado > 0) {
            payloadsToInsert.push({
              school_id: escola.id,
              product_id: item.product_id,
              tipo: "saida",
              data: dataSaida,
              quantidade: deMercado,
              origem: "mercado",
              destino: destinoFormatado,
              responsavel: responsavel.trim(),
              observacoes: obs,
            });
          }
          if (deAgric > 0) {
            payloadsToInsert.push({
              school_id: escola.id,
              product_id: item.product_id,
              tipo: "saida",
              data: dataSaida,
              quantidade: deAgric,
              origem: "agricultura",
              destino: destinoFormatado,
              responsavel: responsavel.trim(),
              observacoes: obs,
            });
          }
        }
      }

      // Insere cada item e guarda o ID; se qualquer um falhar, executa rollback completo de todos os inseridos!
      for (const row of payloadsToInsert) {
        const { data: created, error } = await supabase
          .from("movements")
          .insert(row)
          .select("id")
          .single();

        if (error || !created) {
          throw new Error(errMsg(error));
        }
        insertedMovementIds.push(created.id);
      }

      lastConfirmedBatchHashRef.current = batchSignature;
      const qtdProdutosBaixados = listaItens.length;
      setListaItens([]);
      setObservacaoGeral("");
      toast.success(
        `Operação concluída! ${qtdProdutosBaixados} produto(s) baixado(s) do estoque com sucesso.`,
      );
      qc.invalidateQueries({ queryKey: ["movimentos"] });
      qc.invalidateQueries({ queryKey: ["movimentos-rede"] });
    } catch (err) {
      // ROLLBACK TRANSACIONAL: remove quaisquer registros parciais criados nesta tentativa
      if (insertedMovementIds.length > 0) {
        await supabase.from("movements").delete().in("id", insertedMovementIds);
      }
      toast.error(
        `Falha na gravação transacional (nenhum produto foi baixado parcialmente): ${errMsg(err)}`,
      );
    } finally {
      setBusyConfirm(false);
    }
  }

  const produtosFiltradosManual = produtosAtivos.filter((p) => {
    const q = buscaManual.trim().toLowerCase();
    if (!q) return true;
    return (
      p.nome.toLowerCase().includes(q) ||
      p.categoria.toLowerCase().includes(q) ||
      (p.codigo_barras ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="SAÍDA RÁPIDA DE MERCADORIAS"
        desc={`Leitor de código de barras pelo celular com baixa automática no estoque — ${escola.nome}`}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* COLUNA ESQUERDA: CÂMERA E IDENTIFICAÇÃO DO PRODUTO (7 colunas) */}
        <div className="space-y-4 lg:col-span-7">
          <Panel className="space-y-4 border-l-4 border-l-primary">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <Barcode className="h-5 w-5 text-primary" /> Leitor de Código de Barras
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMostrarPesquisaManual((v) => !v)}
              >
                <Search className="h-4 w-4" />{" "}
                {mostrarPesquisaManual ? "Ocultar Pesquisa Manual" : "Pesquisa Manual de Produto"}
              </Button>
            </div>

            {/* Componente da Câmera Traseira com ZXing + Lanterna + Bip */}
            <BarcodeScannerCamera
              continuous
              duplicateCooldownMs={2500}
              onDetected={(code) => processarCodigoLido(code)}
            />

            {/* Campo para identificação manual ou leitor externo do código de barras */}
            <div className="grid gap-1.5">
              <Label className="text-sm font-semibold">
                Código de barras identificado (ou digite manualmente)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Aponte a câmera ou digite o código EAN-13 / EAN-8 / UPC…"
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      processarCodigoLido(codigoInput);
                    }
                  }}
                  className="h-12 font-mono text-base"
                />
                <Button
                  type="button"
                  size="lg"
                  onClick={() => processarCodigoLido(codigoInput)}
                  className="h-12 px-5 font-bold"
                >
                  Localizar
                </Button>
              </div>
            </div>

            {/* RESULTADO 1: PRODUTO IDENTIFICADO COM SUCESSO */}
            {produtoIdentificado && saldoProdIdentificado && (
              <div className="space-y-4 rounded-2xl border-2 border-entrada bg-entrada-soft/40 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-entrada px-2.5 py-0.5 text-xs font-bold text-white">
                      <CheckCircle2 className="h-3.5 w-3.5" /> PRODUTO IDENTIFICADO
                    </span>
                    <h3 className="mt-1.5 font-display text-xl font-bold text-foreground">
                      {produtoIdentificado.nome}
                    </h3>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        Código lido: <b className="font-mono">{codigoAtivo}</b>
                      </span>
                      {vinculoIdentificado?.marca_apresentacao && (
                        <span>· {vinculoIdentificado.marca_apresentacao}</span>
                      )}
                      <span>· Categoria: {produtoIdentificado.categoria}</span>
                    </div>
                  </div>
                </div>

                {/* Unidade de medida e Estoque disponível */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border bg-card p-3">
                    <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                      Unidade de Medida
                    </div>
                    <div className="mt-1 font-display text-lg font-bold">
                      {formatUnidade(produtoIdentificado)}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-card p-3">
                    <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                      Estoque Disponível
                    </div>
                    <div
                      className={`mt-1 font-display text-lg font-bold tabular-nums ${
                        disponivelLiquido > 0 ? "text-entrada" : "text-destructive"
                      }`}
                    >
                      {fmtQ(disponivelLiquido)} {formatUnidade(produtoIdentificado)}
                    </div>
                    {jaNaListaProdIdentificado > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        ({fmtQ(jaNaListaProdIdentificado)} já na lista abaixo)
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 rounded-xl border bg-card p-3 sm:col-span-1">
                    <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                      Saldo por Origem
                    </div>
                    <div className="mt-1 text-xs">
                      Mercado: <b>{fmtQ(saldoProdIdentificado.mercado)}</b>
                      <br />
                      Agric. Fam.: <b>{fmtQ(saldoProdIdentificado.agricultura)}</b>
                    </div>
                  </div>
                </div>

                {/* Campo para informar a quantidade de saída com botões rápidos para celular */}
                <div className="space-y-2">
                  <Label className="text-sm font-bold">
                    Quantidade de saída ({formatUnidade(produtoIdentificado)}) *
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="number"
                      step="any"
                      min="0.001"
                      value={quantidadeSaida}
                      onChange={(e) => setQuantidadeSaida(e.target.value)}
                      className={`h-12 flex-1 text-lg font-bold tabular-nums ${
                        excedeDisponivel ? "border-destructive" : ""
                      }`}
                    />
                    {[1, 2, 5, 10].map((inc) => (
                      <Button
                        key={inc}
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setQuantidadeSaida(
                            String(
                              Math.round(((Number(quantidadeSaida) || 0) + inc) * 1000) / 1000,
                            ),
                          )
                        }
                        className="h-12 px-3.5 text-sm font-bold"
                      >
                        +{inc}
                      </Button>
                    ))}
                  </div>
                  {excedeDisponivel && (
                    <p className="text-xs font-bold text-destructive">
                      Quantidade informada ({fmtQ(qtdEfetivaEstoque)}) é superior ao estoque
                      disponível ({fmtQ(disponivelLiquido)} {formatUnidade(produtoIdentificado)}).
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  size="lg"
                  disabled={excedeDisponivel || !(qtdEfetivaEstoque > 0)}
                  onClick={handleAdicionarALista}
                  className="h-13 w-full bg-entrada text-base font-bold text-white shadow-md hover:bg-entrada/90"
                >
                  <Plus className="h-5 w-5" /> ADICIONAR À LISTA
                </Button>
              </div>
            )}

            {/* RESULTADO 2: CÓDIGO NÃO ENCONTRADO + ASSOCIAÇÃO AUTORIZADA A PRODUTO EXISTENTE */}
            {naoEncontrado && (
              <div className="space-y-4 rounded-2xl border-2 border-warning bg-warning-soft/60 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
                  <div className="space-y-1">
                    <div className="font-display text-base font-bold text-foreground">
                      PRODUTO NÃO ENCONTRADO. Verifique o cadastro ou localize o produto
                      manualmente.
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Código lido: <b className="font-mono">{codigoAtivo}</b>. O sistema não cria
                      produtos desconhecidos automaticamente. Você pode associar este código a um
                      produto já cadastrado abaixo (mediante sua autorização) ou localizar o produto
                      manualmente.
                    </p>
                  </div>
                </div>

                {(canWrite || isAdmin) && (
                  <div className="space-y-3 rounded-xl border bg-card p-3.5">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-primary">
                      <Link2 className="h-4 w-4" /> Associar código {codigoAtivo} a um produto
                      existente
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <Label className="text-xs">Selecione o produto cadastrado *</Label>
                        <NSelect
                          value={produtoParaVincularId}
                          onChange={(e) => setProdutoParaVincularId(e.target.value)}
                        >
                          <option value="">Escolha o produto correspondente…</option>
                          {produtosAtivos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome} ({formatUnidade(p)})
                            </option>
                          ))}
                        </NSelect>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Marca / Apresentação (opcional)</Label>
                        <Input
                          placeholder="Ex.: Marca B — Mesma unidade"
                          value={marcaParaVincular}
                          onChange={(e) => setMarcaParaVincular(e.target.value)}
                        />
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={autorizoVinculo}
                        onChange={(e) => setAutorizoVinculo(e.target.checked)}
                        className="h-4 w-4 rounded border"
                      />
                      <span>
                        Autorizo vincular o código de barras <b>{codigoAtivo}</b> ao produto
                        selecionado (mesma unidade de controle).
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!produtoParaVincularId || !autorizoVinculo}
                        onClick={handleAssociarCodigoAoProduto}
                      >
                        <Link2 className="h-4 w-4" /> Vincular Código e Selecionar Produto
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setMostrarPesquisaManual(true)}
                      >
                        <Search className="h-4 w-4" /> Pesquisar Produto Manualmente
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* OPÇÃO DE PESQUISA MANUAL NO CADASTRO DE PRODUTOS */}
            {mostrarPesquisaManual && (
              <div className="space-y-3 rounded-xl border bg-muted/30 p-3.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">
                    Pesquisa Manual no Cadastro de Produtos
                  </Label>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setMostrarPesquisaManual(false)}
                  >
                    Fechar
                  </button>
                </div>
                <Input
                  placeholder="Digite o nome do alimento (ex.: Arroz, Feijão, Óleo, Macarrão)…"
                  value={buscaManual}
                  onChange={(e) => setBuscaManual(e.target.value)}
                />
                <div className="max-h-52 space-y-1.5 overflow-y-auto">
                  {produtosFiltradosManual.map((p) => {
                    const disp = saldos.get(p.id)?.total ?? 0;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="font-bold">{p.nome}</div>
                          <div className="text-muted-foreground">
                            Disponível: <b>{fmtQ(disp)}</b> {formatUnidade(p)}
                            {p.codigo_barras ? ` · EAN: ${p.codigo_barras}` : ""}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={disp > 0 ? "default" : "outline"}
                          onClick={() => handleSelecionarProdutoManual(p)}
                        >
                          Selecionar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* COLUNA DIREITA: LISTA DE PRODUTOS SELECIONADOS E CONFIRMAÇÃO TRANSACIONAL (5 colunas) */}
        <div className="space-y-4 lg:col-span-5">
          <Panel className="space-y-4 border-l-4 border-l-saida">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                  <ShoppingBag className="h-5 w-5 text-saida" /> Lista de Produtos Selecionados
                </h2>
                <p className="text-xs text-muted-foreground">
                  Leia vários produtos consecutivamente e confirme todas as saídas de uma só vez.
                </p>
              </div>
              <span className="rounded-full bg-saida/10 px-3 py-1 font-display text-sm font-bold text-saida">
                {listaItens.length} item(ns)
              </span>
            </div>

            {listaItens.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum produto adicionado à lista ainda.
                <br />
                <span className="text-xs">
                  Inicie a leitura pela câmera e clique em &ldquo;ADICIONAR À LISTA&rdquo;.
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {listaItens.map((it, idx) => {
                  const saldoPosterior = Math.max(
                    0,
                    Math.round((it.saldoAnterior - it.quantidade) * 1000) / 1000,
                  );
                  return (
                    <div
                      key={it.itemId}
                      className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold">
                            #{idx + 1}
                          </span>
                          <span className="truncate font-display text-sm font-bold">
                            {it.produtoNome} — {fmtQ(it.quantidade)} {it.unidadeLabel}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="font-mono">EAN: {it.codigoBarras}</span>
                          <span>Saldo ant.: {fmtQ(it.saldoAnterior)}</span>
                          <span className="font-semibold text-entrada">
                            Saldo pós: {fmtQ(saldoPosterior)} {it.unidadeLabel}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoverItem(it.itemId)}
                        className="shrink-0 text-destructive hover:bg-saida-soft"
                      >
                        <Trash2 className="h-4 w-4" /> REMOVER ITEM
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Metadados de responsabilidade e finalidade da retirada */}
            <div className="space-y-3 border-t pt-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="grid gap-1">
                  <Label className="text-xs">Data da saída *</Label>
                  <Input
                    type="date"
                    value={dataSaida}
                    onChange={(e) => setDataSaida(e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Finalidade *</Label>
                  <NSelect value={finalidade} onChange={(e) => setFinalidade(e.target.value)}>
                    {FINALIDADES_SAIDA.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </NSelect>
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Funcionário responsável pela retirada *</Label>
                <Input
                  required
                  placeholder="Nome do responsável"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Observações da operação (opcional)</Label>
                <Input
                  placeholder="Ex.: Retirada para cardápio do turno matutino"
                  value={observacaoGeral}
                  onChange={(e) => setObservacaoGeral(e.target.value)}
                />
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
                Origem da movimentação registrada automaticamente como:{" "}
                <b className="text-foreground">&ldquo;{BARCODE_EXIT_ORIGIN_LABEL}&rdquo;</b>
              </div>
            </div>

            {/* Botões de ação grandes para celular: CONFIRMAR SAÍDAS e CANCELAR OPERAÇÃO */}
            <div className="grid gap-2.5 pt-1">
              <Button
                type="button"
                size="lg"
                disabled={busyConfirm || listaItens.length === 0 || (!canWrite && !isAdmin)}
                onClick={() => void handleConfirmarSaidas()}
                className="h-14 w-full bg-saida text-base font-bold text-white shadow-md hover:bg-saida/90"
              >
                <PackageCheck className="h-5 w-5" />{" "}
                {busyConfirm
                  ? "REGISTRANDO BAIXA TRANSACIONAL…"
                  : `CONFIRMAR SAÍDAS (${listaItens.length})`}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={busyConfirm}
                onClick={handleCancelarOperacao}
                className="h-11 w-full font-semibold"
              >
                <XCircle className="h-4 w-4" /> CANCELAR OPERAÇÃO
              </Button>
            </div>
          </Panel>
        </div>
      </div>

      {/* Histórico integrado das saídas com filtro de "Saída por código de barras" */}
      <MovList tipo="saida" movs={movs.data ?? []} produtos={prods.data ?? []} />
    </div>
  );
}
