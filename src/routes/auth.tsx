import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wheat, ArrowRight, LockKeyhole } from "lucide-react";
import kitchenImage from "@/assets/merenda-cozinha.jpg";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Gestão da Merenda Escolar" },
      { name: "description", content: "Acesse o sistema de controle de estoque da merenda escolar." },
      { property: "og:title", content: "Entrar — Gestão da Merenda Escolar" },
      { property: "og:description", content: "Acesse o sistema de controle de estoque da merenda escolar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) nav({ to: "/painel" });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) nav({ to: "/painel" });
    });
    return () => data.subscription.unsubscribe();
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { emailRedirectTo: window.location.origin, data: { nome } },
        });
        if (error) throw error;
        toast.success("Cadastro realizado! Confirme seu e-mail para entrar.");
        setModo("entrar");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Não foi possível entrar com Google");
  }

  return (
    <div className="min-h-screen bg-card">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Wheat className="h-6 w-6" /></span>
          <span className="font-display text-lg font-bold leading-tight">Merenda Escolar</span>
        </div>
        <span className="hidden text-xs font-medium text-muted-foreground sm:block">Secretaria Municipal de Educação</span>
        <LockKeyhole className="h-4 w-4 text-primary sm:hidden" aria-hidden="true" />
      </header>
      <section className="auth-cover relative isolate overflow-hidden">
        <img src={kitchenImage} alt="Alimentos preparados em uma cozinha escolar" width={1920} height={1024} className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-center px-5 text-cover-foreground sm:px-8">
          <span className="mb-4 text-xs font-semibold uppercase tracking-widest">Alimentação e educação</span>
          <h1 className="max-w-lg text-3xl font-bold leading-tight sm:text-4xl">Gestão da<br />Merenda Escolar</h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-cover-foreground/90">Cuidado com os alimentos.<br />Compromisso com cada estudante.</p>
        </div>
      </section>
      <main className="auth-enter mx-auto w-full max-w-lg px-5 py-8 sm:px-8 sm:py-9">
        <form onSubmit={submit} className="space-y-5">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">{modo === "entrar" ? "Bem-vindo de volta" : "Criar conta"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {modo === "entrar" ? "Use seu e-mail e senha." : "Após o cadastro, o administrador definirá seu perfil e escola."}
            </p>
          </div>
          {modo === "cadastrar" && (
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input id="nome" autoComplete="name" className="h-11 bg-background" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="seu@email.com" className="h-11 bg-background" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" autoComplete={modo === "entrar" ? "current-password" : "new-password"} placeholder="••••••••" className="h-11 bg-background" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Cadastrar"}<ArrowRight className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" /></div>
          <Button type="button" variant="outline" className="h-11 w-full" onClick={google}>
            <span className="font-bold text-base" aria-hidden="true">G</span> Continuar com Google
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {modo === "entrar" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
            <Button type="button" variant="link" className="h-auto p-0 font-semibold" onClick={() => setModo(modo === "entrar" ? "cadastrar" : "entrar")}>
              {modo === "entrar" ? "Cadastre-se" : "Entrar"}
            </Button>
          </p>
        </form>
      </main>
      <footer className="border-t bg-background px-5 py-5 text-center text-xs text-muted-foreground">Secretaria Municipal de Educação · Merenda Escolar</footer>
    </div>
  );
}
