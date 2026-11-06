import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  ImagePlus,
  Pencil,
  Printer,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useApp, useMovimentos, useProdutos } from "@/lib/app-context";
import { weekRangesOfMonth } from "@/lib/estoque";
import {
  criarRelatorioPaduaEmBranco,
  criarRelatorioPaduaValoresOriginaisPDF,
  listarRelatoriosPaduaSalvos,
  normalizeLogoImageFile,
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
import { MesAno, NSelect, PageHeader, Panel, SemEscola } from "@/components/ui-kit";
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

export const Route = createFileRoute("/_authenticated/mapa-merenda-padua")({
  head: () =>
    pageMeta(
      "Mapa Oficial de Controle da Merenda (Modelo Fiel PDF 4 Páginas)",
      "Reprodução fiel das 4 páginas do Mapa de Controle da Merenda Escolar da Secretaria Municipal de Educação de Santo Antônio de Pádua, com preenchimento inteligente, edição, histórico e exportação PDF.",
    ),
  component: MapaMerendaPaduaPage,
});

function MapaMerendaPaduaPage() {
  const { escola, nome, canWrite, isAdmin } = useApp();
  const prods = useProdutos();
  const movs = useMovimentos(escola?.id);

  const now = new Date();
  const [mes, setMes] = useState(10);
  const [ano, setAno] = useState(now.getFullYear());
  const [semanaIdx, setSemanaIdx] = useState(0);

  const [modoTela, setModoTela] = useState<
    "visualizar" | "editar_folha" | "editar_celular" | "historico"
  >("editar_folha");
  const [abaCelular, setAbaCelular] = useState<"p1" | "p2" | "p3" | "p4">("p1");
  const [busySave, setBusySave] = useState(false);
  const [histVersion, setHistVersion] = useState(0);
  const [openLogosModal, setOpenLogosModal] = useState(false);

  const [relatorio, setRelatorio] = useState<RelatorioOficialPaduaData>(() =>
    criarRelatorioPaduaValoresOriginaisPDF(escola, nome),
  );

  const weeks = useMemo(() => weekRangesOfMonth(ano, mes), [ano, mes]);

  const historicoSalvo = useMemo(() => {
    void histVersion;
    return listarRelatoriosPaduaSalvos(escola?.id);
  }, [escola?.id, histVersion]);

  if (!escola) {
    return (
      <>
        <PageHeader title="Mapa Oficial da Merenda Escolar (Modelo PDF 4 Páginas)" />
        <SemEscola />
      </>
    );
  }

  function handleGerarEmBranco() {
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
    const orig = criarRelatorioPaduaValoresOriginaisPDF(escola, nome);
    setRelatorio(orig);
    setMes(10);
    setAno(2026);
    toast.success("Dados idênticos ao PDF original anexado (Outubro/2026) carregados!");
  }

  function handlePreencherComEstoqueReal() {
    if (!escola) return;
    const { relatorio: preenchido, generosCorrespondidos } = preencherRelatorioComEstoqueReal({
      relatorioAtual: relatorio,
      escola,
      produtos: prods.data ?? [],
      movimentos: movs.data ?? [],
      ano,
      mes,
      semanaIdx,
    });
    setRelatorio(preenchido);
    toast.success(
      `Preenchimento inteligente concluído! ${generosCorrespondidos} gênero(s) atualizado(s) a partir do estoque real da escola.`,
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
      toast.success("Relatório oficial salvo e registrado no histórico de emissão da escola!");
    } catch {
      toast.error("Não foi possível salvar o relatório.");
    } finally {
      setBusySave(false);
    }
  }

  function handleBaixarPdf() {
    exportarPdfRelatorioPadua4Paginas(relatorio);
    toast.success("PDF de 4 páginas gerado com fidelidade ao documento original!");
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
        title="Mapa de Controle da Merenda Escolar (Modelo Oficial PDF — 4 Páginas)"
        desc={`Reprodução visual e estrutural fiel do documento da SME de Santo Antônio de Pádua — ${escola.nome}`}
      >
        <Button variant="outline" size="sm" onClick={() => setOpenLogosModal(true)}>
          <ImagePlus className="h-4 w-4" /> Editar Logos / Brasão
        </Button>
        <Button variant="outline" size="sm" onClick={handleGerarEmBranco}>
          <RotateCcw className="h-4 w-4" /> Versão em Branco
        </Button>
        <Button variant="outline" size="sm" onClick={handleCarregarOriginalPdf}>
          <FileSpreadsheet className="h-4 w-4" /> Dados do PDF Original
        </Button>
        <Button variant="default" size="sm" onClick={handlePreencherComEstoqueReal}>
          <Sparkles className="h-4 w-4" /> Preencher com Estoque da Escola
        </Button>
      </PageHeader>

      {/* Barra de controles: Período + Modos (Visualizar, Editar na Folha, Editar no Celular, Salvar, PDF, Imprimir, Histórico) */}
      <Panel className="no-print space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <MesAno mes={mes} ano={ano} onMes={setMes} onAno={setAno} />
            <NSelect
              value={String(semanaIdx)}
              onChange={(e) => setSemanaIdx(Number(e.target.value))}
              className="w-56"
            >
              {weeks.map((w, idx) => (
                <option key={w.start} value={idx}>
                  {w.label}
                </option>
              ))}
            </NSelect>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={modoTela === "visualizar" ? "default" : "outline"}
              onClick={() => setModoTela("visualizar")}
            >
              <Eye className="h-4 w-4" /> Visualizar Relatório
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
              <History className="h-4 w-4" /> Histórico ({historicoSalvo.length})
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="text-xs text-muted-foreground">
            Última atualização: <b>{new Date(relatorio.updatedAt).toLocaleString("pt-BR")}</b> ·
            Responsável: <b>{relatorio.emitidoPor || nome || "—"}</b>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpenLogosModal(true)}>
              <ImagePlus className="h-4 w-4" /> Logos do Cabeçalho
            </Button>
            <Button
              size="sm"
              disabled={busySave}
              onClick={() => void handleSalvarRelatorio()}
              className="bg-entrada text-white hover:bg-entrada/90"
            >
              <Save className="h-4 w-4" /> {busySave ? "Salvando…" : "Salvar Relatório"}
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
          editable={modoTela === "editar_folha" && (canWrite || isAdmin)}
          onChange={setRelatorio}
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
    </div>
  );
}
