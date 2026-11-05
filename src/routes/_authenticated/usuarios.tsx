import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "@/lib/page-meta";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Users as UsersIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  errMsg,
  getUserProfileTags,
  INSTITUTIONAL_PROFILE_LABEL,
  setUserProfileTag,
  useApp,
  type InstitutionalProfile,
  type Role,
} from "@/lib/app-context";
import { NSelect, PageHeader, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () =>
    pageMeta(
      "Usuários, Permissões e Auditoria",
      "Gerencie níveis de acesso (Administrador, Nutricionista, Responsável pela Merenda e Gestores Escolares) e consulte o histórico de alterações.",
    ),
  component: Usuarios,
});

function Usuarios() {
  const { isAdmin, escolas, userId } = useApp();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"usuarios" | "auditoria">("usuarios");
  const [profileTags, setProfileTags] = useState<Record<string, InstitutionalProfile>>(() =>
    getUserProfileTags(),
  );

  const q = useQuery({
    queryKey: ["usuarios"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: ps, error }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("*").order("nome"),
        supabase.from("user_roles").select("*"),
      ]);
      if (error) throw error;
      return (ps ?? []).map((p) => ({
        ...p,
        role: (rs ?? []).find((r) => r.user_id === p.id)?.role as Role | undefined,
      }));
    },
  });

  const auditQ = useQuery({
    queryKey: ["audit-log"],
    enabled: isAdmin && tab === "auditoria",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isAdmin) return <PageHeader title="Acesso restrito" />;

  async function setInstitutionalRole(id: string, instProfile: string) {
    if (id === userId && instProfile !== "admin") {
      toast.error("Você não pode remover seu próprio perfil de administrador.");
      return;
    }
    const d = await supabase.from("user_roles").delete().eq("user_id", id);
    if (d.error) {
      toast.error(errMsg(d.error));
      return;
    }
    if (instProfile) {
      // Map "nutricionista" to technical role "admin" or "estoquista" in user_roles so RLS works across schools
      const dbRole: Role = instProfile === "nutricionista" ? "admin" : (instProfile as Role);
      const i = await supabase.from("user_roles").insert({ user_id: id, role: dbRole });
      if (i.error) {
        toast.error(errMsg(i.error));
        return;
      }
      setUserProfileTag(id, instProfile as InstitutionalProfile);
      setProfileTags(getUserProfileTags());
    }
    toast.success("Nível de acesso atualizado e registrado na auditoria");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  async function setEscola(id: string, school_id: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ school_id: school_id || null })
      .eq("id", id);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success("Unidade escolar vinculada");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  const userMap = new Map((q.data ?? []).map((u) => [u.id, u.nome || u.email || u.id]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segurança, Permissões e Histórico de Alterações"
        desc="Níveis de acesso para Administrador, Nutricionista, Responsável pela Merenda e Gestores Escolares + Trilha de Auditoria"
      >
        <div className="flex gap-2">
          <Button
            variant={tab === "usuarios" ? "default" : "outline"}
            onClick={() => setTab("usuarios")}
          >
            <UsersIcon className="h-4 w-4" /> Níveis de Acesso
          </Button>
          <Button
            variant={tab === "auditoria" ? "default" : "outline"}
            onClick={() => setTab("auditoria")}
          >
            <ShieldCheck className="h-4 w-4" /> Histórico de Alterações (Auditoria)
          </Button>
        </div>
      </PageHeader>

      {tab === "usuarios" ? (
        <Panel className="overflow-x-auto p-0 md:p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Nome</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Nível de Acesso</th>
                <th className="p-3">Unidade Escolar Vinculada</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((u) => {
                const effectiveProfile: InstitutionalProfile | "" = u.role
                  ? (profileTags[u.id] ?? u.role)
                  : "";
                return (
                  <tr key={u.id} className="border-t">
                    <td className="p-3 font-medium">{u.nome}</td>
                    <td className="p-3">{u.email}</td>
                    <td className="p-3">
                      <NSelect
                        value={effectiveProfile}
                        onChange={(e) => void setInstitutionalRole(u.id, e.target.value)}
                        className="min-w-60"
                      >
                        <option value="">Sem acesso (aguardando liberação)</option>
                        {(Object.keys(INSTITUTIONAL_PROFILE_LABEL) as InstitutionalProfile[]).map(
                          (r) => (
                            <option key={r} value={r}>
                              {INSTITUTIONAL_PROFILE_LABEL[r]}
                            </option>
                          ),
                        )}
                      </NSelect>
                    </td>
                    <td className="p-3">
                      <NSelect
                        value={u.school_id ?? ""}
                        onChange={(e) => void setEscola(u.id, e.target.value)}
                        className="min-w-56"
                      >
                        <option value="">— Rede Municipal / Todas —</option>
                        {escolas.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nome}
                          </option>
                        ))}
                      </NSelect>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ) : (
        <Panel className="overflow-x-auto p-0 md:p-0">
          <div className="border-b p-4">
            <h2 className="font-display text-base font-bold">
              Histórico de Lançamentos e Alterações do Sistema
            </h2>
            <p className="text-xs text-muted-foreground">
              Todas as criações, edições e exclusões de movimentações, produtos, fechamentos e
              modelos ficam registradas com data, horário e usuário responsável. Nenhuma exclusão
              ocorre de forma silenciosa.
            </p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted text-left uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Data e Horário</th>
                <th className="p-3">Usuário Responsável</th>
                <th className="p-3">Módulo / Tabela</th>
                <th className="p-3">Ação</th>
                <th className="p-3">Detalhes do Registro</th>
              </tr>
            </thead>
            <tbody>
              {(auditQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Nenhum evento de auditoria registrado ainda.
                  </td>
                </tr>
              )}
              {(auditQ.data ?? []).map((log) => (
                <tr key={log.id} className="border-t">
                  <td className="whitespace-nowrap p-3">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3 font-medium">
                    {log.user_id
                      ? (userMap.get(log.user_id) ?? log.user_id.slice(0, 8))
                      : "Sistema"}
                  </td>
                  <td className="p-3">{log.tabela}</td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 font-semibold ${
                        log.acao === "DELETE"
                          ? "bg-saida-soft text-destructive"
                          : log.acao === "UPDATE"
                            ? "bg-warning-soft text-warning"
                            : "bg-entrada-soft text-entrada"
                      }`}
                    >
                      {log.acao}
                    </span>
                  </td>
                  <td className="max-w-md truncate p-3 font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(log.dados)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
