import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Gestão da Merenda Escolar" },
      { name: "description", content: "Sistema de controle de estoque da merenda escolar para unidades de ensino." },
      { property: "og:title", content: "Gestão da Merenda Escolar" },
      { property: "og:description", content: "Controle de entradas, saídas, origem dos alimentos e fechamento mensal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/painel" : "/auth" });
  },
});
