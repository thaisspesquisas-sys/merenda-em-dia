import { openDB } from "idb";
import type { DocumentContent } from "./document-model";
export interface LocalDraft { userId: string; id: string; schoolId: string; revision: number; content: DocumentContent; name: string; savedAt: string }
async function db() { return openDB("merenda-document-drafts", 1, { upgrade(db) { db.createObjectStore("drafts"); } }); }
export async function putDraft(draft: LocalDraft) { const d = await db(); await d.put("drafts", draft, `${draft.userId}:${draft.id}`); }
export async function getDraft(userId: string, id: string): Promise<LocalDraft | undefined> { const d = await db(); return d.get("drafts", `${userId}:${id}`); }
export async function removeDraft(userId: string, id: string) { const d = await db(); await d.delete("drafts", `${userId}:${id}`); }