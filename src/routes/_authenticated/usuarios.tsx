import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, ROLE_LABEL, useApp, type Role } from "@/lib/app-context";
import { NSelect, PageHeader, Panel } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Gestão da Merenda Escolar" }] }),
  component: Usuarios,
});

function Usuarios() {
  const { isAdmin, escolas, userId } = useApp();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["usuarios"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: ps, error }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("*").order("nome"),
        supabase.from("user_roles").select("*"),
      ]);
      if (error) throw error;
      return (ps ?? []).map((p) => ({ ...p, role: (rs ?? []).find((r) => r.user_id === p.id)?.role as Role | undefined }));
    },
  });
  if (!isAdmin) return <PageHeader title="Acesso restrito" />;

  async function setRole(id: string, role: string) {
    if (id === userId && role !== "admin") return toast.error("Você não pode remover seu próprio perfil de administrador.");
    const d = await supabase.from("user_roles").delete().eq("user_id", id);
    if (d.error) return toast.error(errMsg(d.error));
    if (role) {
      const i = await supabase.from("user_roles").insert({ user_id: id, role: role as Role });
      if (i.error) return toast.error(errMsg(i.error));
    }
    toast.success("Perfil atualizado");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  async function setEscola(id: string, school_id: string) {
    const { error } = await supabase.from("profiles").update({ school_id: school_id || null }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    toast.success("Escola vinculada");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  return (
    <div>
      <PageHeader title="Usuários e permissões" desc="Novos usuários se cadastram na tela de login; aqui você define perfil e escola." />
      <Panel className="overflow-x-auto p-0 md:p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Nome</th><th className="p-3">E-mail</th><th className="p-3">Perfil</th><th className="p-3">Unidade escolar</th></tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3 font-medium">{u.nome}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <NSelect value={u.role ?? ""} onChange={(e) => setRole(u.id, e.target.value)} className="min-w-52">
                    <option value="">Sem acesso (pendente)</option>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </NSelect>
                </td>
                <td className="p-3">
                  <NSelect value={u.school_id ?? ""} onChange={(e) => setEscola(u.id, e.target.value)} className="min-w-52">
                    <option value="">— Nenhuma —</option>
                    {escolas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </NSelect>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
