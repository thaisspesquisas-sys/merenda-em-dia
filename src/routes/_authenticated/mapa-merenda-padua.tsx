import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  ImagePlus,
  Lock,
  Pencil,
  Printer,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
  Unlock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, useApp, useFechamentos, useMovimentos, useProdutos } from "@/lib/app-context";
import { computeMensal, fmtQ, MESES, weekRangesOfMonth, type LinhaMensal } from "@/lib/estoque";
import {
  criarRelatorioPaduaEmBranco,
  criarRelatorioPaduaValoresOriginaisPDF,
  diagnosticarMapaOficial,
  listarRelatoriosPaduaSalvos,
  normalizeLogoImageFile,
  obterRelatorioSalvoMes,
  preencherRelatorioComEstoqueReal,
  recalcLinhaPag1,
  recalcLinhaPag3e4,
  salvarRelatorioPadua,
  savePaduaCustomLogos,
  type RelatorioOficialPaduaData,
} from "@/lib/padua-relatorio-oficial";
import { exportarPdfRelatorioPadua4Paginas } from "@/lib/padua-pdf-export";
import {
  BrasaoPaduaSvg,
  LogoSecretariaEducacaoSvg,
  RelatorioPaduaOficialView,
} from "@/components/RelatorioPaduaOficialView";
import { Kpi, MesAno, NSelect, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/mapa-merenda-padua")({
  head: () =>
    pageMeta(
      "Mapa Oficial PDF — Quatro Páginas",
      "Módulo principal e único de preenchimento automático, conferência, fechamento mensal, histórico e impressão do Mapa Oficial de Controle da Merenda Escolar (4 Páginas).",
    ),
  component: MapaMerendaPaduaPage,
});

function MapaMerendaPaduaPage() {
  const { escola, nome, canWrite, isAdmin } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);
  const fechs = useFechamentos(escola?.id);
  const qc = useQueryClient();

  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [semanaIdx, setSemanaIdx] = useState(0);

  const [modoTela, setModoTela] = useState<
    "visualizar" | "editar_folha" | "editar_celular" | "historico"
  >("editar_folha");
  const [abaCelular, setAbaCelular] = useState<"p1" | "p2" | "p3" | "p4">("p1");
  const [busySave, setBusySave] = useState(false);
  const [histVersion, setHistVersion] = useState(0);
  const [openLogosModal, setOpenLogosModal] = useState(false);
  const [openFecharModal, setOpenFecharModal] = useState(false);
  const [obsFechamento, setObsFechamento] = useState("");
  const [modoDemoPdfOriginal, setModoDemoPdfOriginal] = useState(false);

  const [relatorio, setRelatorio] = useState<RelatorioOficialPaduaData>(() =>
    criarRelatorioPaduaEmBranco({
      escola,
      ano: now.getFullYear(),
      mes: now.getMonth() + 1,
      emitidoPor: nome || escola?.responsavel || "",
    }),
  );

  const weeks = useMemo(() => weekRangesOfMonth(ano, mes), [ano, mes]);

  const fechado = useMemo(
    () => (fechs.data ?? []).find((f) => f.ano === ano && f.mes === mes) ?? null,
    [fechs.data, ano, mes],
  );

  const historicoSalvo = useMemo(() => {
    void histVersion;
    return listarRelatoriosPaduaSalvos(escola?.id);
  }, [escola?.id, histVersion]);

  // Preenchimento automático reativo ao selecionar Mês, Ano, Semana ou quando o estoque recebe entradas/saídas
  useEffect(() => {
    if (!escola || modoDemoPdfOriginal) return;

    const salvoMesAtual = obterRelatorioSalvoMes(escola.id, ano, mes);

    // Se o mês já está fechado e possui mapa salvo no histórico, preserva exatamente o mapa congelado
    if (fechado && salvoMesAtual) {
      setRelatorio(salvoMesAtual);
      return;
    }

    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? ano - 1 : ano;
    const salvoMesAnterior = obterRelatorioSalvoMes(escola.id, anoAnt, mesAnt);

    const baseParaPreencher =
      salvoMesAtual ??
      criarRelatorioPaduaEmBranco({
        escola,
        ano,
        mes,
        emitidoPor: nome || escola.responsavel || "",
      });

    const { relatorio: preenchido } = preencherRelatorioComEstoqueReal({
      relatorioAtual: baseParaPreencher,
      escola,
      produtos: prods.data ?? [],
      movimentos: movs.data ?? [],
      ano,
      mes,
      semanaIdx,
      snapshotFechado: fechado ? (fechado.snapshot as LinhaMensal[]) : null,
      relatorioMesAnterior: salvoMesAnterior,
    });

    setRelatorio(preenchido);
  }, [escola, ano, mes, semanaIdx, prods.data, movs.data, fechado, nome, modoDemoPdfOriginal]);

  const diagnostico = useMemo(
    () =>
      diagnosticarMapaOficial({
        relatorio,
        produtos: prods.data ?? [],
        movimentos: movs.data ?? [],
        ano,
        mes,
      }),
    [relatorio, prods.data, movs.data, ano, mes],
  );

  if (!escola) {
    return (
      <>
        <PageHeader title="Mapa Oficial PDF — Quatro Páginas" />
        <SemEscola />
      </>
    );
  }

  function handleSelecionarMes(novoMes: number) {
    setModoDemoPdfOriginal(false);
    setSemanaIdx(0);
    setMes(novoMes);
  }

  function handleSelecionarAno(novoAno: number) {
    setModoDemoPdfOriginal(false);
    setSemanaIdx(0);
    setAno(novoAno);
  }

  function handleGerarEmBranco() {
    if (fechado) {
      toast.error("Este mês está fechado e congelado. Reabra o mês para limpar os campos.");
      return;
    }
    setModoDemoPdfOriginal(true);
    const novo = criarRelatorioPaduaEmBranco({
      escola,
      ano,
      mes,
      emitidoPor: nome || escola?.responsavel || "",
    });
    setRelatorio(novo);
    toast.success("Versão em branco das 4 páginas gerada para preenchimento!");
  }

  function handleCarregarOriginalPdf() {
    setModoDemoPdfOriginal(true);
    const orig = criarRelatorioPaduaValoresOriginaisPDF(escola, nome);
    setRelatorio(orig);
    setMes(10);
    setAno(2026);
    toast.success("Modelo de referência do PDF original (Outubro/2026) carregado!");
  }

  function handlePreencherComEstoqueReal() {
    if (!escola) return;
    setModoDemoPdfOriginal(false);
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? ano - 1 : ano;
    const salvoMesAnterior = obterRelatorioSalvoMes(escola.id, anoAnt, mesAnt);

    const { relatorio: preenchido, generosCorrespondidos } = preencherRelatorioComEstoqueReal({
      relatorioAtual: relatorio,
      escola,
      produtos: prods.data ?? [],
      movimentos: movs.data ?? [],
      ano,
      mes,
      semanaIdx,
      snapshotFechado: fechado ? (fechado.snapshot as LinhaMensal[]) : null,
      relatorioMesAnterior: salvoMesAnterior,
    });
    setRelatorio(preenchido);
    toast.success(
      `Sincronização automática concluída! ${generosCorrespondidos} gênero(s) atualizado(s) com os lançamentos reais de ${MESES[mes - 1]}/${ano}.`,
    );
  }

  async function handleSalvarRelatorio() {
    if (!canWrite && !isAdmin) {
      toast.error("Somente usuários autorizados podem salvar alterações no relatório.");
      return;
    }
    setBusySave(true);
    try {
      const salvo = await salvarRelatorioPadua({
        ...relatorio,
        schoolId: escola.id,
        schoolName: escola.nome,
        ano,
        mes,
        emitidoPor: nome || escola.responsavel || "Responsável pela Merenda",
      });
      setRelatorio(salvo);
      setHistVersion((v) => v + 1);
      toast.success(
        `Mapa Oficial de ${MESES[mes - 1]}/${ano} salvo no histórico da unidade escolar!`,
      );
    } catch {
      toast.error("Não foi possível salvar o relatório.");
    } finally {
      setBusySave(false);
    }
  }

  async function handleFecharMes() {
    if (!escola) return;
    setBusySave(true);
    try {
      const snapshotMensal = computeMensal(prods.data ?? [], movs.data ?? [], ano, mes);
      const { error } = await supabase.from("monthly_closings").insert({
        school_id: escola.id,
        ano,
        mes,
        responsavel: nome || escola.responsavel || "Responsável pela Merenda",
        observacoes: obsFechamento || null,
        snapshot: snapshotMensal as unknown as Json,
      });
      if (error && error.code !== "23505") {
        toast.error(errMsg(error));
        setBusySave(false);
        return;
      }
      const salvo = await salvarRelatorioPadua({
        ...relatorio,
        schoolId: escola.id,
        schoolName: escola.nome,
        ano,
        mes,
        emitidoPor: nome || escola.responsavel || "Responsável pela Merenda",
      });
      setRelatorio(salvo);
      setHistVersion((v) => v + 1);
      setOpenFecharModal(false);
      setObsFechamento("");
      await qc.invalidateQueries({ queryKey: ["fechamentos"] });
      toast.success(
        `${MESES[mes - 1]}/${ano} fechado! O saldo final deste mês foi congelado e transferido automaticamente como Estoque Anterior de ${MESES[mes % 12]}/${mes === 12 ? ano + 1 : ano}.`,
      );
    } finally {
      setBusySave(false);
    }
  }

  async function handleReabrirMes() {
    if (!fechado || !isAdmin) return;
    if (
      !confirm(
        `Reabrir o mês de ${MESES[mes - 1]}/${ano} para correção administrativa? A ação ficará registrada na auditoria.`,
      )
    ) {
      return;
    }
    const { error } = await supabase.from("monthly_closings").delete().eq("id", fechado.id);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["fechamentos"] });
    toast.success(`Mês de ${MESES[mes - 1]}/${ano} reaberto para atualização.`);
  }

  function handleBaixarPdf() {
    if (diagnostico.camposFaltantes.length > 0) {
      toast.info(
        `PDF gerado! Atenção: há ${diagnostico.camposFaltantes.length} campo(s) complementar(es) em branco sinalizado(s) no painel de conferência.`,
      );
    } else {
      toast.success("PDF de 4 páginas gerado com fidelidade ao documento oficial!");
    }
    exportarPdfRelatorioPadua4Paginas(relatorio);
  }

  async function handleTrocarLogoArquivo(side: "left" | "right", file: File) {
    try {
      const dataUrl = await normalizeLogoImageFile(file);
      const next: RelatorioOficialPaduaData =
        side === "left"
          ? { ...relatorio, logoEsquerdaDataUrl: dataUrl }
          : { ...relatorio, logoDireitaDataUrl: dataUrl };
      setRelatorio(next);
      savePaduaCustomLogos({
        logoEsquerdaDataUrl: next.logoEsquerdaDataUrl ?? null,
        logoDireitaDataUrl: next.logoDireitaDataUrl ?? null,
        prefeitura: next.prefeitura,
        estado: next.estado,
        secretaria: next.secretaria,
        departamento: next.departamento,
      });
      toast.success(
        side === "left"
          ? "Logo esquerda (Brasão) atualizada nas páginas 1, 2 e 3!"
          : "Logo direita (Secretaria de Educação) atualizada nas páginas 1, 2 e 3!",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar a imagem da logo.");
    }
  }

  function handleSalvarPadraoLogos() {
    savePaduaCustomLogos({
      logoEsquerdaDataUrl: relatorio.logoEsquerdaDataUrl ?? null,
      logoDireitaDataUrl: relatorio.logoDireitaDataUrl ?? null,
      prefeitura: relatorio.prefeitura,
      estado: relatorio.estado,
      secretaria: relatorio.secretaria,
      departamento: relatorio.departamento,
    });
    setOpenLogosModal(false);
    toast.success("Logos e cabeçalho institucional salvos como padrão para o Mapa Oficial!");
  }

  function handleRestaurarLogosOriginais() {
    const next: RelatorioOficialPaduaData = {
      ...relatorio,
      logoEsquerdaDataUrl: null,
      logoDireitaDataUrl: null,
      prefeitura: "Prefeitura Municipal de Santo Antônio de Pádua",
      estado: "Estado do Rio de Janeiro",
      secretaria: "Secretaria Municipal de Educação",
      departamento: "Departamento de Alimentação Escolar",
    };
    setRelatorio(next);
    savePaduaCustomLogos({
      logoEsquerdaDataUrl: null,
      logoDireitaDataUrl: null,
      prefeitura: next.prefeitura,
      estado: next.estado,
      secretaria: next.secretaria,
      departamento: next.departamento,
    });
    toast.success("Logos e cabeçalho originais de Santo Antônio de Pádua restaurados!");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mapa Oficial PDF — Quatro Páginas"
        desc={`Módulo principal e único de controle mensal, semanal e impressão oficial da merenda escolar — ${escola.nome}`}
      >
        <Button variant="outline" size="sm" onClick={() => setOpenLogosModal(true)}>
          <ImagePlus className="h-4 w-4" /> Editar Logos / Brasão
        </Button>
        <Button variant="outline" size="sm" onClick={handleGerarEmBranco}>
          <RotateCcw className="h-4 w-4" /> Versão em Branco
        </Button>
        <Button variant="outline" size="sm" onClick={handleCarregarOriginalPdf}>
          <FileSpreadsheet className="h-4 w-4" /> Modelo PDF Referência
        </Button>
        <Button variant="default" size="sm" onClick={handlePreencherComEstoqueReal}>
          <Sparkles className="h-4 w-4" /> Sincronizar com Estoque
        </Button>
      </PageHeader>

      {/* PAINEL DE RESUMO AUTOMÁTICO E CONTINUIDADE DO MÊS SELECIONADO */}
      <div className="no-print grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="1. Estoque Anterior"
          value={fmtQ(diagnostico.totalAntGeral)}
          sub={`Mercado: ${fmtQ(diagnostico.totalAntMercado)} · Agric. Fam.: ${fmtQ(diagnostico.totalAntAgric)}`}
          tone="default"
        />
        <Kpi
          label="2. Entradas no Mês"
          value={fmtQ(diagnostico.totalEntGeral)}
          sub={`Mercado: ${fmtQ(diagnostico.totalEntMercado)} · Agric. Fam.: ${fmtQ(diagnostico.totalEntAgric)}`}
          tone="entrada"
        />
        <Kpi
          label="3. Saídas no Mês"
          value={fmtQ(diagnostico.totalSaiGeral)}
          sub={`Mercado: ${fmtQ(diagnostico.totalSaiMercado)} · Agric. Fam.: ${fmtQ(diagnostico.totalSaiAgric)}`}
          tone="saida"
        />
        <Kpi
          label="4. Saldo Final Restante"
          value={fmtQ(diagnostico.totalFimGeral)}
          sub={`Mercado: ${fmtQ(diagnostico.totalFimMercado)} · Agric. Fam.: ${fmtQ(diagnostico.totalFimAgric)}`}
          tone="saldo"
        />
        <Kpi
          label="5. Status / Conferência"
          value={
            fechado
              ? "Mês Fechado"
              : diagnostico.camposFaltantes.length === 0
                ? "100% Conferido"
                : `${diagnostico.camposFaltantes.length} pendente(s)`
          }
          sub={`${diagnostico.generosComMovimentoMes} gênero(s) no mês · ${diagnostico.generosComMovimentoSemana} na semana`}
          tone={
            fechado ? "saldo" : diagnostico.camposFaltantes.length === 0 ? "entrada" : "warning"
          }
        />
      </div>

      {/* SINALIZAÇÃO DE CAMPOS FALTANTES E CONFERÊNCIA DE SEGURANÇA ANTES DE GERAR O PDF */}
      {(diagnostico.camposFaltantes.length > 0 ||
        diagnostico.duplicidadesMes.length > 0 ||
        diagnostico.saldosNegativos.length > 0) && (
        <Panel className="no-print border-l-4 border-l-warning bg-warning-soft/25 p-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Conferência antes de gerar o PDF ({MESES[mes - 1]}/{ano})
            </div>
            <span className="text-[11px] text-muted-foreground">
              Verifique os itens sinalizados abaixo para que o Mapa Oficial saia completo
            </span>
          </div>

          {diagnostico.camposFaltantes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {diagnostico.camposFaltantes.map((cf) => (
                <button
                  key={`${cf.pagina}-${cf.campo}`}
                  type="button"
                  onClick={() => {
                    setModoTela("editar_folha");
                    toast.info(
                      `Preencha o campo "${cf.campo}" diretamente na Página ${cf.pagina}.`,
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-background px-2 py-1 text-[11px] font-medium text-foreground transition hover:bg-warning-soft"
                >
                  <span className="rounded bg-warning/20 px-1 font-bold text-warning">
                    Pág. {cf.pagina}
                  </span>
                  <b>{cf.campo}:</b> {cf.descricao}
                </button>
              ))}
            </div>
          )}

          {diagnostico.duplicidadesMes.length > 0 && (
            <div className="mt-2 text-warning">
              <b>Atenção (Possível Duplicidade):</b> Foram identificados{" "}
              {diagnostico.duplicidadesMes.length} lançamento(s) com mesma data, produto e
              quantidade neste mês (ex.: {diagnostico.duplicidadesMes[0]?.produtoNome}).
            </div>
          )}

          {diagnostico.saldosNegativos.length > 0 && (
            <div className="mt-2 text-destructive">
              <b>Alerta de Saldo Negativo:</b> Verifique os valores de{" "}
              {diagnostico.saldosNegativos.slice(0, 4).join(", ")}.
            </div>
          )}
        </Panel>
      )}

      {/* Barra de controles: Seleção de Mês/Ano/Semana + Modos + Fechamento Mensal + PDF/Impressão */}
      <Panel className="no-print space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <MesAno mes={mes} ano={ano} onMes={handleSelecionarMes} onAno={handleSelecionarAno} />
            <NSelect
              value={String(semanaIdx)}
              onChange={(e) => {
                setModoDemoPdfOriginal(false);
                setSemanaIdx(Number(e.target.value));
              }}
              className="w-56"
            >
              {weeks.map((w, idx) => (
                <option key={w.start} value={idx}>
                  {w.label} (Pág. 1)
                </option>
              ))}
            </NSelect>

            {historicoSalvo.length > 0 && (
              <NSelect
                value=""
                onChange={(e) => {
                  const idSel = e.target.value;
                  const enc = historicoSalvo.find((h) => h.id === idSel);
                  if (enc) {
                    setModoDemoPdfOriginal(true);
                    setMes(enc.mes);
                    setAno(enc.ano);
                    setRelatorio(enc);
                    toast.success(
                      `Mapa salvo de ${enc.pag2.mes}/${enc.pag2.ano} carregado para consulta/impressão!`,
                    );
                  }
                }}
                className="w-56"
              >
                <option value="">Consultar meses anteriores salvos…</option>
                {historicoSalvo.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.pag2.mes}/{h.pag2.ano} — {new Date(h.updatedAt).toLocaleDateString("pt-BR")}
                  </option>
                ))}
              </NSelect>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={modoTela === "visualizar" ? "default" : "outline"}
              onClick={() => setModoTela("visualizar")}
            >
              <Eye className="h-4 w-4" /> Visualizar 4 Páginas
            </Button>
            <Button
              size="sm"
              variant={modoTela === "editar_folha" ? "default" : "outline"}
              onClick={() => setModoTela("editar_folha")}
            >
              <Pencil className="h-4 w-4" /> Editar no Documento
            </Button>
            <Button
              size="sm"
              variant={modoTela === "editar_celular" ? "default" : "outline"}
              onClick={() => setModoTela("editar_celular")}
            >
              <Smartphone className="h-4 w-4" /> Preenchimento Celular
            </Button>
            <Button
              size="sm"
              variant={modoTela === "historico" ? "default" : "outline"}
              onClick={() => setModoTela("historico")}
            >
              <History className="h-4 w-4" /> Mapas Anteriores ({historicoSalvo.length})
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {fechado ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-saldo-soft px-2 py-0.5 font-semibold text-saldo">
                <Lock className="h-3.5 w-3.5" /> Mês Fechado e Congelado ({MESES[mes - 1]}/{ano})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-entrada-soft px-2 py-0.5 font-semibold text-entrada">
                <CheckCircle2 className="h-3.5 w-3.5" /> Preenchimento Automático Ativo (
                {MESES[mes - 1]}/{ano})
              </span>
            )}
            <span>
              · Última atualização: <b>{new Date(relatorio.updatedAt).toLocaleString("pt-BR")}</b> ·
              Responsável: <b>{relatorio.emitidoPor || nome || "—"}</b>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpenLogosModal(true)}>
              <ImagePlus className="h-4 w-4" /> Logos do Cabeçalho
            </Button>
            {fechado
              ? isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => void handleReabrirMes()}>
                    <Unlock className="h-4 w-4" /> Reabrir Mês
                  </Button>
                )
              : (canWrite || isAdmin) && (
                  <Button size="sm" variant="outline" onClick={() => setOpenFecharModal(true)}>
                    <Lock className="h-4 w-4" /> Fechar Mês ({MESES[mes - 1]})
                  </Button>
                )}
            <Button
              size="sm"
              disabled={busySave || !!fechado}
              onClick={() => void handleSalvarRelatorio()}
              className="bg-entrada text-white hover:bg-entrada/90"
            >
              <Save className="h-4 w-4" /> {busySave ? "Salvando…" : "Salvar no Histórico"}
            </Button>
            <Button size="sm" onClick={handleBaixarPdf}>
              <Download className="h-4 w-4" /> Baixar em PDF (4 Páginas)
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </div>
        </div>
      </Panel>

      {/* MODO 1 E 2: VISUALIZAÇÃO E EDIÇÃO FIEL NAS 4 PÁGINAS DO DOCUMENTO */}
      {(modoTela === "visualizar" || modoTela === "editar_folha") && (
        <RelatorioPaduaOficialView
          data={relatorio}
          editable={modoTela === "editar_folha" && !fechado && (canWrite || isAdmin)}
          onChange={(next) => {
            setModoDemoPdfOriginal(true);
            setRelatorio(next);
          }}
        />
      )}

      {/* MODO 3: INTERFACE ADAPTADA PARA PREENCHIMENTO RÁPIDO NO CELULAR */}
      {modoTela === "editar_celular" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "p1", label: "Pág. 1 — Controle Semanal (43 itens)" },
              { id: "p2", label: "Pág. 2 — Dados da Escola e Refeições" },
              { id: "p3", label: "Pág. 3 — Mapa Mensal Parte 1 (19 itens)" },
              { id: "p4", label: "Pág. 4 — Mapa Mensal Parte 2 (20 itens)" },
            ].map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={abaCelular === t.id ? "default" : "outline"}
                onClick={() => setAbaCelular(t.id as typeof abaCelular)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {abaCelular === "p1" && (
            <Panel className="space-y-4">
              <h3 className="font-display text-base font-bold">
                Página 1 — Cabeçalho e Controle Semanal
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label className="text-xs">ESCOLA/CRECHE</Label>
                  <Input
                    value={relatorio.pag1.escolaCreche}
                    onChange={(e) =>
                      setRelatorio({
                        ...relatorio,
                        pag1: { ...relatorio.pag1, escolaCreche: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Nº DE ALUNOS</Label>
                  <Input
                    value={relatorio.pag1.numAlunos}
                    onChange={(e) =>
                      setRelatorio({
                        ...relatorio,
                        pag1: { ...relatorio.pag1, numAlunos: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Semana / Dias</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Semana"
                      value={relatorio.pag1.semana}
                      onChange={(e) =>
                        setRelatorio({
                          ...relatorio,
                          pag1: { ...relatorio.pag1, semana: e.target.value },
                        })
                      }
                    />
                    <Input
                      placeholder="Dias"
                      value={relatorio.pag1.dias}
                      onChange={(e) =>
                        setRelatorio({
                          ...relatorio,
                          pag1: { ...relatorio.pag1, dias: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {relatorio.pag1.linhas.map((l, idx) => (
                  <div key={l.genero} className="rounded-xl border bg-muted/20 p-3 text-xs">
                    <div className="mb-2 font-bold text-foreground">{l.genero}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px]">Est. Anterior</Label>
                        <Input
                          type="number"
                          step="any"
                          value={l.estoqueAnterior}
                          onChange={(e) => {
                            const novas = relatorio.pag1.linhas.map((x, i) =>
                              i === idx
                                ? recalcLinhaPag1({ ...x, estoqueAnterior: Number(e.target.value) })
                                : x,
                            );
                            setRelatorio({
                              ...relatorio,
                              pag1: { ...relatorio.pag1, linhas: novas },
                            });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Entrada</Label>
                        <Input
                          type="number"
                          step="any"
                          value={l.entrada}
                          onChange={(e) => {
                            const novas = relatorio.pag1.linhas.map((x, i) =>
                              i === idx
                                ? recalcLinhaPag1({ ...x, entrada: Number(e.target.value) })
                                : x,
                            );
                            setRelatorio({
                              ...relatorio,
                              pag1: { ...relatorio.pag1, linhas: novas },
                            });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Saída</Label>
                        <Input
                          type="number"
                          step="any"
                          value={l.saida}
                          onChange={(e) => {
                            const novas = relatorio.pag1.linhas.map((x, i) =>
                              i === idx
                                ? recalcLinhaPag1({ ...x, saida: Number(e.target.value) })
                                : x,
                            );
                            setRelatorio({
                              ...relatorio,
                              pag1: { ...relatorio.pag1, linhas: novas },
                            });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between border-t pt-1.5 text-[11px]">
                      <span>
                        Est. Atual: <b>{l.estoqueAtual}</b>
                      </span>
                      <span className="text-primary">
                        Est. Final: <b>{l.estoqueFinal}</b>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {abaCelular === "p2" && (
            <Panel className="space-y-4">
              <h3 className="font-display text-base font-bold">
                Página 2 — Mapa de Controle da Merenda Escolar (Capa)
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Escola</Label>
                  <Input
                    value={relatorio.pag2.escola}
                    onChange={(e) =>
                      setRelatorio({
                        ...relatorio,
                        pag2: { ...relatorio.pag2, escola: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Endereço</Label>
                  <Input
                    value={relatorio.pag2.endereco}
                    onChange={(e) =>
                      setRelatorio({
                        ...relatorio,
                        pag2: { ...relatorio.pag2, endereco: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">E-mail</Label>
                  <Input
                    value={relatorio.pag2.email}
                    onChange={(e) =>
                      setRelatorio({
                        ...relatorio,
                        pag2: { ...relatorio.pag2, email: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Nº de dias letivos</Label>
                    <Input
                      value={relatorio.pag2.diasLetivos}
                      onChange={(e) =>
                        setRelatorio({
                          ...relatorio,
                          pag2: { ...relatorio.pag2, diasLetivos: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Nº de merendeiras</Label>
                    <Input
                      value={relatorio.pag2.numMerendeiras}
                      onChange={(e) =>
                        setRelatorio({
                          ...relatorio,
                          pag2: { ...relatorio.pag2, numMerendeiras: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {(abaCelular === "p3" || abaCelular === "p4") && (
            <Panel className="space-y-4">
              <h3 className="font-display text-base font-bold">
                {abaCelular === "p3"
                  ? "Página 3 — Planilha Mensal (Mercado / Agricultura Familiar) - Parte 1"
                  : "Página 4 — Planilha Mensal (Mercado / Agricultura Familiar) - Parte 2"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {(abaCelular === "p3"
                  ? relatorio.pag3e4.linhasPag3
                  : relatorio.pag3e4.linhasPag4
                ).map((l, idx) => {
                  const updateFn = (patch: Partial<typeof l>) => {
                    if (abaCelular === "p3") {
                      const novas = relatorio.pag3e4.linhasPag3.map((x, i) =>
                        i === idx ? recalcLinhaPag3e4({ ...x, ...patch }) : x,
                      );
                      setRelatorio({
                        ...relatorio,
                        pag3e4: { ...relatorio.pag3e4, linhasPag3: novas },
                      });
                    } else {
                      const novas = relatorio.pag3e4.linhasPag4.map((x, i) =>
                        i === idx ? recalcLinhaPag3e4({ ...x, ...patch }) : x,
                      );
                      setRelatorio({
                        ...relatorio,
                        pag3e4: { ...relatorio.pag3e4, linhasPag4: novas },
                      });
                    }
                  };
                  return (
                    <div key={l.genero} className="rounded-xl border bg-muted/20 p-3 text-xs">
                      <div className="mb-2 font-bold">{l.genero}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px]">Est. Ant. MERCADO</Label>
                          <Input
                            type="number"
                            step="any"
                            value={l.antMercado}
                            onChange={(e) => updateFn({ antMercado: Number(e.target.value) })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Est. Ant. AGRIC. FAM.</Label>
                          <Input
                            type="number"
                            step="any"
                            value={l.antAgric}
                            onChange={(e) => updateFn({ antAgric: Number(e.target.value) })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Entrada MERCADO</Label>
                          <Input
                            type="number"
                            step="any"
                            value={l.entMercado}
                            onChange={(e) => updateFn({ entMercado: Number(e.target.value) })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Entrada AGRIC. FAM.</Label>
                          <Input
                            type="number"
                            step="any"
                            value={l.entAgric}
                            onChange={(e) => updateFn({ entAgric: Number(e.target.value) })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Saída MERCADO</Label>
                          <Input
                            type="number"
                            step="any"
                            value={l.saiMercado}
                            onChange={(e) => updateFn({ saiMercado: Number(e.target.value) })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Saída AGRIC. FAM.</Label>
                          <Input
                            type="number"
                            step="any"
                            value={l.saiAgric}
                            onChange={(e) => updateFn({ saiAgric: Number(e.target.value) })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex justify-between border-t pt-1.5 text-[11px]">
                        <span>
                          Saldo Final Mercado: <b>{l.fimMercado}</b>
                        </span>
                        <span className="text-entrada">
                          Saldo Final AF: <b>{l.fimAgric}</b>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* MODO 4: HISTÓRICO DE EMISSÃO E CONSULTA DE RELATÓRIOS ANTERIORES */}
      {modoTela === "historico" && (
        <Panel className="p-0 md:p-0">
          <div className="border-b p-4">
            <h3 className="font-display text-base font-bold">
              Histórico de Emissão — Relatórios Oficiais Salvos ({escola.nome})
            </h3>
            <p className="text-xs text-muted-foreground">
              Consulte, reabra para edição ou exporte novamente em PDF os relatórios salvos desta
              unidade escolar.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Data de Geração / Atualização</th>
                  <th className="p-3">Escola</th>
                  <th className="p-3">Mês / Ano Ref.</th>
                  <th className="p-3">Semana (Pág. 1)</th>
                  <th className="p-3">Responsável</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {historicoSalvo.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Nenhum relatório salvo no histórico desta escola ainda. Clique em
                      &ldquo;Salvar Relatório&rdquo; acima para registrar.
                    </td>
                  </tr>
                )}
                {historicoSalvo.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="whitespace-nowrap p-3 text-xs">
                      {new Date(item.updatedAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-3 font-medium">{item.schoolName}</td>
                    <td className="p-3">
                      {item.pag2.mes} / {item.pag2.ano}
                    </td>
                    <td className="p-3 text-xs">{item.pag1.semana}</td>
                    <td className="p-3">{item.emitidoPor || "—"}</td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-2"
                        onClick={() => {
                          setRelatorio(item);
                          setModoTela("editar_folha");
                          toast.success("Relatório carregado para visualização e edição!");
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Abrir / Editar
                      </Button>
                      <Button size="sm" onClick={() => exportarPdfRelatorioPadua4Paginas(item)}>
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* MODAL DE EDIÇÃO DAS LOGOS E CABEÇALHO DO MAPA OFICIAL */}
      <Dialog open={openLogosModal} onOpenChange={setOpenLogosModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Logos e Cabeçalho do Mapa Oficial (Páginas 1, 2 e 3)</DialogTitle>
            <DialogDescription>
              Envie as imagens oficiais (PNG, JPG, WEBP ou SVG) para substituir o Brasão da
              Prefeitura (esquerda) e a Logo da Secretaria de Educação (direita). As logos são
              aplicadas automaticamente na visualização na tela, na impressão e na exportação do PDF
              de 4 páginas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            {/* Card Logo Esquerda */}
            <div className="flex flex-col items-center justify-between rounded-xl border bg-muted/20 p-4 text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Logo Esquerda (Brasão / Prefeitura)
              </div>
              <div className="my-3 flex h-24 w-full items-center justify-center rounded-lg border bg-white p-2">
                <BrasaoPaduaSvg size={56} customDataUrl={relatorio.logoEsquerdaDataUrl} />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Label
                  htmlFor="upload-logo-esquerda"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <ImagePlus className="h-3.5 w-3.5" /> Enviar Imagem
                </Label>
                <input
                  id="upload-logo-esquerda"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleTrocarLogoArquivo("left", f);
                    e.target.value = "";
                  }}
                />
                {relatorio.logoEsquerdaDataUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRelatorio({ ...relatorio, logoEsquerdaDataUrl: null })}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Usar Brasão Original
                  </Button>
                )}
              </div>
            </div>

            {/* Card Logo Direita */}
            <div className="flex flex-col items-center justify-between rounded-xl border bg-muted/20 p-4 text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Logo Direita (Secretaria de Educação)
              </div>
              <div className="my-3 flex h-24 w-full items-center justify-center rounded-lg border bg-white p-2">
                <LogoSecretariaEducacaoSvg
                  width={100}
                  customDataUrl={relatorio.logoDireitaDataUrl}
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Label
                  htmlFor="upload-logo-direita"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <ImagePlus className="h-3.5 w-3.5" /> Enviar Imagem
                </Label>
                <input
                  id="upload-logo-direita"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleTrocarLogoArquivo("right", f);
                    e.target.value = "";
                  }}
                />
                {relatorio.logoDireitaDataUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRelatorio({ ...relatorio, logoDireitaDataUrl: null })}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Usar Logo Original
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Textos Institucionais do Cabeçalho */}
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">Linha 1 — Prefeitura / Instituição</Label>
              <Input
                value={relatorio.prefeitura}
                onChange={(e) => setRelatorio({ ...relatorio, prefeitura: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Linha 2 — Estado (exibida na Página 2)</Label>
              <Input
                value={relatorio.estado}
                onChange={(e) => setRelatorio({ ...relatorio, estado: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Linha 3 — Secretaria</Label>
              <Input
                value={relatorio.secretaria}
                onChange={(e) => setRelatorio({ ...relatorio, secretaria: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Linha 4 — Departamento / Setor</Label>
              <Input
                value={relatorio.departamento}
                onChange={(e) => setRelatorio({ ...relatorio, departamento: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRestaurarLogosOriginais}
            >
              <RotateCcw className="h-4 w-4" /> Restaurar Padrão Original do PDF
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpenLogosModal(false)}
              >
                Fechar
              </Button>
              <Button type="button" size="sm" onClick={handleSalvarPadraoLogos}>
                <Save className="h-4 w-4" /> Salvar Logos e Aplicar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE FECHAMENTO DO MÊS NO MAPA OFICIAL */}
      <Dialog open={openFecharModal} onOpenChange={setOpenFecharModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Fechar e Congelar Mapa Oficial de {MESES[mes - 1]}/{ano}
            </DialogTitle>
            <DialogDescription>
              Ao fechar este mês, o Mapa Oficial de 4 páginas ficará salvo e protegido no histórico
              da escola, e o Saldo Final ({fmtQ(diagnostico.totalFimGeral)}) será automaticamente
              utilizado como Estoque Anterior de {MESES[mes % 12]}/{mes === 12 ? ano + 1 : ano}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 text-xs">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div>
                Estoque Anterior: <b>{fmtQ(diagnostico.totalAntGeral)}</b>
              </div>
              <div>
                Entradas no Mês: <b className="text-entrada">+{fmtQ(diagnostico.totalEntGeral)}</b>{" "}
                (Mercado: {fmtQ(diagnostico.totalEntMercado)} | Agric. Fam.:{" "}
                {fmtQ(diagnostico.totalEntAgric)})
              </div>
              <div>
                Saídas no Mês: <b className="text-saida">-{fmtQ(diagnostico.totalSaiGeral)}</b>
              </div>
              <div className="border-t pt-1">
                Saldo Final transferido ao próximo mês:{" "}
                <b className="text-saldo">{fmtQ(diagnostico.totalFimGeral)}</b>
              </div>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Observações do Fechamento (opcional)</Label>
              <Input
                value={obsFechamento}
                onChange={(e) => setObsFechamento(e.target.value)}
                placeholder="Ex.: Conferido pela direção e nutricionista RT"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpenFecharModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={busySave} onClick={() => void handleFecharMes()}>
              <Lock className="h-4 w-4" /> Confirmar Fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
