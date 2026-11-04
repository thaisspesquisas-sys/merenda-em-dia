export const DOCUMENT_CATEGORIES = ["Planilha mensal", "Planilha semanal", "Cardápio mensal", "Cardápio semanal", "Planejamento alimentar", "Refeições servidas", "Controle de estoque", "Ficha técnica", "Recebimento de gêneros", "Outros"];
export interface DocumentContent {
  title: string;
  header: string;
  headerImage: string;
  columns: string[];
  rows: string[][];
  notes: string;
  orientation: "portrait" | "landscape";
  margin: number;
  allowColumns: boolean;
  merges: { r: number; c: number; rowspan: number; colspan: number }[];
}
export function emptyContent(title = ""): DocumentContent {
  return { title, header: "PREFEITURA MUNICIPAL\nSECRETARIA MUNICIPAL DE EDUCAÇÃO", headerImage: "", columns: ["Data", "Dia", "Refeição", "Preparação", "Ingredientes", "Quantitativo", "Observações"], rows: [], notes: "", orientation: "landscape", margin: 10, allowColumns: true, merges: [] };
}
export function planningRows(start: string, end: string, columns: string[]): string[][] {
  const a = new Date(`${start}T12:00:00`), b = new Date(`${end}T12:00:00`);
  const rows: string[][] = [];
  for (let d = a; d <= b && rows.length < 366; d.setDate(d.getDate() + 1)) {
    const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    rows.push(columns.map(c => /data/i.test(c) ? date : /dia/i.test(c) ? d.toLocaleDateString("pt-BR", { weekday: "long" }) : ""));
  }
  return rows;
}
export function needsConflict(base: number, remote: number) { return base !== remote; }
export function contentOf(value: unknown): DocumentContent {
  const data = value as Partial<DocumentContent> | null;
  return { ...emptyContent(), ...data, columns: Array.isArray(data?.columns) ? data.columns : [], rows: Array.isArray(data?.rows) ? data.rows : [], merges: Array.isArray(data?.merges) ? data.merges : [] };
}