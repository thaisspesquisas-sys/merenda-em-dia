import { supabase } from "@/integrations/supabase/client";
import {
  getAllProductMeta,
  setProductMeta,
  type Movimento,
  type Produto,
  type UnidadeApresentacao,
} from "./estoque";

export interface CodigoBarrasVinculado {
  codigo: string;
  principal: boolean;
  marca_apresentacao?: string;
  unidade_embalagem?: UnidadeApresentacao;
  /** Fator de conversão opcional (padrão = 1). Só converte se previamente configurado. */
  fator_conversao?: number;
  created_at?: string;
  created_by?: string;
}

export const BARCODE_EXIT_ORIGIN_LABEL = "Saída por código de barras";
export const BARCODE_EXIT_TAG = "[ORIGEM_MOV:SAIDA_CODIGO_BARRAS]";

const BARCODE_REGISTRY_STORAGE_KEY = "merenda_product_barcodes_v1";

/** Normaliza um código de barras mantendo apenas dígitos ou caracteres alfanuméricos válidos (EAN-13, EAN-8, UPC-A, UPC-E, CODE-128) */
export function normalizeBarcode(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

/** Valida se o código de barras possui formato compatível (EAN-13, EAN-8, UPC-A, UPC-E, GTIN-14, CODE-128/39) */
export function isValidBarcodeFormat(code: string): {
  valid: boolean;
  format: string;
  reason?: string;
} {
  const clean = normalizeBarcode(code);
  if (!clean) {
    return { valid: false, format: "DESCONHECIDO", reason: "Código vazio." };
  }
  if (/^\d{13}$/.test(clean)) {
    return { valid: true, format: "EAN-13" };
  }
  if (/^\d{8}$/.test(clean)) {
    return { valid: true, format: "EAN-8" };
  }
  if (/^\d{12}$/.test(clean)) {
    return { valid: true, format: "UPC-A" };
  }
  if (/^\d{6,7}$/.test(clean)) {
    return { valid: true, format: "UPC-E" };
  }
  if (/^\d{14}$/.test(clean)) {
    return { valid: true, format: "DUN-14 / GTIN-14" };
  }
  if (/^[A-Za-z0-9\-._]{4,32}$/.test(clean)) {
    return { valid: true, format: "CODE-128 / CODE-39" };
  }
  return {
    valid: false,
    format: "INVÁLIDO",
    reason:
      "Formato de código de barras inválido (use EAN-13, EAN-8, UPC ou código comercial válido).",
  };
}

/** Carrega o mapa de códigos de barras por product_id */
export function getAllProductBarcodesMap(): Record<string, CodigoBarrasVinculado[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BARCODE_REGISTRY_STORAGE_KEY);
    const fromRegistry = raw ? (JSON.parse(raw) as Record<string, CodigoBarrasVinculado[]>) : {};
    const meta = getAllProductMeta();
    const merged: Record<string, CodigoBarrasVinculado[]> = { ...fromRegistry };

    for (const [prodId, m] of Object.entries(meta)) {
      if (m.codigos_barras && m.codigos_barras.length > 0 && !merged[prodId]) {
        merged[prodId] = m.codigos_barras;
      }
    }
    return merged;
  } catch {
    return {};
  }
}

export function getProductBarcodes(productId: string): CodigoBarrasVinculado[] {
  const map = getAllProductBarcodesMap();
  return map[productId] ?? [];
}

export function getPrincipalBarcode(productId: string): string | null {
  const list = getProductBarcodes(productId);
  if (list.length === 0) return null;
  const principal = list.find((b) => b.principal) ?? list[0];
  return principal?.codigo ?? null;
}

/** Salva a lista de códigos de barras de um produto localmente e sincroniza metadados */
export function saveProductBarcodes(productId: string, barcodes: CodigoBarrasVinculado[]): void {
  if (typeof window === "undefined") return;
  const normalized: CodigoBarrasVinculado[] = [];
  const seen = new Set<string>();

  for (const b of barcodes) {
    const clean = normalizeBarcode(b.codigo);
    if (!clean || seen.has(clean.toUpperCase())) continue;
    seen.add(clean.toUpperCase());
    normalized.push({
      ...b,
      codigo: clean,
      fator_conversao:
        b.fator_conversao && Number(b.fator_conversao) > 0 ? Number(b.fator_conversao) : 1,
    });
  }

  if (normalized.length > 0 && !normalized.some((x) => x.principal)) {
    normalized[0]!.principal = true;
  }

  try {
    const all = getAllProductBarcodesMap();
    all[productId] = normalized;
    window.localStorage.setItem(BARCODE_REGISTRY_STORAGE_KEY, JSON.stringify(all));
    setProductMeta(productId, {
      codigo_barras: normalized.find((x) => x.principal)?.codigo ?? normalized[0]?.codigo,
      codigos_barras: normalized,
    });
  } catch {
    // ignore storage errors
  }
}

/** Sincroniza o registro de códigos de barras com o banco (school_documents) para compartilhar entre dispositivos */
export async function syncBarcodesRegistryWithCloud(schoolId?: string | null): Promise<void> {
  if (!schoolId || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  try {
    const localMap = getAllProductBarcodesMap();
    const { data: existing } = await supabase
      .from("school_documents")
      .select("id, content")
      .eq("school_id", schoolId)
      .eq("category", "product_barcodes_registry")
      .maybeSingle();

    const cloudMap =
      existing?.content &&
      typeof existing.content === "object" &&
      "barcodesByProduct" in (existing.content as Record<string, unknown>)
        ? ((existing.content as { barcodesByProduct: Record<string, CodigoBarrasVinculado[]> })
            .barcodesByProduct ?? {})
        : {};

    // Mescla códigos da nuvem com códigos locais sem perder nenhum vínculo
    const merged: Record<string, CodigoBarrasVinculado[]> = { ...cloudMap };
    for (const [prodId, localList] of Object.entries(localMap)) {
      const base = merged[prodId] ?? [];
      const byCode = new Map<string, CodigoBarrasVinculado>();
      for (const item of [...base, ...localList]) {
        const clean = normalizeBarcode(item.codigo);
        if (clean) byCode.set(clean.toUpperCase(), { ...item, codigo: clean });
      }
      const arr = Array.from(byCode.values());
      if (arr.length > 0 && !arr.some((x) => x.principal)) {
        arr[0]!.principal = true;
      }
      if (arr.length > 0) {
        merged[prodId] = arr;
        saveProductBarcodes(prodId, arr);
      }
    }

    if (Object.keys(merged).length === 0) return;

    if (existing?.id) {
      await supabase
        .from("school_documents")
        .update({
          content: { barcodesByProduct: merged },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("school_documents").insert({
        school_id: schoolId,
        name: "Registro de Códigos de Barras Vinculados",
        category: "product_barcodes_registry",
        responsible: "Sistema de Código de Barras",
        content: { barcodesByProduct: merged },
      });
    }
  } catch {
    // fallback silencioso caso offline ou sem permissão de escrita em documentos
  }
}

/** Verifica se um código de barras já está vinculado a outro produto no sistema.
 * Retorna o produto conflitante e a mensagem obrigatória:
 * "ESTE CÓDIGO JÁ ESTÁ VINCULADO AO PRODUTO: [NOME DO PRODUTO]."
 */
export function checkBarcodeConflict(
  barcode: string,
  produtos: Produto[],
  ignoreProductId?: string,
): {
  conflict: boolean;
  ownerProduct?: Produto;
  linkedInfo?: CodigoBarrasVinculado;
  message?: string;
} {
  const clean = normalizeBarcode(barcode).toUpperCase();
  if (!clean) return { conflict: false };

  const allMap = getAllProductBarcodesMap();
  for (const p of produtos) {
    if (ignoreProductId && p.id === ignoreProductId) continue;
    const list = allMap[p.id] ?? p.codigos_barras ?? [];
    const match = list.find((b) => normalizeBarcode(b.codigo).toUpperCase() === clean);
    if (match) {
      return {
        conflict: true,
        ownerProduct: p,
        linkedInfo: match,
        message: `ESTE CÓDIGO JÁ ESTÁ VINCULADO AO PRODUTO: ${p.nome.toUpperCase()}.`,
      };
    }
    if (p.codigo_barras && normalizeBarcode(p.codigo_barras).toUpperCase() === clean) {
      return {
        conflict: true,
        ownerProduct: p,
        linkedInfo: { codigo: p.codigo_barras, principal: true },
        message: `ESTE CÓDIGO JÁ ESTÁ VINCULADO AO PRODUTO: ${p.nome.toUpperCase()}.`,
      };
    }
  }
  return { conflict: false };
}

/** Localiza um produto a partir de qualquer código de barras vinculado (principal ou secundário) */
export function findProductByBarcode(
  barcode: string,
  produtos: Produto[],
): {
  produto: Produto;
  vinculo: CodigoBarrasVinculado;
} | null {
  const clean = normalizeBarcode(barcode).toUpperCase();
  if (!clean) return null;

  const allMap = getAllProductBarcodesMap();
  for (const p of produtos) {
    const list = allMap[p.id] ?? p.codigos_barras ?? [];
    const match = list.find((b) => normalizeBarcode(b.codigo).toUpperCase() === clean);
    if (match) {
      return { produto: p, vinculo: match };
    }
    if (p.codigo_barras && normalizeBarcode(p.codigo_barras).toUpperCase() === clean) {
      return {
        produto: p,
        vinculo: { codigo: p.codigo_barras, principal: true, fator_conversao: 1 },
      };
    }
  }
  return null;
}

/** Vincula um novo código de barras a um produto existente, garantindo que não haja duplicidade */
export function linkBarcodeToProduct(params: {
  productId: string;
  codigo: string;
  marca_apresentacao?: string;
  unidade_embalagem?: UnidadeApresentacao;
  fator_conversao?: number;
  principal?: boolean;
  responsavel?: string;
  produtos: Produto[];
}): {
  ok: boolean;
  error?: string;
  barcodes?: CodigoBarrasVinculado[];
} {
  const clean = normalizeBarcode(params.codigo);
  const fmt = isValidBarcodeFormat(clean);
  if (!fmt.valid) {
    return { ok: false, error: fmt.reason || "Código de barras inválido." };
  }

  const conflict = checkBarcodeConflict(clean, params.produtos, params.productId);
  if (conflict.conflict) {
    return {
      ok: false,
      error: conflict.message,
    };
  }

  const current = getProductBarcodes(params.productId);
  const existsInSame = current.find(
    (b) => normalizeBarcode(b.codigo).toUpperCase() === clean.toUpperCase(),
  );
  if (existsInSame) {
    return {
      ok: true,
      barcodes: current,
    };
  }

  const makePrincipal = params.principal || current.length === 0;
  const updated: CodigoBarrasVinculado[] = current.map((b) => ({
    ...b,
    principal: makePrincipal ? false : b.principal,
  }));

  updated.push({
    codigo: clean,
    principal: makePrincipal,
    marca_apresentacao: params.marca_apresentacao?.trim() || undefined,
    unidade_embalagem: params.unidade_embalagem,
    fator_conversao:
      params.fator_conversao && params.fator_conversao > 0 ? params.fator_conversao : 1,
    created_at: new Date().toISOString(),
    created_by: params.responsavel,
  });

  saveProductBarcodes(params.productId, updated);
  return { ok: true, barcodes: updated };
}

/** Formata os metadados de auditoria de uma saída realizada por código de barras */
export function formatBarcodeExitObservacoes(params: {
  codigoBarras: string;
  saldoAnterior: number;
  saldoPosterior: number;
  horario?: string;
  observacaoExtra?: string;
}): string {
  const hora = params.horario || new Date().toLocaleTimeString("pt-BR", { hour12: false });
  const parts = [
    BARCODE_EXIT_TAG,
    `[COD_BARRAS:${normalizeBarcode(params.codigoBarras)}]`,
    `[SALDO_ANT:${params.saldoAnterior}]`,
    `[SALDO_POS:${params.saldoPosterior}]`,
    `[HORA:${hora}]`,
  ];
  if (params.observacaoExtra?.trim()) {
    parts.push(params.observacaoExtra.trim());
  } else {
    parts.push(BARCODE_EXIT_ORIGIN_LABEL);
  }
  return parts.join(" ");
}

/** Extrai metadados de movimentações realizadas pelo leitor de código de barras */
export function parseBarcodeMovementMeta(m: Pick<Movimento, "observacoes" | "destino">): {
  isBarcodeExit: boolean;
  origemMovimentacaoLabel: string;
  codigoBarras?: string;
  saldoAnterior?: number;
  saldoPosterior?: number;
  horario?: string;
  textoLimpo: string;
} {
  const obs = m.observacoes ?? "";
  const isBarcodeExit =
    obs.includes(BARCODE_EXIT_TAG) ||
    obs.toUpperCase().includes("SAÍDA POR CÓDIGO DE BARRAS") ||
    (m.destino ?? "").toUpperCase().includes("CÓDIGO DE BARRAS");

  const codMatch = obs.match(/\[COD_BARRAS:([^\]]+)\]/i);
  const antMatch = obs.match(/\[SALDO_ANT:([^\]]+)\]/i);
  const posMatch = obs.match(/\[SALDO_POS:([^\]]+)\]/i);
  const horaMatch = obs.match(/\[HORA:([^\]]+)\]/i);

  const textoLimpo = obs
    .replace(/\[ORIGEM_MOV:[^\]]+\]/gi, "")
    .replace(/\[COD_BARRAS:[^\]]+\]/gi, "")
    .replace(/\[SALDO_ANT:[^\]]+\]/gi, "")
    .replace(/\[SALDO_POS:[^\]]+\]/gi, "")
    .replace(/\[HORA:[^\]]+\]/gi, "")
    .replace(/\[SYNC_ID:[^\]]+\]/gi, "")
    .trim();

  return {
    isBarcodeExit,
    origemMovimentacaoLabel: isBarcodeExit ? BARCODE_EXIT_ORIGIN_LABEL : "Lançamento manual",
    codigoBarras: codMatch?.[1]?.trim(),
    saldoAnterior: antMatch ? Number(antMatch[1]) : undefined,
    saldoPosterior: posMatch ? Number(posMatch[1]) : undefined,
    horario: horaMatch?.[1]?.trim(),
    textoLimpo,
  };
}

/** Emite feedback sonoro (bip de leitor de supermercado) e vibração no celular */
export function playBarcodeBeep(enabled = true) {
  if (typeof window === "undefined") return;
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate(80);
    }
    if (!enabled) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1480, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 200);
  } catch {
    // ignore audio errors
  }
}
