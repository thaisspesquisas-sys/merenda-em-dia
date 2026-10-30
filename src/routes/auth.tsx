import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wheat } from "lucide-react";
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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Wheat className="h-6 w-6" /> Gestão da Merenda Escolar
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Do recebimento ao prato, cada quilo registrado.</h1>
          <p className="mt-4 max-w-md opacity-80">
            Controle de entradas, saídas e saldos com separação entre Mercado e Agricultura Familiar, e fechamento mensal pronto para prestação de contas.
          </p>
        </div>
        <p className="text-sm opacity-60">Secretaria Municipal de Educação</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden flex items-center gap-2 text-primary font-semibold">
            <Wheat className="h-5 w-5" /> Gestão da Merenda Escolar
          </div>
          <div>
            <h2 className="text-2xl font-bold">{modo === "entrar" ? "Entrar" : "Criar conta"}</h2>
            <p className="text-sm text-muted-foreground">
              {modo === "entrar" ? "Use seu e-mail e senha." : "Após o cadastro, o administrador definirá seu perfil e escola."}
            </p>
          </div>
          {modo === "cadastrar" && (
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {modo === "entrar" ? "Entrar" : "Cadastrar"}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={google}>
            Continuar com Google
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {modo === "entrar" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
            <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setModo(modo === "entrar" ? "cadastrar" : "entrar")}>
              {modo === "entrar" ? "Cadastre-se" : "Entrar"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
