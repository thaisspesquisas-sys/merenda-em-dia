import { useEffect, useState } from "react";
import { Wheat } from "lucide-react";

const SPLASH_SHOWN_KEY = "merenda_pwa_splash_shown_v1";

export function PwaSplashScreen() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.location.search.includes("source=pwa");
    const alreadyShown = sessionStorage.getItem(SPLASH_SHOWN_KEY) === "1";

    if (isStandalone || !alreadyShown) {
      sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), isStandalone ? 1100 : 650);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-label="Tela de abertura do aplicativo"
      className="no-print fixed inset-0 z-[100] flex flex-col items-center justify-center bg-primary text-primary-foreground transition-opacity duration-300"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 shadow-lg backdrop-blur">
        <Wheat className="h-11 w-11 text-white" />
      </div>
      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
        Gestão da Merenda Escolar
      </h1>
      <p className="mt-1.5 text-xs font-medium uppercase tracking-widest text-white/80">
        Secretaria Municipal de Educação
      </p>
      <div className="mt-6 h-1 w-32 overflow-hidden rounded-full bg-white/20">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-white" />
      </div>
    </div>
  );
}

