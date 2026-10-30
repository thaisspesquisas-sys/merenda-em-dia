import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Movimento, Produto } from "./estoque";

export type Role = "admin" | "estoquista" | "diretor";

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
  estoquista: "Responsável pelo estoque",
  diretor: "Diretor escolar",
};

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const [{ data: prof }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      const rs = (roles ?? []).map((r) => r.role as Role);
      const role: Role | null = rs.includes("admin") ? "admin" : rs.includes("estoquista") ? "estoquista" : rs.includes("diretor") ? "diretor" : null;
      return { id: u.user.id, nome: prof?.nome ?? u.user.email ?? "", school_id: prof?.school_id ?? null, role };
    },
  });
}

export function AppProvider({ me, children }: { me: { id: string; nome: string; school_id: string | null; role: Role | null }; children: ReactNode }) {
  const escolasQ = useQuery({
    queryKey: ["escolas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("nome");
      if (error) throw error;
      return data as Escola[];
    },
    enabled: !!me.role,
  });
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    setSel(localStorage.getItem("escola_sel"));
  }, []);
  const escolas = escolasQ.data ?? [];
  const isAdmin = me.role === "admin";
  const escola = useMemo(() => {
    if (!isAdmin) return escolas.find((e) => e.id === me.school_id) ?? null;
    return escolas.find((e) => e.id === sel) ?? escolas[0] ?? null;
  }, [escolas, sel, isAdmin, me.school_id]);

  const value: Ctx = {
    userId: me.id,
    nome: me.nome,
    role: me.role,
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
      const { data, error } = await supabase.from("products").select("*").order("nome");
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, estoque_minimo: Number(p.estoque_minimo) })) as Produto[];
    },
  });
}

export function useMovimentos(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["movimentos", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
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
        all.push(...((data ?? []).map((m) => ({ ...m, quantidade: Number(m.quantidade) })) as Movimento[]));
        if (!data || data.length < size) break;
      }
      return all;
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
      const { data, error } = await supabase.from("monthly_closings").select("*").eq("school_id", schoolId!).order("ano", { ascending: false }).order("mes", { ascending: false });
      if (error) throw error;
      return data as Fechamento[];
    },
  });
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Erro inesperado";
}
