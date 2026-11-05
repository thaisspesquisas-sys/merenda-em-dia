import { openDB, type IDBPDatabase } from "idb";
import { supabase } from "@/integrations/supabase/client";
import type { Origem } from "./estoque";

export interface PendingOfflineMovement {
  id: string;
  idempotencyKey: string;
  schoolId: string;
  schoolName: string;
  productId: string;
  productName: string;
  tipo: "entrada" | "saida";
  data: string;
  quantidade: number;
  origem: Origem | "auto";
  fornecedor?: string | null;
  nota_fiscal?: string | null;
  destino?: string | null;
  responsavel?: string | null;
  observacoes?: string | null;
  createdAt: string;
  status: "pending" | "syncing" | "error";
  errorMessage?: string;
}

const DB_NAME = "merenda-offline-sync-v1";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cache")) {
          db.createObjectStore("cache");
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export function buildMovementIdempotencyKey(params: {
  schoolId: string;
  productId: string;
  tipo: "entrada" | "saida";
  data: string;
  quantidade: number;
  origem: string;
  nota_fiscal?: string | null;
  destino?: string | null;
}): string {
  return [
    params.schoolId,
    params.productId,
    params.tipo,
    params.data,
    Number(params.quantidade).toFixed(3),
    params.origem,
    (params.nota_fiscal ?? "").trim().toLowerCase(),
    (params.destino ?? "").trim().toLowerCase(),
  ].join("|");
}

export async function saveOfflineCache<T>(key: string, data: T): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put("cache", { data, updatedAt: new Date().toISOString() }, key);
  } catch {
    // ignore IndexedDB errors
  }
}

export async function loadOfflineCache<T>(key: string): Promise<T | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const entry = (await db.get("cache", key)) as { data: T; updatedAt: string } | undefined;
    return entry?.data ?? null;
  } catch {
    return null;
  }
}

const outboxListeners = new Set<() => void>();
function notifyOutbox() {
  for (const fn of outboxListeners) fn();
}

export function subscribeOfflineOutbox(cb: () => void): () => void {
  outboxListeners.add(cb);
  return () => {
    outboxListeners.delete(cb);
  };
}

export async function getPendingOfflineMovements(): Promise<PendingOfflineMovement[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const all = (await db.getAll("outbox")) as PendingOfflineMovement[];
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function enqueueOfflineMovement(
  input: Omit<PendingOfflineMovement, "id" | "idempotencyKey" | "createdAt" | "status">,
): Promise<{ item: PendingOfflineMovement; deduplicated: boolean }> {
  const idempotencyKey = buildMovementIdempotencyKey({
    schoolId: input.schoolId,
    productId: input.productId,
    tipo: input.tipo,
    data: input.data,
    quantidade: input.quantidade,
    origem: input.origem,
    nota_fiscal: input.nota_fiscal,
    destino: input.destino,
  });

  const existing = await getPendingOfflineMovements();
  const duplicate = existing.find((x) => x.idempotencyKey === idempotencyKey);
  if (duplicate) {
    return { item: duplicate, deduplicated: true };
  }

  const item: PendingOfflineMovement = {
    ...input,
    id: crypto.randomUUID(),
    idempotencyKey,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  const db = await getDb();
  if (db) {
    await db.put("outbox", item);
    notifyOutbox();
  }
  return { item, deduplicated: false };
}

export async function removeOfflineMovement(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete("outbox", id);
  notifyOutbox();
}

let isSyncingNow = false;

export async function syncOfflineOutbox(): Promise<{
  syncedCount: number;
  skippedDuplicates: number;
  errors: string[];
}> {
  if (isSyncingNow) return { syncedCount: 0, skippedDuplicates: 0, errors: [] };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      syncedCount: 0,
      skippedDuplicates: 0,
      errors: ["Dispositivo sem conexão no momento."],
    };
  }

  const items = await getPendingOfflineMovements();
  if (items.length === 0) return { syncedCount: 0, skippedDuplicates: 0, errors: [] };

  isSyncingNow = true;
  let syncedCount = 0;
  let skippedDuplicates = 0;
  const errors: string[] = [];

  try {
    const db = await getDb();
    for (const item of items) {
      const syncTag = `[SYNC_ID:${item.id.slice(0, 12)}]`;
      try {
        // Check if this exact offline movement was already committed to prevent duplicates
        const { data: existingRemote } = await supabase
          .from("movements")
          .select("id, observacoes")
          .eq("school_id", item.schoolId)
          .eq("product_id", item.productId)
          .eq("tipo", item.tipo)
          .eq("data", item.data)
          .eq("quantidade", item.quantidade);

        const alreadySynced = (existingRemote ?? []).some((r) =>
          (r.observacoes ?? "").includes(syncTag),
        );

        if (alreadySynced) {
          if (db) await db.delete("outbox", item.id);
          skippedDuplicates++;
          continue;
        }

        const obsWithSyncTag = [item.observacoes?.trim() ?? "", syncTag].filter(Boolean).join(" ");

        if (item.tipo === "entrada") {
          const { error } = await supabase.from("movements").insert({
            school_id: item.schoolId,
            product_id: item.productId,
            tipo: "entrada",
            data: item.data,
            quantidade: item.quantidade,
            origem: item.origem === "auto" ? "mercado" : item.origem,
            fornecedor: item.fornecedor || null,
            nota_fiscal: item.nota_fiscal || null,
            responsavel: item.responsavel || null,
            observacoes: obsWithSyncTag,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.rpc("registrar_saida", {
            _school: item.schoolId,
            _product: item.productId,
            _data: item.data,
            _quantidade: item.quantidade,
            _origem: item.origem,
            _destino: item.destino || "Preparação da merenda",
            _responsavel: item.responsavel || "",
            _observacoes: obsWithSyncTag,
          });
          if (error) throw error;
        }

        if (db) await db.delete("outbox", item.id);
        syncedCount++;
      } catch (err) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: string }).message)
            : "Falha ao sincronizar";
        errors.push(`${item.productName}: ${msg}`);
        if (db) {
          await db.put("outbox", {
            ...item,
            status: "error",
            errorMessage: msg,
          });
        }
      }
    }
  } finally {
    isSyncingNow = false;
    notifyOutbox();
  }

  return { syncedCount, skippedDuplicates, errors };
}
