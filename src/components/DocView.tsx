import { FileDown, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportExcel, exportPDF, type Cell, type DocInfo } from "@/lib/export";
import { useReportHeader } from "@/lib/report-header";
import { useApp } from "@/lib/app-context";
import { ReportHeaderEditor } from "@/components/ReportHeaderEditor";
import { toast } from "sonner";

export function DocView({ info, columns, rows, filename, observacoes, dataFechamento }: {
  info: DocInfo; columns: string[]; rows: Cell[][]; filename: string; observacoes?: string; dataFechamento?: string;
}) {
  const header = useReportHeader();
  const { isAdmin } = useApp();
  const ready = !header.isPending && !header.isError;
  const reportInfo = { ...info, headerImage: header.data?.image_data };
  const onExportError = () => toast.error("Não foi possível exportar o relatório. Tente novamente.");
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <Button variant="outline" disabled={!ready} onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir (A4)</Button>
        <Button variant="outline" disabled={!ready} onClick={() => void exportPDF(reportInfo, columns, rows, filename, observacoes, dataFechamento).catch(onExportError)}><FileDown className="h-4 w-4" /> Exportar PDF</Button>
        <Button variant="outline" disabled={!ready} onClick={() => void exportExcel(reportInfo, columns, rows, filename).catch(onExportError)}><FileSpreadsheet className="h-4 w-4" /> Exportar Excel</Button>
        {isAdmin && <ReportHeaderEditor />}
      </div>
      {header.isError && <div className="no-print mb-3 text-sm text-destructive">Não foi possível carregar o cabeçalho. <Button variant="link" onClick={() => void header.refetch()}>Tentar novamente</Button></div>}
      <div className="print-only-root doc-sheet overflow-x-auto rounded-xl border p-6 shadow-card">
        <div className="text-center">
          {header.data ? <img src={header.data.image_data} alt="Cabeçalho oficial da Secretaria" className="mx-auto mb-3 max-h-36 w-full object-contain" /> : <>
            <div className="text-sm font-bold">PREFEITURA MUNICIPAL</div>
            <div className="text-sm font-bold">SECRETARIA MUNICIPAL DE EDUCAÇÃO</div>
          </>}
          <div className="mt-1 text-base font-bold">{info.titulo.toUpperCase()}</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-y py-2 text-xs md:grid-cols-4">
          <div><b>Unidade escolar:</b> {info.escola}</div>
          <div><b>Mês de referência:</b> {info.mes}</div>
          <div><b>Ano:</b> {info.ano}</div>
          <div><b>Responsável pelo estoque:</b> {info.responsavel || "____________"}</div>
        </div>
        <table className="doc-table mt-3">
          <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={columns.length} style={{ textAlign: "center" }}>Sem registros no período.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} className={j > 0 && typeof c === "number" ? "num" : ""}>{typeof c === "number" ? c.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : c}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 grid gap-2 text-xs">
          <div><b>Data do fechamento:</b> {dataFechamento || "____/____/________"}</div>
          <div><b>Observações:</b> {observacoes || "________________________________________________________________"}</div>
        </div>
        <div className="mt-14 grid grid-cols-2 gap-16 text-center text-xs">
          <div className="border-t border-foreground pt-1">Responsável pelo estoque</div>
          <div className="border-t border-foreground pt-1">Direção escolar</div>
        </div>
      </div>
    </div>
  );
}
