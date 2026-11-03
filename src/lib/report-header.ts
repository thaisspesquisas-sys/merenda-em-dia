import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReportHeader { image_data: string; source_name: string }
export function useReportHeader() {
  return useQuery({ queryKey: ["report-header"], queryFn: async () => {
    const { data, error } = await supabase.from("report_header_template").select("image_data,source_name").eq("id", true).maybeSingle();
    if (error) throw error;
    return data;
  } });
}
export function cropBounds(width: number, height: number, top: number, size: number) {
  const y = Math.round(height * Math.max(0, Math.min(99, top)) / 100);
  return { x: 0, y, width, height: Math.max(1, Math.min(height - y, Math.round(height * size / 100))) };
}
export function validateHeaderFile(file: { name: string; size: number }) {
  if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter até 10 MB.");
  if (!/\.(docx|xlsx|xls|pdf|png|jpe?g|webp)$/i.test(file.name)) throw new Error("Use Word (.docx), Excel (.xlsx ou .xls), PDF, PNG ou JPG. Para Word antigo (.doc), salve como .docx ou PDF.");
}
export async function loadHeaderImage(data: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = data;
  await img.decode();
  return img;
}
export async function cropHeader(data: string, top: number, size: number) {
  const img = await loadHeaderImage(data);
  const box = cropBounds(img.naturalWidth, img.naturalHeight, top, size);
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(1600, box.width);
  canvas.height = Math.round(box.height * canvas.width / box.width);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a imagem.");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL("image/png");
  if (result.length > 2800000) throw new Error("O cabeçalho ficou muito grande. Selecione uma área menor.");
  return result;
}