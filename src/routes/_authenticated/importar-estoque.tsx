import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  History,
  Layers,
  Plus,
  School,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useAllMovimentos, useApp, useProdutos } from "@/lib/app-context";
import {
  CATEGORIAS,
  fmtData,
  fmtQ,
  isSaldoInicial,
  UNIDADE_APRESENTACAO_LABEL,
  UNIDADES_APRESENTACAO,
  type Movimento,
  type Origem,
  type UnidadeApresentacao,
} from "@/lib/estoque";
import {
  approveAndCommitStockMigration,
  computeMigrationIndicators,
  evaluateStockRows,
  getLocalMigrationHistory,
  parseStockFileForMigration,
  type DivergenceAction,
  type ExtractedStockRow,
  type MigrationHistoryRecord,
  type ParsedStockFileBatchItem,
} from "@/lib/stock-migration";
import { parseSmartNumber } from "@/lib/ai-intelligence";
import { NSelect, PageHeader, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/importar-estoque")({
  head: () =>
    pageMeta(
      "Importar Estoque Existente",
      "Migração inteligente de planilhas e documentos de estoque atual das unidades escolares com conferência e geração de Saldo Inicial Importado.",
    ),
  component: ImportarEstoquePage,
});

function ImportarEstoquePage() {
  const { escolas, escola, nome, canWrite, isAdmin } = useApp();
  const prodsQ = useProdutos();
  const allMovsQ = useAllMovimentos();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"importar" | "historico">("importar");
  const [batchItems, setBatchItems] = useState<ParsedStockFileBatchItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmedApproval, setConfirmedApproval] = useState(false);
  const [historyList, setHistoryList] = useState<MigrationHistoryRecord[]>(() =>
    getLocalMigrationHistory(),
  );
  const [inspectRecord, setInspectRecord] = useState<MigrationHistoryRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const produtos = prodsQ.data ?? [];
  const allMovs = allMovsQ.data ?? [];

  const movsPorEscola = useMemo(() => {
    const map = new Map<string, Movimento[]>();
    for (const m of allMovs) {
      const list = map.get(m.school_id) ?? [];
      list.push(m);
      map.set(m.school_id, list);
    }
    return map;
  }, [allMovs]);

  // Painel de acompanhamento da migração (Seção 13.9)
  const painelMigracao = useMemo(() => {
    const totalEscolas = escolas.length;
    const escolasComSaldoImportado = new Set<string>();
    let totalRegistrosAprovados = 0;
    const produtosMigradosSet = new Set<string>();

    for (const m of allMovs) {
      if (isSaldoInicial(m)) {
        escolasComSaldoImportado.add(m.school_id);
        totalRegistrosAprovados++;
        produtosMigradosSet.add(m.product_id);
      }
    }
    for (const h of historyList) {
      if (h.schoolId) escolasComSaldoImportado.add(h.schoolId);
    }

    const escolasPendentesConferencia = new Set(
      batchItems
        .filter((b) => b.status === "pendente_conferencia" && b.schoolId)
        .map((b) => b.schoolId),
    );
    const escolasImportadasCount = escolas.filter((e) => escolasComSaldoImportado.has(e.id)).length;
    const escolasAguardandoCount = Math.max(0, totalEscolas - escolasImportadasCount);

    return {
      totalEscolas,
      escolasImportadasCount,
      escolasAguardandoCount,
      escolasPendentesCount: escolasPendentesConferencia.size,
      totalProdutosMigrados: produtosMigradosSet.size,
      totalRegistrosAprovados,
    };
  }, [escolas, allMovs, historyList, batchItems]);

  const activeItem = batchItems[activeIdx] ?? null;
  const activeIndicators = useMemo(
    () => (activeItem ? computeMigrationIndicators(activeItem.rows) : null),
    [activeItem],
  );

  async function handleFilesUpload(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setBusy(true);
    try {
      const defaultSchoolId = escola?.id ?? escolas[0]?.id ?? "";
      const parsedBatch: ParsedStockFileBatchItem[] = [];
      for (const f of files) {
        try {
          const parsed = await parseStockFileForMigration(
            f,
            defaultSchoolId,
            escolas,
            produtos,
            movsPorEscola,
            historyList,
          );
          parsedBatch.push(parsed);
        } catch (err) {
          toast.error(
            `Erro ao processar "${f.name}": ${err instanceof Error ? err.message : "Formato inválido"}`,
          );
        }
      }
      if (parsedBatch.length > 0) {
        setBatchItems((prev) => [...prev, ...parsedBatch]);
        setActiveIdx(batchItems.length);
        setConfirmedApproval(false);
        toast.success(
          `${parsedBatch.length} arquivo(s) lido(s) pela IA! Confira a pré-visualização antes de aprovar o estoque inicial.`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function updateActiveItem(updater: (item: ParsedStockFileBatchItem) => ParsedStockFileBatchItem) {
    setBatchItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== activeIdx) return item;
        const updated = updater(item);
        const movsEscola = movsPorEscola.get(updated.schoolId) ?? [];
        return {
          ...updated,
          rows: evaluateStockRows(updated.rows, produtos, movsEscola),
        };
      }),
    );
    setConfirmedApproval(false);
  }

  function updateRow(rowId: string, patch: Partial<ExtractedStockRow>) {
    updateActiveItem((item) => ({
      ...item,
      rows: item.rows.map((r) => {
        if (r.rowId !== rowId) return r;
        const next = { ...r, ...patch };
        if ("quantidadeRaw" in patch) {
          next.quantidade = parseSmartNumber(patch.quantidadeRaw ?? "");
        }
        return next;
      }),
    }));
  }

  function addManualRow() {
    updateActiveItem((item) => ({
      ...item,
      rows: [
        ...item.rows,
        {
          rowId: crypto.randomUUID(),
          originalRowIndex: item.rows.length + 1,
          selected: true,
          produtoNome: "",
          matchedProductId: null,
          quantidadeRaw: "",
          quantidade: null,
          unidadeRaw: "kg",
          unidade: "kg",
          unidadeReconhecida: true,
          categoria: "Mercearia",
          origem: "mercado",
          origemInformada: true,
          lote: "",
          validade: "",
          fornecedor: "",
          estoqueSistemaAtual: 0,
          divergenciaValor: 0,
          issues: ["quantidade_ausente"],
          situacaoLabel: "Informar produto e quantidade",
          acaoDivergencia: "registrar_saldo_inicial",
        },
      ],
    }));
  }

  async function aprovarArquivoAtivo() {
    if (!activeItem) return;
    if (!confirmedApproval) {
      toast.error(
        "Marque a caixa de confirmação autorizando a conversão em Saldo Inicial Importado.",
      );
      return;
    }
    const targetSchool = escolas.find((e) => e.id === activeItem.schoolId);
    if (!targetSchool) {
      toast.error("Selecione a unidade escolar responsável pelo estoque.");
      return;
    }

    setBusy(true);
    try {
      const result = await approveAndCommitStockMigration({
        batchItem: activeItem,
        schoolName: targetSchool.nome,
        responsibleUser: nome || targetSchool.responsavel || "Administrador",
        produtosExistentes: produtos,
      });
      setBatchItems((prev) =>
        prev.map((b, i) => (i === activeIdx ? { ...b, status: "aprovado" } : b)),
      );
      setHistoryList(getLocalMigrationHistory());
      setConfirmedApproval(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["produtos"] }),
        qc.invalidateQueries({ queryKey: ["movimentos"] }),
        qc.invalidateQueries({ queryKey: ["movimentos-rede"] }),
      ]);
      toast.success(
        `Estoque inicial aprovado para ${targetSchool.nome}! ${result.importedMovementsCount} lançamento(s) de "Saldo Inicial Importado" registrado(s) e ${result.createdProductsCount} novo(s) produto(s) cadastrado(s).`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aprovar estoque inicial.");
    } finally {
      setBusy(false);
    }
  }

  async function aprovarLoteCompleto() {
    const pendentes = batchItems.filter((b) => b.status === "pendente_conferencia");
    if (pendentes.length === 0) return;
    if (!confirmedApproval) {
      toast.error("Confirme a revisão na caixa de seleção antes de aprovar o lote.");
      return;
    }
    setBusy(true);
    let okFiles = 0;
    let totalItems = 0;
    try {
      for (const item of pendentes) {
        const targetSchool = escolas.find((e) => e.id === item.schoolId);
        if (!targetSchool) continue;
        const res = await approveAndCommitStockMigration({
          batchItem: item,
          schoolName: targetSchool.nome,
          responsibleUser: nome || targetSchool.responsavel || "Administrador",
          produtosExistentes: produtos,
        });
        okFiles++;
        totalItems += res.importedMovementsCount;
      }
      setBatchItems((prev) => prev.map((b) => ({ ...b, status: "aprovado" })));
      setHistoryList(getLocalMigrationHistory());
      setConfirmedApproval(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["produtos"] }),
        qc.invalidateQueries({ queryKey: ["movimentos"] }),
        qc.invalidateQueries({ queryKey: ["movimentos-rede"] }),
      ]);
      toast.success(
        `Migração em lote concluída: ${okFiles} escola(s)/arquivo(s) aprovado(s) com ${totalItems} registro(s) de Saldo Inicial Importado!`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro durante aprovação em lote.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar Estoque Existente"
        desc="Migração inteligente de planilhas e documentos das unidades escolares para início imediato como Saldo Inicial Importado"
      >
        <div className="flex gap-2">
          <Button
            variant={tab === "importar" ? "default" : "outline"}
            onClick={() => setTab("importar")}
          >
            <Upload className="h-4 w-4" /> Importar e Conferir
          </Button>
          <Button
            variant={tab === "historico" ? "default" : "outline"}
            onClick={() => setTab("historico")}
          >
            <History className="h-4 w-4" /> Histórico da Migração ({historyList.length})
          </Button>
        </div>
      </PageHeader>

      {/* 13.9 Painel de Acompanhamento da Migração */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Panel className="p-3">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">
            Escolas cadastradas
          </div>
          <div className="mt-1 font-display text-2xl font-bold">{painelMigracao.totalEscolas}</div>
        </Panel>
        <Panel className="p-3">
          <div className="text-[11px] font-semibold uppercase text-entrada">
            Com estoque importado
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-entrada">
            {painelMigracao.escolasImportadasCount}
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">
            Aguardando importação
          </div>
          <div className="mt-1 font-display text-2xl font-bold">
            {painelMigracao.escolasAguardandoCount}
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="text-[11px] font-semibold uppercase text-warning">
            Pendentes de conferência
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-warning">
            {painelMigracao.escolasPendentesCount}
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="text-[11px] font-semibold uppercase text-primary">Produtos migrados</div>
          <div className="mt-1 font-display text-2xl font-bold text-primary">
            {painelMigracao.totalProdutosMigrados}
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="text-[11px] font-semibold uppercase text-saldo">Registros aprovados</div>
          <div className="mt-1 font-display text-2xl font-bold text-saldo">
            {painelMigracao.totalRegistrosAprovados}
          </div>
        </Panel>
      </div>

      {tab === "importar" ? (
        <div className="space-y-6">
          {canWrite && (
            <Panel className="border-2 border-dashed bg-muted/20 p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.pdf,.docx,.doc,.csv,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void handleFilesUpload(e.target.files);
                }}
              />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) void handleFilesUpload(e.dataTransfer.files);
                }}
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h2 className="font-display text-lg font-bold">
                  Enviar Planilhas ou Documentos de Estoque Atual (Individual ou em Lote)
                </h2>
                <p className="mx-auto mt-1 max-w-2xl text-xs text-muted-foreground">
                  Formatos aceitos:{" "}
                  <b>
                    Excel (.xlsx e .xls), PDF, Word (.docx e .doc), CSV, fotos e imagens (JPG/PNG)
                  </b>{" "}
                  de planilhas impressas ou documentos digitalizados. A IA reconhece automaticamente
                  sinônimos (Produto/Descrição, Quantidade disponível/Saldo), vincula à unidade
                  escolar e gera uma prévia sem inventar informações ausentes.
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <Button disabled={busy} onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />{" "}
                    {busy
                      ? "Lendo e interpretando arquivos com IA…"
                      : "Selecionar Arquivo(s) de Estoque"}
                  </Button>
                </div>
              </div>
            </Panel>
          )}

          {batchItems.length > 0 && (
            <div className="space-y-4">
              {/* Barra de arquivos do lote */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                  <Layers className="h-4 w-4" /> Arquivos enviados ({batchItems.length}):
                </span>
                {batchItems.map((item, idx) => {
                  const sch = escolas.find((e) => e.id === item.schoolId);
                  return (
                    <Button
                      key={item.batchItemId}
                      size="sm"
                      variant={idx === activeIdx ? "default" : "outline"}
                      onClick={() => {
                        setActiveIdx(idx);
                        setConfirmedApproval(false);
                      }}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {item.fileName} ({sch?.nome ?? "Selecionar escola"})
                      {item.status === "aprovado" && (
                        <span className="ml-1 rounded bg-entrada px-1.5 text-[10px] text-white">
                          Aprovado
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>

              {activeItem && activeIndicators && (
                <Panel className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-lg font-bold">{activeItem.fileName}</h3>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            activeItem.status === "aprovado"
                              ? "bg-entrada-soft text-entrada"
                              : "bg-warning-soft text-warning"
                          }`}
                        >
                          {activeItem.status === "aprovado"
                            ? "Estoque Inicial Oficializado"
                            : "Aguardando Conferência e Aprovação"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Os valores aprovados serão gravados como lançamento específico{" "}
                        <b>"Saldo Inicial Importado"</b>, sem duplicar relatórios de novas compras.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">
                          Unidade Escolar vinculada{" "}
                          {activeItem.schoolDetectedAuto && (
                            <span className="text-entrada">(Identificada pela IA)</span>
                          )}
                        </Label>
                        <NSelect
                          disabled={!isAdmin && !!escola}
                          value={activeItem.schoolId}
                          onChange={(e) =>
                            updateActiveItem((it) => ({
                              ...it,
                              schoolId: e.target.value,
                              schoolDetectedAuto: false,
                            }))
                          }
                          className="mt-1 min-w-56"
                        >
                          <option value="">Selecione a escola…</option>
                          {escolas.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.nome}
                            </option>
                          ))}
                        </NSelect>
                      </div>
                      <div>
                        <Label className="text-xs">Data de referência do estoque inicial</Label>
                        <Input
                          type="date"
                          className="mt-1"
                          value={activeItem.referenceDate}
                          onChange={(e) =>
                            updateActiveItem((it) => ({ ...it, referenceDate: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {activeItem.warnings.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-warning/40 bg-warning-soft/50 p-3 text-xs">
                      {activeItem.warnings.map((w) => (
                        <div key={w} className="flex items-center gap-2 text-warning">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 13.4 Indicadores de conferência */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <div className="rounded-lg border bg-entrada-soft/40 p-2.5 text-center">
                      <div className="text-[11px] font-semibold text-entrada">Identificados OK</div>
                      <div className="text-lg font-bold text-entrada">
                        {activeIndicators.identificadosCorretamente}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-warning-soft/40 p-2.5 text-center">
                      <div className="text-[11px] font-semibold text-warning">
                        Precisam conferência
                      </div>
                      <div className="text-lg font-bold text-warning">
                        {activeIndicators.precisamConferencia}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-muted p-2.5 text-center">
                      <div className="text-[11px] font-semibold text-muted-foreground">
                        Produtos duplicados
                      </div>
                      <div className="text-lg font-bold">{activeIndicators.duplicados}</div>
                    </div>
                    <div className="rounded-lg border bg-muted p-2.5 text-center">
                      <div className="text-[11px] font-semibold text-muted-foreground">
                        Unid. incompatível
                      </div>
                      <div className="text-lg font-bold">
                        {activeIndicators.unidadeIncompativel}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-saida-soft/40 p-2.5 text-center">
                      <div className="text-[11px] font-semibold text-destructive">
                        Qtd. ausentes
                      </div>
                      <div className="text-lg font-bold text-destructive">
                        {activeIndicators.quantidadesAusentes}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-primary/10 p-2.5 text-center">
                      <div className="text-[11px] font-semibold text-primary">
                        Divergências saldo
                      </div>
                      <div className="text-lg font-bold text-primary">
                        {activeIndicators.divergencias}
                      </div>
                    </div>
                  </div>

                  {/* Tabela editável de pré-visualização e conferência */}
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted text-left uppercase text-muted-foreground">
                        <tr>
                          <th className="p-2.5">Importar</th>
                          <th className="p-2.5">Produto identificado</th>
                          <th className="p-2.5">Qtd. encontrada</th>
                          <th className="p-2.5">Unidade</th>
                          <th className="p-2.5">Categoria</th>
                          <th className="p-2.5">Origem</th>
                          <th className="p-2.5">Lote</th>
                          <th className="p-2.5">Validade</th>
                          <th className="p-2.5">Situação / Conferência</th>
                          <th className="p-2.5">Ação (Divergência)</th>
                          <th className="p-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {activeItem.rows.length === 0 && (
                          <tr>
                            <td colSpan={11} className="p-6 text-center text-muted-foreground">
                              Nenhuma linha de produto identificada automaticamente. Adicione
                              manualmente abaixo.
                            </td>
                          </tr>
                        )}
                        {activeItem.rows.map((r) => {
                          const hasAlert =
                            r.issues.includes("quantidade_ausente") ||
                            r.issues.includes("unidade_incompativel") ||
                            r.issues.includes("duplicado_planilha") ||
                            r.issues.includes("divergencia_estoque");
                          return (
                            <tr
                              key={r.rowId}
                              className={`border-t ${hasAlert ? "bg-warning-soft/20" : ""}`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={r.selected}
                                  disabled={activeItem.status === "aprovado"}
                                  onChange={(e) =>
                                    updateRow(r.rowId, { selected: e.target.checked })
                                  }
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  value={r.produtoNome}
                                  disabled={activeItem.status === "aprovado"}
                                  onChange={(e) =>
                                    updateRow(r.rowId, { produtoNome: e.target.value })
                                  }
                                  className="h-8 min-w-44 text-xs"
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  value={r.quantidadeRaw}
                                  disabled={activeItem.status === "aprovado"}
                                  placeholder="Ausente"
                                  onChange={(e) =>
                                    updateRow(r.rowId, { quantidadeRaw: e.target.value })
                                  }
                                  className={`h-8 w-24 text-right text-xs ${
                                    r.issues.includes("quantidade_ausente")
                                      ? "border-destructive"
                                      : ""
                                  }`}
                                />
                              </td>
                              <td className="p-2">
                                <NSelect
                                  value={r.unidade}
                                  disabled={activeItem.status === "aprovado"}
                                  onChange={(e) =>
                                    updateRow(r.rowId, {
                                      unidade: e.target.value as UnidadeApresentacao,
                                      unidadeReconhecida: true,
                                    })
                                  }
                                  className="h-8 min-w-28 text-xs"
                                >
                                  {UNIDADES_APRESENTACAO.map((u) => (
                                    <option key={u} value={u}>
                                      {UNIDADE_APRESENTACAO_LABEL[u]}
                                    </option>
                                  ))}
                                </NSelect>
                              </td>
                              <td className="p-2">
                                <NSelect
                                  value={r.categoria}
                                  disabled={activeItem.status === "aprovado"}
                                  onChange={(e) =>
                                    updateRow(r.rowId, { categoria: e.target.value })
                                  }
                                  className="h-8 min-w-32 text-xs"
                                >
                                  {CATEGORIAS.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </NSelect>
                              </td>
                              <td className="p-2">
                                <NSelect
                                  value={r.origem}
                                  disabled={activeItem.status === "aprovado"}
                                  onChange={(e) =>
                                    updateRow(r.rowId, { origem: e.target.value as Origem })
                                  }
                                  className="h-8 min-w-36 text-xs"
                                >
                                  <option value="mercado">Mercado</option>
                                  <option value="agricultura">Agricultura Familiar</option>
                                </NSelect>
                              </td>
                              <td className="p-2">
                                <Input
                                  value={r.lote}
                                  disabled={activeItem.status === "aprovado"}
                                  placeholder="—"
                                  onChange={(e) => updateRow(r.rowId, { lote: e.target.value })}
                                  className="h-8 w-24 text-xs"
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  type="date"
                                  value={r.validade}
                                  disabled={activeItem.status === "aprovado"}
                                  onChange={(e) => updateRow(r.rowId, { validade: e.target.value })}
                                  className="h-8 w-32 text-xs"
                                />
                              </td>
                              <td className="p-2">
                                <span
                                  className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${
                                    hasAlert
                                      ? "bg-warning-soft text-warning"
                                      : r.issues.includes("produto_novo")
                                        ? "bg-primary/10 text-primary"
                                        : "bg-entrada-soft text-entrada"
                                  }`}
                                >
                                  {r.situacaoLabel}
                                </span>
                              </td>
                              <td className="p-2">
                                <NSelect
                                  value={r.acaoDivergencia}
                                  disabled={activeItem.status === "aprovado"}
                                  onChange={(e) =>
                                    updateRow(r.rowId, {
                                      acaoDivergencia: e.target.value as DivergenceAction,
                                    })
                                  }
                                  className="h-8 min-w-44 text-xs"
                                >
                                  <option value="registrar_saldo_inicial">
                                    Registrar Saldo Inicial ({fmtQ(r.quantidade ?? 0)})
                                  </option>
                                  {r.estoqueSistemaAtual > 0 && (
                                    <option value="ajustar_diferenca">
                                      Ajustar diferença p/ igualar ({fmtQ(r.divergenciaValor)})
                                    </option>
                                  )}
                                  <option value="ignorar">Ignorar este item</option>
                                </NSelect>
                              </td>
                              <td className="p-2 text-right">
                                {activeItem.status !== "aprovado" && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() =>
                                      updateActiveItem((it) => ({
                                        ...it,
                                        rows: it.rows.filter((x) => x.rowId !== r.rowId),
                                      }))
                                    }
                                    aria-label="Remover linha"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {activeItem.status !== "aprovado" && (
                    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
                      <Button variant="outline" size="sm" onClick={addManualRow}>
                        <Plus className="h-4 w-4" /> Adicionar produto manualmente à prévia
                      </Button>

                      <div className="flex flex-col items-end gap-3">
                        <label className="flex items-center gap-2 text-xs font-medium">
                          <input
                            type="checkbox"
                            checked={confirmedApproval}
                            onChange={(e) => setConfirmedApproval(e.target.checked)}
                          />
                          <CheckCircle2 className="h-4 w-4 text-primary" /> Conferi os produtos,
                          quantidades, unidades e escola de destino; autorizo converter em{" "}
                          <b>Saldo Inicial Importado</b>.
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {batchItems.filter((b) => b.status === "pendente_conferencia").length >
                            1 && (
                            <Button
                              variant="outline"
                              disabled={busy || !confirmedApproval}
                              onClick={() => void aprovarLoteCompleto()}
                            >
                              <School className="h-4 w-4" /> Aprovar Todo o Lote (
                              {batchItems.filter((b) => b.status === "pendente_conferencia").length}{" "}
                              escolas)
                            </Button>
                          )}
                          <Button
                            disabled={busy || !confirmedApproval}
                            onClick={() => void aprovarArquivoAtivo()}
                            className="bg-entrada hover:bg-entrada/90"
                          >
                            <Check className="h-4 w-4" /> Confirmar e Converter em Estoque Inicial
                            Oficial
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Panel>
              )}
            </div>
          )}
        </div>
      ) : (
        /* 13.7 Histórico da Migração */
        <Panel className="overflow-x-auto p-0 md:p-0">
          <div className="border-b p-4">
            <h2 className="font-display text-lg font-bold">
              Histórico Completo de Migrações de Estoque
            </h2>
            <p className="text-xs text-muted-foreground">
              Registro auditável dos arquivos originais importados, escolas vinculadas, quantidades
              aprovadas e responsável pela conferência.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Arquivo Original</th>
                <th className="p-3">Unidade Escolar</th>
                <th className="p-3">Data / Hora Importação</th>
                <th className="p-3">Responsável</th>
                <th className="p-3 text-right">Identificados</th>
                <th className="p-3 text-right">Importados</th>
                <th className="p-3 text-right">Pendentes</th>
                <th className="p-3">Resultado</th>
                <th className="p-3">Modelo utilizado</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {historyList.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-muted-foreground">
                    Nenhuma migração de estoque realizada até o momento.
                  </td>
                </tr>
              )}
              {historyList.map((h) => (
                <tr key={h.id} className="border-t">
                  <td className="p-3 font-medium">{h.fileName}</td>
                  <td className="p-3">{h.schoolName}</td>
                  <td className="p-3 whitespace-nowrap">
                    {new Date(h.importedAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3">{h.responsibleUser}</td>
                  <td className="p-3 text-right tabular-nums">{h.totalIdentified}</td>
                  <td className="p-3 text-right font-bold tabular-nums text-entrada">
                    {h.totalImported}
                  </td>
                  <td className="p-3 text-right tabular-nums">{h.totalPending}</td>
                  <td className="p-3">
                    <span className="rounded bg-entrada-soft px-2 py-0.5 text-xs font-semibold text-entrada">
                      {h.conferenceResult === "aprovado_integral"
                        ? "Aprovado Integral"
                        : "Aprovado Parcial"}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{h.modelVersionUsed}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setInspectRecord(h)}>
                      <Eye className="h-3.5 w-3.5" /> Consultar Original e Dados
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Dialog open={!!inspectRecord} onOpenChange={(o) => !o && setInspectRecord(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Detalhes da Migração: {inspectRecord?.fileName} — {inspectRecord?.schoolName}
            </DialogTitle>
          </DialogHeader>
          {inspectRecord && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 sm:grid-cols-4">
                <div>
                  <b>Data de Referência:</b> {fmtData(inspectRecord.referenceDate)}
                </div>
                <div>
                  <b>Responsável:</b> {inspectRecord.responsibleUser}
                </div>
                <div>
                  <b>Produtos Importados:</b> {inspectRecord.totalImported} de{" "}
                  {inspectRecord.totalIdentified}
                </div>
                <div>
                  <b>Modelo:</b> {inspectRecord.modelVersionUsed}
                </div>
              </div>
              {inspectRecord.previewImage && (
                <div>
                  <div className="mb-1 font-semibold">
                    Pré-visualização preservada do documento original:
                  </div>
                  <img
                    src={inspectRecord.previewImage}
                    alt="Documento original"
                    className="max-h-64 w-full rounded border object-contain"
                  />
                </div>
              )}
              <div>
                <div className="mb-1 font-semibold">
                  Itens convertidos em Saldo Inicial Importado:
                </div>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted text-left">
                      <tr>
                        <th className="p-2">Produto</th>
                        <th className="p-2 text-right">Quantidade</th>
                        <th className="p-2">Unidade</th>
                        <th className="p-2">Categoria</th>
                        <th className="p-2">Origem</th>
                        <th className="p-2">Lote / Validade</th>
                        <th className="p-2">Lançamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectRecord.importedItems.map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 font-medium">{it.produtoNome}</td>
                          <td className="p-2 text-right font-semibold tabular-nums">
                            {fmtQ(it.quantidade)}
                          </td>
                          <td className="p-2">{it.unidade}</td>
                          <td className="p-2">{it.categoria}</td>
                          <td className="p-2">
                            {it.origem === "agricultura" ? "Agricultura Familiar" : "Mercado"}
                          </td>
                          <td className="p-2">
                            {[
                              it.lote ? `Lote ${it.lote}` : "",
                              it.validade ? fmtData(it.validade) : "",
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                          <td className="p-2 text-primary">{it.acao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
