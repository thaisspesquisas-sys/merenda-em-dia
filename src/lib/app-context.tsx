import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { enrichProduto, type Movimento, type Produto } from "./estoque";
import { getPendingOfflineMovements, loadOfflineCache, saveOfflineCache } from "./offline-sync";

export type Role = "admin" | "estoquista" | "diretor";
export type InstitutionalProfile = "admin" | "nutricionista" | "estoquista" | "diretor";

export interface Escola {
  id: string;
  nome: string;
  endereco: string | null;
  responsavel: string | null;
  diretor: string | null;
  ativo: boolean;
}

interface Ctx {
  userId: string;
  nome: string;
  role: Role | null;
  institutionalProfile: InstitutionalProfile | null;
  isAdmin: boolean;
  canWrite: boolean;
  escolas: Escola[];
  escola: Escola | null;
  setEscolaId: (id: string) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do provider");
  return c;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador da Secretaria",
  estoquista: "Responsável pela merenda / estoque",
  diretor: "Gestor / Diretor escolar",
};

export const INSTITUTIONAL_PROFILE_LABEL: Record<InstitutionalProfile, string> = {
  admin: "Administrador da Secretaria",
  nutricionista: "Nutricionista (RT / PNAE)",
  estoquista: "Responsável pela Merenda",
  diretor: "Gestor / Diretor Escolar",
};

const USER_PROFILE_TAG_KEY = "merenda_user_profile_tags_v1";

export function getUserProfileTags(): Record<string, InstitutionalProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(USER_PROFILE_TAG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, InstitutionalProfile>) : {};
  } catch {
    return {};
  }
}

export function setUserProfileTag(userId: string, profile: InstitutionalProfile) {
  if (typeof window === "undefined") return;
  try {
    const tags = getUserProfileTags();
    tags[userId] = profile;
    window.localStorage.setItem(USER_PROFILE_TAG_KEY, JSON.stringify(tags));
  } catch {
    // ignore storage errors
  }
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error("Sem sessão");
        const [{ data: prof }, { data: roles }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        ]);
        const rs = (roles ?? []).map((r) => r.role as Role);
        const role: Role | null = rs.includes("admin")
          ? "admin"
          : rs.includes("estoquista")
            ? "estoquista"
            : rs.includes("diretor")
              ? "diretor"
              : null;
        const meData = {
          id: u.user.id,
          nome: prof?.nome ?? u.user.email ?? "",
          school_id: prof?.school_id ?? null,
          role,
        };
        await saveOfflineCache("me", meData);
        return meData;
      } catch (err) {
        const cached = await loadOfflineCache<{
          id: string;
          nome: string;
          school_id: string | null;
          role: Role | null;
        }>("me");
        if (cached) return cached;
        throw err;
      }
    },
  });
}

export function AppProvider({
  me,
  children,
}: {
  me: { id: string; nome: string; school_id: string | null; role: Role | null };
  children: ReactNode;
}) {
  const escolasQ = useQuery({
    queryKey: ["escolas"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("schools").select("*").order("nome");
        if (error) throw error;
        const list = (data ?? []) as Escola[];
        await saveOfflineCache("escolas", list);
        return list;
      } catch (err) {
        const cached = await loadOfflineCache<Escola[]>("escolas");
        if (cached) return cached;
        throw err;
      }
    },
    enabled: !!me.role,
  });
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    setSel(localStorage.getItem("escola_sel"));
  }, []);
  const escolas = useMemo(() => escolasQ.data ?? [], [escolasQ.data]);
  const isAdmin = me.role === "admin";
  const escola = useMemo(() => {
    if (!isAdmin) return escolas.find((e) => e.id === me.school_id) ?? null;
    return escolas.find((e) => e.id === sel) ?? escolas[0] ?? null;
  }, [escolas, sel, isAdmin, me.school_id]);

  const tags = getUserProfileTags();
  const institutionalProfile: InstitutionalProfile | null = tags[me.id] ?? me.role;

  const value: Ctx = {
    userId: me.id,
    nome: me.nome,
    role: me.role,
    institutionalProfile,
    isAdmin,
    canWrite: me.role === "admin" || me.role === "estoquista",
    escolas,
    escola,
    setEscolaId: (id) => {
      localStorage.setItem("escola_sel", id);
      setSel(id);
    },
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useProdutos() {
  return useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("products").select("*").order("nome");
        if (error) throw error;
        const list = (data ?? []).map((p) =>
          enrichProduto({ ...p, estoque_minimo: Number(p.estoque_minimo) } as Produto),
        );
        await saveOfflineCache("produtos", list);
        return list;
      } catch (err) {
        const cached = await loadOfflineCache<Produto[]>("produtos");
        if (cached) return cached.map((p) => enrichProduto(p));
        throw err;
      }
    },
  });
}

export function useMovimentos(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["movimentos", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      let base: Movimento[] = [];
      try {
        const all: Movimento[] = [];
        const size = 1000;
        for (let from = 0; ; from += size) {
          const { data, error } = await supabase
            .from("movements")
            .select("*")
            .eq("school_id", schoolId!)
            .order("data", { ascending: true })
            .order("created_at", { ascending: true })
            .range(from, from + size - 1);
          if (error) throw error;
          all.push(
            ...((data ?? []).map((m) => ({
              ...m,
              quantidade: Number(m.quantidade),
            })) as Movimento[]),
          );
          if (!data || data.length < size) break;
        }
        base = all;
        await saveOfflineCache(`movimentos:${schoolId}`, base);
      } catch (err) {
        const cached = await loadOfflineCache<Movimento[]>(`movimentos:${schoolId}`);
        if (!cached) throw err;
        base = cached;
      }

      // Merge any pending offline movements for this school so local balances stay accurate
      const pending = await getPendingOfflineMovements();
      const schoolPending = pending.filter((p) => p.schoolId === schoolId);
      if (schoolPending.length === 0) return base;

      const merged = [...base];
      for (const p of schoolPending) {
        const syncTag = `[SYNC_ID:${p.id.slice(0, 12)}]`;
        const alreadyInBase = merged.some((m) => (m.observacoes ?? "").includes(syncTag));
        if (!alreadyInBase) {
          merged.push({
            id: `offline-${p.id}`,
            school_id: p.schoolId,
            product_id: p.productId,
            tipo: p.tipo,
            data: p.data,
            quantidade: Number(p.quantidade),
            origem: p.origem === "auto" ? "mercado" : p.origem,
            fornecedor: p.fornecedor ?? null,
            nota_fiscal: p.nota_fiscal ?? null,
            destino: p.destino ?? null,
            responsavel: p.responsavel ?? null,
            observacoes: [p.observacoes ?? "", "(Pendente de sincronização)"]
              .filter(Boolean)
              .join(" "),
            created_at: p.createdAt,
          });
        }
      }
      return merged;
    },
  });
}

export function useAllMovimentos(enabled = true) {
  return useQuery({
    queryKey: ["movimentos-rede"],
    enabled,
    queryFn: async () => {
      try {
        const all: Movimento[] = [];
        const size = 1000;
        for (let from = 0; ; from += size) {
          const { data, error } = await supabase
            .from("movements")
            .select("*")
            .order("data", { ascending: true })
            .order("created_at", { ascending: true })
            .range(from, from + size - 1);
          if (error) throw error;
          all.push(
            ...((data ?? []).map((m) => ({
              ...m,
              quantidade: Number(m.quantidade),
            })) as Movimento[]),
          );
          if (!data || data.length < size) break;
        }
        await saveOfflineCache("movimentos-rede", all);
        return all;
      } catch (err) {
        const cached = await loadOfflineCache<Movimento[]>("movimentos-rede");
        if (cached) return cached;
        throw err;
      }
    },
  });
}

export interface Fechamento {
  id: string;
  school_id: string;
  ano: number;
  mes: number;
  responsavel: string | null;
  observacoes: string | null;
  snapshot: unknown;
  closed_at: string;
}

export function useFechamentos(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["fechamentos", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("monthly_closings")
          .select("*")
          .eq("school_id", schoolId!)
          .order("ano", { ascending: false })
          .order("mes", { ascending: false });
        if (error) throw error;
        const list = (data ?? []) as Fechamento[];
        await saveOfflineCache(`fechamentos:${schoolId}`, list);
        return list;
      } catch (err) {
        const cached = await loadOfflineCache<Fechamento[]>(`fechamentos:${schoolId}`);
        if (cached) return cached;
        throw err;
      }
    },
  });
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: string }).message);
  return "Erro inesperado";
}
