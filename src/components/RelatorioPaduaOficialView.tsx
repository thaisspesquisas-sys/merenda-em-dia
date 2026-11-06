import { useRef, useState } from "react";
import {
  normalizeLogoImageFile,
  recalcLinhaPag1,
  recalcLinhaPag3e4,
  savePaduaCustomLogos,
  type LinhaPag1Semanal,
  type LinhaPag3e4Mensal,
  type RelatorioOficialPaduaData,
} from "@/lib/padua-relatorio-oficial";

interface RelatorioPaduaOficialViewProps {
  data: RelatorioOficialPaduaData;
  editable: boolean;
  onChange: (next: RelatorioOficialPaduaData) => void;
}

function fmtNum(n: number): string {
  if (n === 0 || Number.isNaN(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
}

/** Brasão Vetorial Fiel da Prefeitura Municipal de Santo Antônio de Pádua (ou logo customizada) */
export function BrasaoPaduaSvg({
  size = 54,
  customDataUrl,
  editable,
  onSelectFile,
}: {
  size?: number;
  customDataUrl?: string | null;
  editable?: boolean;
  onSelectFile?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const content = customDataUrl ? (
    <img
      src={customDataUrl}
      alt="Brasão / Logo Esquerda"
      style={{ width: size, height: size * 1.15 }}
      className="shrink-0 object-contain"
    />
  ) : (
    <svg
      width={size}
      height={size * 1.15}
      viewBox="0 0 100 115"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      {/* Coroa mural */}
      <rect
        x="20"
        y="4"
        width="60"
        height="16"
        rx="2"
        fill="#A68F58"
        stroke="#222"
        strokeWidth="2"
      />
      <rect x="24" y="0" width="10" height="6" fill="#A68F58" stroke="#222" strokeWidth="1.5" />
      <rect x="45" y="0" width="10" height="6" fill="#A68F58" stroke="#222" strokeWidth="1.5" />
      <rect x="66" y="0" width="10" height="6" fill="#A68F58" stroke="#222" strokeWidth="1.5" />
      {/* Ramos laterais */}
      <path d="M12 30 C4 55, 8 82, 22 95" stroke="#1E7B3A" strokeWidth="5" strokeLinecap="round" />
      <path
        d="M88 30 C96 55, 92 82, 78 95"
        stroke="#1E7B3A"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Escudo central */}
      <path
        d="M20 22 H80 V62 C80 82 50 94 50 94 C50 94 20 82 20 62 Z"
        fill="#1D70B8"
        stroke="#111"
        strokeWidth="2.5"
      />
      <path d="M21 62 C21 80 50 93 50 93 C50 93 79 80 79 62 V38 L21 72 Z" fill="#228B44" />
      <line x1="22" y1="74" x2="78" y2="34" stroke="#F4C430" strokeWidth="8" />
      {/* Faixa inferior */}
      <path
        d="M8 98 Q50 110 92 98 L88 108 Q50 118 12 108 Z"
        fill="#F6DF86"
        stroke="#222"
        strokeWidth="1.8"
      />
    </svg>
  );

  if (!editable || !onSelectFile) return content;

  return (
    <div
      onClick={() => inputRef.current?.click()}
      title="Clique para trocar o Brasão / Logo Esquerda"
      className="group relative shrink-0 cursor-pointer rounded border border-transparent p-0.5 transition hover:border-amber-500 hover:bg-amber-50/70 print:border-none print:p-0"
    >
      {content}
      <span className="no-print pointer-events-none absolute inset-x-0 bottom-0 rounded bg-black/75 px-1 py-0.5 text-center text-[8px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
        Trocar logo
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelectFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Logotipo Vetorial Fiel da Secretaria Municipal de Educação (ou logo customizada) */
export function LogoSecretariaEducacaoSvg({
  width = 88,
  customDataUrl,
  editable,
  onSelectFile,
}: {
  width?: number;
  customDataUrl?: string | null;
  editable?: boolean;
  onSelectFile?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const content = customDataUrl ? (
    <img
      src={customDataUrl}
      alt="Logo Direita / Secretaria"
      style={{ width, height: width * 0.68 }}
      className="shrink-0 object-contain"
    />
  ) : (
    <div style={{ width }} className="flex shrink-0 flex-col items-center text-center leading-none">
      <svg width={width * 0.72} height={width * 0.42} viewBox="0 0 90 50" fill="none">
        <rect x="10" y="6" width="16" height="40" rx="2" fill="#1E3A8A" />
        <rect x="30" y="18" width="24" height="28" rx="2" fill="#EA580C" />
        <rect x="58" y="10" width="20" height="36" rx="2" fill="#EAB308" />
        <circle cx="72" cy="18" r="5" fill="#7C3AED" />
        <path d="M18 42 L44 22 L66 36" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div
        style={{
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: "8.5px",
          fontWeight: 800,
          color: "#1B6CA8",
          letterSpacing: "0.02em",
          marginTop: "2px",
        }}
      >
        SECRETARIA
        <br />
        DE EDUCAÇÃO
      </div>
      <div
        style={{
          fontFamily: "'Times New Roman', Times, serif",
          fontStyle: "italic",
          fontSize: "7.5px",
          color: "#333",
          marginTop: "1px",
        }}
      >
        Escrevendo um novo futuro!
      </div>
    </div>
  );

  if (!editable || !onSelectFile) return content;

  return (
    <div
      onClick={() => inputRef.current?.click()}
      title="Clique para trocar a Logo da Secretaria / Logo Direita"
      className="group relative shrink-0 cursor-pointer rounded border border-transparent p-0.5 transition hover:border-amber-500 hover:bg-amber-50/70 print:border-none print:p-0"
    >
      {content}
      <span className="no-print pointer-events-none absolute inset-x-0 bottom-0 rounded bg-black/75 px-1 py-0.5 text-center text-[8px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
        Trocar logo
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelectFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function RelatorioPaduaOficialView({
  data,
  editable,
  onChange,
}: RelatorioPaduaOficialViewProps) {
  const [abaMobile, setAbaMobile] = useState<"todas" | "p1" | "p2" | "p3" | "p4">("todas");

  async function handleLogoUpload(side: "left" | "right", file: File) {
    try {
      const dataUrl = await normalizeLogoImageFile(file);
      const next: RelatorioOficialPaduaData =
        side === "left"
          ? { ...data, logoEsquerdaDataUrl: dataUrl }
          : { ...data, logoDireitaDataUrl: dataUrl };
      onChange(next);
      savePaduaCustomLogos({
        logoEsquerdaDataUrl: next.logoEsquerdaDataUrl ?? null,
        logoDireitaDataUrl: next.logoDireitaDataUrl ?? null,
        prefeitura: next.prefeitura,
        estado: next.estado,
        secretaria: next.secretaria,
        departamento: next.departamento,
      });
    } catch {
      // ignora erro de leitura
    }
  }

  function updatePag1Linha(idx: number, patch: Partial<LinhaPag1Semanal>) {
    const novas = data.pag1.linhas.map((l, i) =>
      i === idx ? recalcLinhaPag1({ ...l, ...patch }) : l,
    );
    onChange({
      ...data,
      pag1: { ...data.pag1, linhas: novas },
    });
  }

  function updatePag3Linha(idx: number, patch: Partial<LinhaPag3e4Mensal>) {
    const novas = data.pag3e4.linhasPag3.map((l, i) =>
      i === idx ? recalcLinhaPag3e4({ ...l, ...patch }) : l,
    );
    onChange({
      ...data,
      pag3e4: { ...data.pag3e4, linhasPag3: novas },
    });
  }

  function updatePag4Linha(idx: number, patch: Partial<LinhaPag3e4Mensal>) {
    const novas = data.pag3e4.linhasPag4.map((l, i) =>
      i === idx ? recalcLinhaPag3e4({ ...l, ...patch }) : l,
    );
    onChange({
      ...data,
      pag3e4: { ...data.pag3e4, linhasPag4: novas },
    });
  }

  const inputBaseClass = editable
    ? "bg-amber-50/70 hover:bg-amber-100/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary px-0.5"
    : "bg-transparent";

  return (
    <div className="space-y-6">
      {/* Seletor rápido de página para facilitar navegação no celular/tablet */}
      <div className="no-print flex flex-wrap items-center gap-1.5 rounded-xl border bg-card p-2 text-xs">
        <span className="px-2 font-semibold text-muted-foreground">Visualizar páginas:</span>
        {[
          { id: "todas", label: "Todas as 4 Páginas" },
          { id: "p1", label: "Página 1 (Controle Semanal)" },
          { id: "p2", label: "Página 2 (Mapa da Escola / Refeições)" },
          { id: "p3", label: "Página 3 (Mapa Mensal - Parte 1)" },
          { id: "p4", label: "Página 4 (Mapa Mensal - Parte 2)" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAbaMobile(t.id as typeof abaMobile)}
            className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
              abaMobile === t.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ====================================================================
          PÁGINA 1 — CONTROLE SEMANAL DE GÊNEROS (RETRATO A4)
         ==================================================================== */}
      {(abaMobile === "todas" || abaMobile === "p1") && (
        <div className="overflow-x-auto">
          <section
            className="mx-auto bg-white text-black shadow-lg print:shadow-none"
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: "9mm 14mm 10mm 14mm",
              fontFamily: "Arial, Helvetica, sans-serif",
              boxSizing: "border-box",
              pageBreakAfter: "always",
            }}
          >
            {/* Cabeçalho da Página 1 (alinhado sobre a largura da tabela como no PDF original) */}
            <div style={{ width: "136mm" }}>
              <div className="flex items-center justify-between gap-2">
                <BrasaoPaduaSvg
                  size={42}
                  customDataUrl={data.logoEsquerdaDataUrl}
                  editable={editable}
                  onSelectFile={(f) => void handleLogoUpload("left", f)}
                />
                <div
                  className="flex-1 text-center leading-tight"
                  style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: "13px" }}
                >
                  {editable ? (
                    <>
                      <input
                        value={data.prefeitura}
                        onChange={(e) => onChange({ ...data, prefeitura: e.target.value })}
                        className={`w-full text-center ${inputBaseClass}`}
                      />
                      <input
                        value={data.secretaria}
                        onChange={(e) => onChange({ ...data, secretaria: e.target.value })}
                        className={`w-full text-center ${inputBaseClass}`}
                      />
                      <input
                        value={data.departamento}
                        onChange={(e) => onChange({ ...data, departamento: e.target.value })}
                        className={`w-full text-center ${inputBaseClass}`}
                      />
                    </>
                  ) : (
                    <>
                      <div>{data.prefeitura}</div>
                      <div>{data.secretaria}</div>
                      <div>{data.departamento}</div>
                    </>
                  )}
                </div>
                <LogoSecretariaEducacaoSvg
                  width={78}
                  customDataUrl={data.logoDireitaDataUrl}
                  editable={editable}
                  onSelectFile={(f) => void handleLogoUpload("right", f)}
                />
              </div>

              {/* ESCOLA/CRECHE, Nº DE ALUNOS e Quadro Mês/Semana/Dias */}
              <div
                className="mt-2 text-[12px] leading-snug"
                style={{ fontFamily: "'Times New Roman', Times, serif" }}
              >
                <div className="flex items-center gap-1">
                  <span>ESCOLA/CRECHE:</span>
                  {editable ? (
                    <input
                      value={data.pag1.escolaCreche}
                      onChange={(e) =>
                        onChange({
                          ...data,
                          pag1: { ...data.pag1, escolaCreche: e.target.value },
                        })
                      }
                      className={`flex-1 border-b border-dashed border-gray-400 ${inputBaseClass}`}
                    />
                  ) : (
                    <span>{data.pag1.escolaCreche}</span>
                  )}
                </div>

                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1 pt-0.5">
                    <span>Nº DE ALUNOS:</span>
                    {editable ? (
                      <input
                        value={data.pag1.numAlunos}
                        onChange={(e) =>
                          onChange({
                            ...data,
                            pag1: { ...data.pag1, numAlunos: e.target.value },
                          })
                        }
                        className={`w-20 border-b border-dashed border-gray-400 ${inputBaseClass}`}
                      />
                    ) : (
                      <span>{data.pag1.numAlunos}</span>
                    )}
                  </div>

                  {/* Tabela Mês / Semana / Dias */}
                  <table
                    className="border-collapse border border-black text-[11px]"
                    style={{ fontFamily: "Arial, Helvetica, sans-serif", width: "51mm" }}
                  >
                    <tbody>
                      <tr>
                        <td className="border border-black px-1 py-0.5" style={{ width: "16mm" }}>
                          Mês:
                        </td>
                        <td className="border border-black px-1 py-0.5 text-center">
                          {editable ? (
                            <input
                              value={data.pag1.mes}
                              onChange={(e) =>
                                onChange({
                                  ...data,
                                  pag1: { ...data.pag1, mes: e.target.value },
                                })
                              }
                              className={`w-full text-center ${inputBaseClass}`}
                            />
                          ) : (
                            data.pag1.mes
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-1 py-0.5">Semana:</td>
                        <td className="border border-black px-1 py-0.5 text-center">
                          {editable ? (
                            <input
                              value={data.pag1.semana}
                              onChange={(e) =>
                                onChange({
                                  ...data,
                                  pag1: { ...data.pag1, semana: e.target.value },
                                })
                              }
                              className={`w-full text-center ${inputBaseClass}`}
                            />
                          ) : (
                            data.pag1.semana
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-1 py-0.5">Dias:</td>
                        <td className="border border-black px-1 py-0.5 text-center">
                          {editable ? (
                            <input
                              value={data.pag1.dias}
                              onChange={(e) =>
                                onChange({
                                  ...data,
                                  pag1: { ...data.pag1, dias: e.target.value },
                                })
                              }
                              className={`w-full text-center ${inputBaseClass}`}
                            />
                          ) : (
                            data.pag1.dias
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tabela Principal de 43 Gêneros da Página 1 */}
              <table className="mt-2 w-full border-collapse border border-black text-[10px]">
                <thead>
                  <tr className="bg-[#e6e6e6] font-bold">
                    <th
                      className="border border-black px-1.5 py-0.5 text-center text-[10.5px]"
                      style={{ width: "61mm" }}
                    >
                      GÊNEROS
                    </th>
                    <th className="border border-black px-1 py-0.5 text-center text-[8.5px] leading-tight">
                      Estoque
                      <br />
                      Anterior
                    </th>
                    <th className="border border-black px-1 py-0.5 text-center text-[8.5px] leading-tight">
                      Entrada
                    </th>
                    <th className="border border-black px-1 py-0.5 text-center text-[8.5px] leading-tight">
                      Estoque
                      <br />
                      Atual
                    </th>
                    <th className="border border-black px-1 py-0.5 text-center text-[8.5px] leading-tight">
                      Saída
                    </th>
                    <th className="border border-black px-1 py-0.5 text-center text-[8.5px] leading-tight">
                      Estoque
                      <br />
                      Final
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.pag1.linhas.map((l, idx) => (
                    <tr key={l.genero} style={{ height: "4.1mm" }}>
                      <td className="border border-black px-1 py-0 text-left leading-tight">
                        {editable ? (
                          <input
                            value={l.genero}
                            onChange={(e) => updatePag1Linha(idx, { genero: e.target.value })}
                            className={`w-full ${inputBaseClass}`}
                          />
                        ) : (
                          l.genero
                        )}
                      </td>
                      <td className="border border-black px-0.5 py-0 text-center tabular-nums">
                        {editable ? (
                          <input
                            type="number"
                            step="any"
                            value={l.estoqueAnterior}
                            onChange={(e) =>
                              updatePag1Linha(idx, { estoqueAnterior: Number(e.target.value) })
                            }
                            className={`w-full text-center ${inputBaseClass}`}
                          />
                        ) : (
                          fmtNum(l.estoqueAnterior)
                        )}
                      </td>
                      <td className="border border-black px-0.5 py-0 text-center tabular-nums">
                        {editable ? (
                          <input
                            type="number"
                            step="any"
                            value={l.entrada}
                            onChange={(e) =>
                              updatePag1Linha(idx, { entrada: Number(e.target.value) })
                            }
                            className={`w-full text-center ${inputBaseClass}`}
                          />
                        ) : (
                          fmtNum(l.entrada)
                        )}
                      </td>
                      <td className="border border-black bg-gray-50/60 px-0.5 py-0 text-center tabular-nums">
                        {fmtNum(l.estoqueAtual)}
                      </td>
                      <td className="border border-black px-0.5 py-0 text-center tabular-nums">
                        {editable ? (
                          <input
                            type="number"
                            step="any"
                            value={l.saida}
                            onChange={(e) =>
                              updatePag1Linha(idx, { saida: Number(e.target.value) })
                            }
                            className={`w-full text-center ${inputBaseClass}`}
                          />
                        ) : (
                          fmtNum(l.saida)
                        )}
                      </td>
                      <td className="border border-black bg-gray-50/60 px-0.5 py-0 text-center tabular-nums">
                        {fmtNum(l.estoqueFinal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Caixa de Observações (Página 1) */}
              <div className="mt-2 border border-black text-[10px]">
                <div className="flex items-center border-b border-black px-2 py-1">
                  <span className="ml-16 mr-2 font-bold">Observações:</span>
                  {editable ? (
                    <input
                      value={data.pag1.observacoesLinha1}
                      onChange={(e) =>
                        onChange({
                          ...data,
                          pag1: { ...data.pag1, observacoesLinha1: e.target.value },
                        })
                      }
                      className={`flex-1 ${inputBaseClass}`}
                    />
                  ) : (
                    <span>{data.pag1.observacoesLinha1}</span>
                  )}
                </div>
                <div className="h-6 px-2 py-0.5">
                  {editable ? (
                    <input
                      value={data.pag1.observacoesLinha2}
                      onChange={(e) =>
                        onChange({
                          ...data,
                          pag1: { ...data.pag1, observacoesLinha2: e.target.value },
                        })
                      }
                      className={`w-full ${inputBaseClass}`}
                    />
                  ) : (
                    <span>{data.pag1.observacoesLinha2}</span>
                  )}
                </div>
              </div>

              {/* Assinaturas 2x2 da Página 1 */}
              <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 text-center text-[8.5px]">
                <div>
                  <div className="border-t border-black pt-0.5">Diretor</div>
                </div>
                <div>
                  <div className="border-t border-black pt-0.5">Manipulador de Alimentos</div>
                </div>
                <div>
                  <div className="border-t border-black pt-0.5">Supervisora</div>
                </div>
                <div>
                  <div className="border-t border-black pt-0.5">Nutricionista</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          PÁGINA 2 — MAPA DE CONTROLE DA MERENDA ESCOLAR / ESCOLAS (RETRATO A4)
         ==================================================================== */}
      {(abaMobile === "todas" || abaMobile === "p2") && (
        <div className="overflow-x-auto">
          <section
            className="mx-auto bg-white text-black shadow-lg print:shadow-none"
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: "14mm 20mm 16mm 20mm",
              fontFamily: "'Times New Roman', Times, serif",
              boxSizing: "border-box",
              pageBreakAfter: "always",
            }}
          >
            {/* Cabeçalho Institucional da Página 2 */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-1 items-start gap-4">
                <BrasaoPaduaSvg
                  size={58}
                  customDataUrl={data.logoEsquerdaDataUrl}
                  editable={editable}
                  onSelectFile={(f) => void handleLogoUpload("left", f)}
                />
                <div className="flex-1 leading-snug">
                  {editable ? (
                    <>
                      <input
                        value={data.prefeitura}
                        onChange={(e) => onChange({ ...data, prefeitura: e.target.value })}
                        className={`w-full text-[18px] ${inputBaseClass}`}
                      />
                      <input
                        value={data.estado}
                        onChange={(e) => onChange({ ...data, estado: e.target.value })}
                        className={`w-full text-[15.5px] ${inputBaseClass}`}
                      />
                      <input
                        value={data.secretaria}
                        onChange={(e) => onChange({ ...data, secretaria: e.target.value })}
                        className={`w-full text-[15.5px] ${inputBaseClass}`}
                      />
                      <input
                        value={data.departamento}
                        onChange={(e) => onChange({ ...data, departamento: e.target.value })}
                        className={`w-full text-[15.5px] ${inputBaseClass}`}
                      />
                    </>
                  ) : (
                    <>
                      <div className="text-[18px]">{data.prefeitura}</div>
                      <div className="text-[15.5px]">{data.estado}</div>
                      <div className="text-[15.5px]">{data.secretaria}</div>
                      <div className="text-[15.5px]">{data.departamento}</div>
                    </>
                  )}
                </div>
              </div>
              <LogoSecretariaEducacaoSvg
                width={92}
                customDataUrl={data.logoDireitaDataUrl}
                editable={editable}
                onSelectFile={(f) => void handleLogoUpload("right", f)}
              />
            </div>

            {/* Título Centralizado */}
            <div className="mt-8 text-center font-bold leading-tight text-[17.5px]">
              <div>MAPA DE CONTROLE DA MERENDA ESCOLAR</div>
              <div>ESCOLAS</div>
            </div>

            {/* Bloco de Identificação da Escola */}
            <div className="mt-7 space-y-1 text-[14px] leading-snug">
              <div className="flex items-center gap-1">
                <span>Município:</span>
                {editable ? (
                  <input
                    value={data.pag2.municipio}
                    onChange={(e) =>
                      onChange({ ...data, pag2: { ...data.pag2, municipio: e.target.value } })
                    }
                    className={`flex-1 ${inputBaseClass}`}
                  />
                ) : (
                  <span>{data.pag2.municipio}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span>Escola:</span>
                {editable ? (
                  <input
                    value={data.pag2.escola}
                    onChange={(e) =>
                      onChange({ ...data, pag2: { ...data.pag2, escola: e.target.value } })
                    }
                    className={`flex-1 ${inputBaseClass}`}
                  />
                ) : (
                  <span>{data.pag2.escola}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span>Endereço:</span>
                {editable ? (
                  <input
                    value={data.pag2.endereco}
                    onChange={(e) =>
                      onChange({ ...data, pag2: { ...data.pag2, endereco: e.target.value } })
                    }
                    className={`flex-1 ${inputBaseClass}`}
                  />
                ) : (
                  <span>{data.pag2.endereco}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span>E-mail:</span>
                {editable ? (
                  <input
                    value={data.pag2.email}
                    onChange={(e) =>
                      onChange({ ...data, pag2: { ...data.pag2, email: e.target.value } })
                    }
                    className={`flex-1 ${inputBaseClass}`}
                  />
                ) : (
                  <span>{data.pag2.email}</span>
                )}
              </div>
            </div>

            {/* Mês / Ano / Nº de dias letivos */}
            <div className="mt-5 flex items-center justify-between pr-8 text-[14px]">
              <div className="flex items-center gap-1">
                <span>Mês:</span>
                {editable ? (
                  <input
                    value={data.pag2.mes}
                    onChange={(e) =>
                      onChange({ ...data, pag2: { ...data.pag2, mes: e.target.value } })
                    }
                    className={`w-28 ${inputBaseClass}`}
                  />
                ) : (
                  <span>{data.pag2.mes}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span>Ano:</span>
                {editable ? (
                  <input
                    value={data.pag2.ano}
                    onChange={(e) =>
                      onChange({ ...data, pag2: { ...data.pag2, ano: e.target.value } })
                    }
                    className={`w-20 ${inputBaseClass}`}
                  />
                ) : (
                  <span>{data.pag2.ano}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span>Nº de dias letivos:</span>
                {editable ? (
                  <input
                    value={data.pag2.diasLetivos}
                    onChange={(e) =>
                      onChange({ ...data, pag2: { ...data.pag2, diasLetivos: e.target.value } })
                    }
                    className={`w-14 ${inputBaseClass}`}
                  />
                ) : (
                  <span>{data.pag2.diasLetivos}</span>
                )}
              </div>
            </div>

            {/* Caixas de Horário e Turno */}
            <div className="mt-6 grid grid-cols-2 gap-x-12 gap-y-3 px-2 text-[14px]">
              <div className="flex items-center justify-between pr-12">
                <span>Horário integral</span>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() =>
                    onChange({
                      ...data,
                      pag2: { ...data.pag2, horarioIntegral: !data.pag2.horarioIntegral },
                    })
                  }
                  className="flex h-8 w-9 items-center justify-center border border-black text-[14px]"
                >
                  {data.pag2.horarioIntegral ? "X" : ""}
                </button>
              </div>
              <div className="flex items-center justify-between pr-12">
                <span>Turno manhã</span>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() =>
                    onChange({
                      ...data,
                      pag2: { ...data.pag2, turnoManha: !data.pag2.turnoManha },
                    })
                  }
                  className="flex h-8 w-9 items-center justify-center border border-black text-[14px]"
                >
                  {data.pag2.turnoManha ? "X" : ""}
                </button>
              </div>
              <div className="flex items-center justify-between pr-12">
                <span>Horário parcial</span>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() =>
                    onChange({
                      ...data,
                      pag2: { ...data.pag2, horarioParcial: !data.pag2.horarioParcial },
                    })
                  }
                  className="flex h-8 w-9 items-center justify-center border border-black text-[14px]"
                >
                  {data.pag2.horarioParcial ? "X" : ""}
                </button>
              </div>
              <div className="flex items-center justify-between pr-12">
                <span>Turno tarde</span>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() =>
                    onChange({
                      ...data,
                      pag2: { ...data.pag2, turnoTarde: !data.pag2.turnoTarde },
                    })
                  }
                  className="flex h-8 w-9 items-center justify-center border border-black text-[14px]"
                >
                  {data.pag2.turnoTarde ? "X" : ""}
                </button>
              </div>
            </div>

            {/* Tabela de Modalidade de Ensino / Aluno / Total de Refeições Servidas */}
            <table className="mt-10 w-full border-collapse border border-black text-[13.5px]">
              <thead>
                <tr className="font-bold">
                  <th rowSpan={2} className="border border-black px-2 py-1.5 text-center">
                    Modalidade de Ensino
                  </th>
                  <th colSpan={2} className="border border-black px-2 py-1 text-center">
                    Aluno
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-1.5 text-center">
                    Total de refeições
                    <br />
                    Servidas
                  </th>
                </tr>
                <tr className="font-bold">
                  <th className="border border-black px-2 py-1 text-center">Matrícula</th>
                  <th className="border border-black px-2 py-1 text-center">Atendimento</th>
                </tr>
              </thead>
              <tbody>
                {data.pag2.modalidades.map((m, idx) => (
                  <tr key={m.modalidade}>
                    <td className="border border-black px-2 py-1">{m.modalidade}</td>
                    <td className="border border-black px-2 py-1 text-center">
                      {editable ? (
                        <input
                          value={m.matricula}
                          onChange={(e) => {
                            const novas = data.pag2.modalidades.map((x, i) =>
                              i === idx ? { ...x, matricula: e.target.value } : x,
                            );
                            onChange({
                              ...data,
                              pag2: { ...data.pag2, modalidades: novas },
                            });
                          }}
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        m.matricula
                      )}
                    </td>
                    <td className="border border-black px-2 py-1 text-center">
                      {editable ? (
                        <input
                          value={m.atendimento}
                          onChange={(e) => {
                            const novas = data.pag2.modalidades.map((x, i) =>
                              i === idx ? { ...x, atendimento: e.target.value } : x,
                            );
                            onChange({
                              ...data,
                              pag2: { ...data.pag2, modalidades: novas },
                            });
                          }}
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        m.atendimento
                      )}
                    </td>
                    <td className="border border-black px-2 py-1 text-center">
                      {editable ? (
                        <input
                          value={m.totalRefeicoes}
                          onChange={(e) => {
                            const novas = data.pag2.modalidades.map((x, i) =>
                              i === idx ? { ...x, totalRefeicoes: e.target.value } : x,
                            );
                            onChange({
                              ...data,
                              pag2: { ...data.pag2, modalidades: novas },
                            });
                          }}
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        m.totalRefeicoes
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="border border-black px-2 py-1 text-[15px] font-bold">Total</td>
                  <td className="border border-black px-2 py-1 text-center">
                    {editable ? (
                      <input
                        value={data.pag2.totalMatricula}
                        onChange={(e) =>
                          onChange({
                            ...data,
                            pag2: { ...data.pag2, totalMatricula: e.target.value },
                          })
                        }
                        className={`w-full text-center ${inputBaseClass}`}
                      />
                    ) : (
                      data.pag2.totalMatricula
                    )}
                  </td>
                  <td className="border border-black px-2 py-1 text-center">
                    {editable ? (
                      <input
                        value={data.pag2.totalAtendimento}
                        onChange={(e) =>
                          onChange({
                            ...data,
                            pag2: { ...data.pag2, totalAtendimento: e.target.value },
                          })
                        }
                        className={`w-full text-center ${inputBaseClass}`}
                      />
                    ) : (
                      data.pag2.totalAtendimento
                    )}
                  </td>
                  <td className="border border-black px-2 py-1 text-center">
                    {editable ? (
                      <input
                        value={data.pag2.totalRefeicoesServidas}
                        onChange={(e) =>
                          onChange({
                            ...data,
                            pag2: { ...data.pag2, totalRefeicoesServidas: e.target.value },
                          })
                        }
                        className={`w-full text-center ${inputBaseClass}`}
                      />
                    ) : (
                      data.pag2.totalRefeicoesServidas
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Nº de merendeiras */}
            <div className="mt-7 pl-4 text-[14px]">
              <span>Nº de merendeiras na Unidade Escolar: </span>
              {editable ? (
                <input
                  value={data.pag2.numMerendeiras}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      pag2: { ...data.pag2, numMerendeiras: e.target.value },
                    })
                  }
                  className={`w-14 font-bold ${inputBaseClass}`}
                />
              ) : (
                <b className="font-bold">{data.pag2.numMerendeiras}</b>
              )}
            </div>

            {/* Cidade e Data */}
            <div className="mt-8 text-center text-[14px]">
              {data.pag2.cidadeData},{" "}
              {editable ? (
                <input
                  value={data.pag2.diaData}
                  onChange={(e) =>
                    onChange({ ...data, pag2: { ...data.pag2, diaData: e.target.value } })
                  }
                  className={`w-8 text-center ${inputBaseClass}`}
                />
              ) : (
                data.pag2.diaData
              )}{" "}
              de{" "}
              {editable ? (
                <input
                  value={data.pag2.mesData}
                  onChange={(e) =>
                    onChange({ ...data, pag2: { ...data.pag2, mesData: e.target.value } })
                  }
                  className={`w-24 text-center ${inputBaseClass}`}
                />
              ) : (
                data.pag2.mesData
              )}{" "}
              de{" "}
              {editable ? (
                <input
                  value={data.pag2.anoData}
                  onChange={(e) =>
                    onChange({ ...data, pag2: { ...data.pag2, anoData: e.target.value } })
                  }
                  className={`w-14 text-center ${inputBaseClass}`}
                />
              ) : (
                data.pag2.anoData
              )}
              .
            </div>

            {/* Assinaturas Centralizadas da Página 2 */}
            <div className="mt-16 flex flex-col items-center space-y-12 text-center text-[14px]">
              <div className="w-72 border-t border-black pt-1">Diretor da Escola</div>
              <div className="w-96 border-t border-black pt-1">
                Departamento de Alimentação Escolar
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          PÁGINA 3 — MAPA MENSAL DETALHADO (PAISAGEM A4 — PARTE 1)
         ==================================================================== */}
      {(abaMobile === "todas" || abaMobile === "p3") && (
        <div className="overflow-x-auto">
          <section
            className="mx-auto bg-white text-black shadow-lg print:shadow-none"
            style={{
              width: "297mm",
              minHeight: "210mm",
              padding: "10mm 14mm",
              fontFamily: "Arial, Helvetica, sans-serif",
              boxSizing: "border-box",
              pageBreakAfter: "always",
            }}
          >
            {/* Cabeçalho da Página 3 */}
            <div className="flex items-center justify-between gap-4">
              <BrasaoPaduaSvg
                size={44}
                customDataUrl={data.logoEsquerdaDataUrl}
                editable={editable}
                onSelectFile={(f) => void handleLogoUpload("left", f)}
              />
              <div
                className="flex-1 text-center leading-tight"
                style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: "14px" }}
              >
                {editable ? (
                  <>
                    <input
                      value={data.prefeitura}
                      onChange={(e) => onChange({ ...data, prefeitura: e.target.value })}
                      className={`w-full text-center ${inputBaseClass}`}
                    />
                    <input
                      value={data.secretaria}
                      onChange={(e) => onChange({ ...data, secretaria: e.target.value })}
                      className={`w-full text-center ${inputBaseClass}`}
                    />
                    <input
                      value={data.departamento}
                      onChange={(e) => onChange({ ...data, departamento: e.target.value })}
                      className={`w-full text-center ${inputBaseClass}`}
                    />
                  </>
                ) : (
                  <>
                    <div>{data.prefeitura}</div>
                    <div>{data.secretaria}</div>
                    <div>{data.departamento}</div>
                  </>
                )}
              </div>
              <LogoSecretariaEducacaoSvg
                width={80}
                customDataUrl={data.logoDireitaDataUrl}
                editable={editable}
                onSelectFile={(f) => void handleLogoUpload("right", f)}
              />
            </div>

            {/* Linha ESCOLA e Mês / Dias letivos */}
            <div className="mt-2 flex items-end justify-between text-[13px]">
              <div
                className="flex flex-1 items-center gap-1 pr-6"
                style={{ fontFamily: "'Times New Roman', Times, serif" }}
              >
                <span>ESCOLA :</span>
                {editable ? (
                  <input
                    value={data.pag3e4.escola}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        pag3e4: { ...data.pag3e4, escola: e.target.value },
                      })
                    }
                    className={`flex-1 ${inputBaseClass}`}
                  />
                ) : (
                  <span>{data.pag3e4.escola}</span>
                )}
              </div>
              <div className="w-48 text-left text-[13px] leading-tight">
                <div>
                  Mês :{" "}
                  {editable ? (
                    <input
                      value={data.pag3e4.mes}
                      onChange={(e) =>
                        onChange({
                          ...data,
                          pag3e4: { ...data.pag3e4, mes: e.target.value },
                        })
                      }
                      className={`w-28 ${inputBaseClass}`}
                    />
                  ) : (
                    data.pag3e4.mes
                  )}
                </div>
                <div>
                  Dias letivos:{" "}
                  {editable ? (
                    <input
                      value={data.pag3e4.diasLetivos}
                      onChange={(e) =>
                        onChange({
                          ...data,
                          pag3e4: { ...data.pag3e4, diasLetivos: e.target.value },
                        })
                      }
                      className={`w-14 ${inputBaseClass}`}
                    />
                  ) : (
                    data.pag3e4.diasLetivos
                  )}
                </div>
              </div>
            </div>

            {/* Tabela de 11 Colunas da Página 3 (19 gêneros) */}
            <table className="mt-2 w-full border-collapse border border-black text-[11px]">
              <thead>
                <tr className="font-bold">
                  <th
                    rowSpan={2}
                    className="border border-black px-2 py-1 text-left align-bottom text-[13px]"
                    style={{ width: "68mm" }}
                  >
                    GÊNERO
                  </th>
                  <th
                    colSpan={2}
                    className="border border-black px-1 py-0.5 text-center text-[10px]"
                  >
                    Estoque do mês anterior
                  </th>
                  <th
                    colSpan={2}
                    className="border border-black px-1 py-0.5 text-center text-[10.5px]"
                  >
                    Entrada
                  </th>
                  <th
                    colSpan={2}
                    className="border border-black px-1 py-0.5 text-center text-[10.5px]"
                  >
                    Estoque
                  </th>
                  <th
                    colSpan={2}
                    className="border border-black px-1 py-0.5 text-center text-[10.5px]"
                  >
                    Saída
                  </th>
                  <th
                    colSpan={2}
                    className="border border-black px-1 py-0.5 text-center text-[10.5px]"
                  >
                    Estoque
                  </th>
                </tr>
                <tr className="font-bold text-[8px]">
                  <th className="border border-black px-1 py-0.5 text-center">MERCADO</th>
                  <th className="border border-black px-1 py-0.5 text-center">AGRICULT. FAM.</th>
                  <th className="border border-black px-1 py-0.5 text-center">MERCADO</th>
                  <th className="border border-black px-1 py-0.5 text-center">AGRICULT. FAM.</th>
                  <th className="border border-black px-1 py-0.5 text-center">MERCADO</th>
                  <th className="border border-black px-1 py-0.5 text-center">AGRICULT. FAM.</th>
                  <th className="border border-black px-1 py-0.5 text-center">MERCADO</th>
                  <th className="border border-black px-1 py-0.5 text-center">AGRICULT. FAM.</th>
                  <th className="border border-black px-1 py-0.5 text-center">MERCADO</th>
                  <th className="border border-black px-1 py-0.5 text-center">AGRICULT. FAM.</th>
                </tr>
              </thead>
              <tbody>
                {data.pag3e4.linhasPag3.map((l, idx) => (
                  <tr key={l.genero} style={{ height: "6.8mm" }}>
                    <td className="border border-black px-1.5 py-0.5 font-bold">{l.genero}</td>
                    <td className="border border-black px-1 py-0.5 text-center tabular-nums">
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.antMercado}
                          onChange={(e) =>
                            updatePag3Linha(idx, { antMercado: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.antMercado)
                      )}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center tabular-nums">
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.antAgric}
                          onChange={(e) =>
                            updatePag3Linha(idx, { antAgric: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.antAgric)
                      )}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center tabular-nums">
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.entMercado}
                          onChange={(e) =>
                            updatePag3Linha(idx, { entMercado: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.entMercado)
                      )}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center tabular-nums">
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.entAgric}
                          onChange={(e) =>
                            updatePag3Linha(idx, { entAgric: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.entAgric)
                      )}
                    </td>
                    <td className="border border-black bg-gray-50/60 px-1 py-0.5 text-center tabular-nums">
                      {fmtNum(l.estMercado)}
                    </td>
                    <td className="border border-black bg-gray-50/60 px-1 py-0.5 text-center tabular-nums">
                      {fmtNum(l.estAgric)}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center tabular-nums">
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.saiMercado}
                          onChange={(e) =>
                            updatePag3Linha(idx, { saiMercado: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.saiMercado)
                      )}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center tabular-nums">
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.saiAgric}
                          onChange={(e) =>
                            updatePag3Linha(idx, { saiAgric: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.saiAgric)
                      )}
                    </td>
                    <td className="border border-black bg-gray-50/60 px-1 py-0.5 text-center tabular-nums">
                      {fmtNum(l.fimMercado)}
                    </td>
                    <td className="border border-black bg-gray-50/60 px-1 py-0.5 text-center tabular-nums">
                      {fmtNum(l.fimAgric)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* ====================================================================
          PÁGINA 4 — MAPA MENSAL DETALHADO (PAISAGEM A4 — PARTE 2 + ASSINATURAS)
         ==================================================================== */}
      {(abaMobile === "todas" || abaMobile === "p4") && (
        <div className="overflow-x-auto">
          <section
            className="mx-auto bg-white text-black shadow-lg print:shadow-none"
            style={{
              width: "297mm",
              minHeight: "210mm",
              padding: "12mm 14mm",
              fontFamily: "Arial, Helvetica, sans-serif",
              boxSizing: "border-box",
            }}
          >
            {/* Tabela de 11 Colunas da Página 4 (20 gêneros) */}
            <table className="w-full border-collapse border border-black text-[11px]">
              <tbody>
                {data.pag3e4.linhasPag4.map((l, idx) => (
                  <tr key={l.genero} style={{ height: "6.8mm" }}>
                    <td
                      className="border border-black px-1.5 py-0.5 font-bold"
                      style={{ width: "68mm" }}
                    >
                      {l.genero}
                    </td>
                    <td
                      className="border border-black px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.antMercado}
                          onChange={(e) =>
                            updatePag4Linha(idx, { antMercado: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.antMercado)
                      )}
                    </td>
                    <td
                      className="border border-black px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.antAgric}
                          onChange={(e) =>
                            updatePag4Linha(idx, { antAgric: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.antAgric)
                      )}
                    </td>
                    <td
                      className="border border-black px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.entMercado}
                          onChange={(e) =>
                            updatePag4Linha(idx, { entMercado: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.entMercado)
                      )}
                    </td>
                    <td
                      className="border border-black px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.entAgric}
                          onChange={(e) =>
                            updatePag4Linha(idx, { entAgric: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.entAgric)
                      )}
                    </td>
                    <td
                      className="border border-black bg-gray-50/60 px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {fmtNum(l.estMercado)}
                    </td>
                    <td
                      className="border border-black bg-gray-50/60 px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {fmtNum(l.estAgric)}
                    </td>
                    <td
                      className="border border-black px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.saiMercado}
                          onChange={(e) =>
                            updatePag4Linha(idx, { saiMercado: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.saiMercado)
                      )}
                    </td>
                    <td
                      className="border border-black px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {editable ? (
                        <input
                          type="number"
                          step="any"
                          value={l.saiAgric}
                          onChange={(e) =>
                            updatePag4Linha(idx, { saiAgric: Number(e.target.value) })
                          }
                          className={`w-full text-center ${inputBaseClass}`}
                        />
                      ) : (
                        fmtNum(l.saiAgric)
                      )}
                    </td>
                    <td
                      className="border border-black bg-gray-50/60 px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {fmtNum(l.fimMercado)}
                    </td>
                    <td
                      className="border border-black bg-gray-50/60 px-1 py-0.5 text-center tabular-nums"
                      style={{ width: "20mm" }}
                    >
                      {fmtNum(l.fimAgric)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 3 Linhas de Observações da Página 4 */}
            <div className="mt-4 space-y-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="font-bold">Observações:</span>
                <input
                  readOnly={!editable}
                  value={data.pag3e4.observacoes1}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      pag3e4: { ...data.pag3e4, observacoes1: e.target.value },
                    })
                  }
                  className={`flex-1 border-b border-black ${inputBaseClass}`}
                />
              </div>
              <div>
                <input
                  readOnly={!editable}
                  value={data.pag3e4.observacoes2}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      pag3e4: { ...data.pag3e4, observacoes2: e.target.value },
                    })
                  }
                  className={`w-full border-b border-black ${inputBaseClass}`}
                />
              </div>
              <div>
                <input
                  readOnly={!editable}
                  value={data.pag3e4.observacoes3}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      pag3e4: { ...data.pag3e4, observacoes3: e.target.value },
                    })
                  }
                  className={`w-full border-b border-black ${inputBaseClass}`}
                />
              </div>
            </div>

            {/* Rodapé de Assinaturas da Página 4: Diretor e Supervisor de Alimentação Escolar */}
            <div className="mt-10 flex items-center justify-between px-4 text-center text-[11px] font-bold">
              <div className="w-96 border-t border-black pt-1">Diretor</div>
              <div className="w-96 border-t border-black pt-1">
                Supervisor de Alimentação Escolar
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
