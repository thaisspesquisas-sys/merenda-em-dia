import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarCheck,
  FileText,
  School,
  Users,
  LogOut,
  Menu,
  Wheat,
  X,
  Sparkles,
  Upload,
  ArchiveRestore,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AppProvider,
  INSTITUTIONAL_PROFILE_LABEL,
  ROLE_LABEL,
  useApp,
  useMe,
} from "@/lib/app-context";
import { InstallAppButton } from "@/components/InstallAppButton";
import { OfflineSyncBar } from "@/components/OfflineSyncBar";
import { NSelect } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

function Layout() {
  const me = useMe();
  if (me.isLoading || !me.data)
    return <div className="p-10 text-muted-foreground">Carregando…</div>;
  if (!me.data.role) return <Pendente />;
  return (
    <AppProvider me={me.data}>
      <Shell />
    </AppProvider>
  );
}

function useSignOut() {
  const qc = useQueryClient();
  const nav = useNavigate();
  return async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };
}

function Pendente() {
  const out = useSignOut();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-card">
        <h1 className="text-xl font-bold">Acesso aguardando liberação</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conta foi criada. O administrador da Secretaria precisa definir seu perfil e sua
          unidade escolar.
        </p>
        <div className="mt-5">
          <InstallAppButton fullWidth />
        </div>
        <Button variant="outline" className="mt-3 w-full" onClick={out}>
          Sair
        </Button>
      </div>
    </div>
  );
}

const NAV = [
  { to: "/painel", label: "Painel de Controle", icon: LayoutDashboard },
  { to: "/estoque-anterior", label: "Estoque Anterior (Inicial)", icon: ArchiveRestore },
  { to: "/modelos", label: "Importar Modelos e Docs", icon: Sparkles },
  { to: "/importar-estoque", label: "Importar Estoque Existente", icon: Upload },
  { to: "/entradas", label: "Controle de Entradas", icon: ArrowDownToLine },
  { to: "/saidas", label: "Controle de Saídas", icon: ArrowUpFromLine },
  { to: "/fechamento", label: "Controle Semanal e Mensal", icon: CalendarCheck },
  { to: "/relatorios", label: "Relatórios e Impressão", icon: FileText },
  { to: "/produtos", label: "Cadastro de Produtos", icon: Package },
  { to: "/escolas", label: "Unidades Escolares", icon: School, admin: true },
  { to: "/usuarios", label: "Segurança e Usuários", icon: Users, admin: true },
] as const;

function Shell() {
  const app = useApp();
  const out = useSignOut();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !("admin" in n) || app.isAdmin);

  const side = (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-3 border-b px-2 pb-4 pt-1 font-display text-lg font-bold text-foreground">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wheat className="h-6 w-6" />
        </span>
        <div>
          <div className="leading-tight">Merenda Escolar</div>
          <div className="text-[11px] font-normal text-muted-foreground">
            Gestão Inteligente SME
          </div>
        </div>
      </div>
      {items.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent"
          activeProps={{ className: "bg-sidebar-accent text-primary font-semibold" }}
        >
          <n.icon className="h-4 w-4 shrink-0" /> <span className="truncate">{n.label}</span>
        </Link>
      ))}
      <div className="mt-auto space-y-3 border-t border-sidebar-accent pt-4 text-xs">
        <InstallAppButton variant="outline" fullWidth className="h-9 text-xs" />
        <div>
          <div className="px-2 font-semibold">{app.nome}</div>
          <div className="px-2 opacity-70">
            {app.institutionalProfile
              ? INSTITUTIONAL_PROFILE_LABEL[app.institutionalProfile]
              : app.role && ROLE_LABEL[app.role]}
          </div>
          <Button variant="ghost" onClick={out} className="mt-2 w-full justify-start px-2 text-sm">
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen border-r bg-sidebar text-sidebar-foreground md:block">
        {side}
      </aside>
      {open && (
        <div className="no-print fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-sidebar text-sidebar-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </Button>
            {side}
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <OfflineSyncBar />
        <header className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b bg-card/95 px-4 py-3.5 backdrop-blur md:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Unidade
          </div>
          {app.isAdmin ? (
            <NSelect
              value={app.escola?.id ?? ""}
              onChange={(e) => app.setEscolaId(e.target.value)}
              className="max-w-xs"
            >
              {app.escolas.length === 0 && <option value="">Nenhuma escola cadastrada</option>}
              {app.escolas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </NSelect>
          ) : (
            <div className={cn("truncate text-sm font-semibold")}>
              {app.escola?.nome ?? "Sem escola vinculada"}
            </div>
          )}
          <div className="ml-auto">
            <InstallAppButton variant="default" className="h-9 text-xs shadow-sm" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
