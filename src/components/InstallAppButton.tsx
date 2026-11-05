import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  Laptop,
  MonitorSmartphone,
  Share,
  ShieldCheck,
  Smartphone,
  PlusSquare,
  MoreVertical,
} from "lucide-react";
import {
  detectDeviceEnvironment,
  subscribePwaInstallState,
  triggerNativeInstallPrompt,
  type DevicePlatform,
} from "@/lib/pwa-install";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function InstallAppButton({
  variant = "default",
  className = "",
  fullWidth = false,
}: {
  variant?: "default" | "outline" | "secondary";
  className?: string;
  fullWidth?: boolean;
}) {
  const [env, setEnv] = useState(() => detectDeviceEnvironment());
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"android" | "ios" | "windows">("windows");

  useEffect(() => {
    const update = () => {
      const detected = detectDeviceEnvironment();
      setEnv(detected);
      if (detected.platform === "android") setSelectedTab("android");
      else if (detected.platform === "ios") setSelectedTab("ios");
      else setSelectedTab("windows");
    };
    update();
    return subscribePwaInstallState(update);
  }, []);

  async function handleMainClick() {
    const current = detectDeviceEnvironment();
    setEnv(current);
    if (current.platform === "android") setSelectedTab("android");
    else if (current.platform === "ios") setSelectedTab("ios");
    else setSelectedTab("windows");

    if (current.canPromptNatively) {
      const res = await triggerNativeInstallPrompt();
      if (res === "accepted") {
        toast.success(
          "Aplicativo instalado com sucesso! O ícone foi adicionado à sua tela inicial / área de trabalho.",
        );
        return;
      }
    }
    setOpen(true);
  }

  async function handleDirectPromptInModal() {
    const res = await triggerNativeInstallPrompt();
    if (res === "accepted") {
      toast.success("Instalação iniciada com sucesso!");
      setOpen(false);
    } else if (res === "unavailable") {
      toast.info("Siga os passos abaixo no menu do seu navegador para concluir a instalação.");
    }
  }

  const deviceBadgeLabel = (p: DevicePlatform) => {
    if (p === "android") return "Android detectado";
    if (p === "ios") return "iPhone / iOS detectado";
    if (p === "windows") return "Windows 10/11 detectado";
    return env.platformLabel;
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => void handleMainClick()}
        className={`font-semibold tracking-wide ${fullWidth ? "w-full" : ""} ${className}`}
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>BAIXAR / INSTALAR APLICATIVO</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <MonitorSmartphone className="h-5 w-5 text-primary" />
              Baixar e Instalar Aplicativo — Merenda Escolar
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {/* Dispositivo identificado automaticamente */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-primary/5 p-3.5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Dispositivo identificado automaticamente
                </div>
                <div className="mt-0.5 font-bold text-foreground">
                  {deviceBadgeLabel(env.platform)} · {env.browserLabel}
                </div>
              </div>
              {env.isStandalone ? (
                <span className="flex items-center gap-1 rounded-full bg-entrada-soft px-3 py-1 text-xs font-semibold text-entrada">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Já instalado neste aparelho
                </span>
              ) : env.canPromptNatively ? (
                <Button size="sm" onClick={() => void handleDirectPromptInModal()}>
                  <Download className="h-4 w-4" /> Instalar Agora (1 Clique)
                </Button>
              ) : null}
            </div>

            {/* Abas por sistema operacional */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                size="sm"
                variant={selectedTab === "android" ? "default" : "outline"}
                onClick={() => setSelectedTab("android")}
              >
                <Smartphone className="h-4 w-4" /> Android
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedTab === "ios" ? "default" : "outline"}
                onClick={() => setSelectedTab("ios")}
              >
                <Smartphone className="h-4 w-4" /> iPhone (iOS)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedTab === "windows" ? "default" : "outline"}
                onClick={() => setSelectedTab("windows")}
              >
                <Laptop className="h-4 w-4" /> Windows 10 / 11
              </Button>
            </div>

            {/* Instruções para Android */}
            {selectedTab === "android" && (
              <div className="space-y-3 rounded-xl border bg-card p-4">
                <h3 className="font-display text-base font-bold">
                  Como instalar no celular ou tablet Android
                </h3>
                {env.canPromptNatively && (
                  <div className="rounded-lg bg-entrada-soft p-3 text-xs text-entrada">
                    <p className="font-semibold">
                      Seu navegador suporta instalação direta! Clique no botão abaixo para criar o
                      ícone na tela inicial:
                    </p>
                    <Button
                      size="sm"
                      className="mt-2 w-full bg-entrada hover:bg-entrada/90"
                      onClick={() => void handleDirectPromptInModal()}
                    >
                      <Download className="h-4 w-4" /> Instalar Aplicativo no Android
                    </Button>
                  </div>
                )}
                <ol className="space-y-2.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      1
                    </span>
                    <span>
                      Abra este endereço no navegador <b>Google Chrome</b> ou{" "}
                      <b>Samsung Internet</b> do seu celular.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      2
                    </span>
                    <span>
                      Toque no menu de três pontos{" "}
                      <span className="inline-flex items-center rounded border bg-muted px-1 py-0.5 font-semibold text-foreground">
                        <MoreVertical className="h-3 w-3" />
                      </span>{" "}
                      no canto superior direito do navegador.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      3
                    </span>
                    <span>
                      Selecione <b className="text-foreground">"Instalar aplicativo"</b> ou{" "}
                      <b className="text-foreground">"Adicionar à tela inicial"</b> e confirme em{" "}
                      <b>Instalar</b>.
                    </span>
                  </li>
                </ol>
              </div>
            )}

            {/* Instruções para iPhone / iPad (iOS) */}
            {selectedTab === "ios" && (
              <div className="space-y-3 rounded-xl border bg-card p-4">
                <h3 className="font-display text-base font-bold">
                  Como instalar no iPhone ou iPad (iOS)
                </h3>
                <p className="text-xs text-muted-foreground">
                  No iPhone, a instalação é feita diretamente pelo menu de compartilhamento do{" "}
                  <b>Safari</b> (ou Chrome):
                </p>
                <ol className="space-y-2.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      1
                    </span>
                    <span>
                      Toque no botão <b className="text-foreground">Compartilhar</b>{" "}
                      <span className="inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 font-semibold text-foreground">
                        <Share className="h-3 w-3" /> Compartilhar
                      </span>{" "}
                      na barra inferior (ou superior) do Safari.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      2
                    </span>
                    <span>
                      Role a lista de opções para baixo e toque em{" "}
                      <span className="inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 font-semibold text-foreground">
                        <PlusSquare className="h-3 w-3" /> Adicionar à Tela de Início
                      </span>
                      .
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      3
                    </span>
                    <span>
                      Confirme o nome <b className="text-foreground">Merenda Escolar</b> e toque em{" "}
                      <b className="text-foreground">Adicionar</b> no canto superior direito. O
                      aplicativo abrirá em tela própria com ícone exclusivo!
                    </span>
                  </li>
                </ol>
              </div>
            )}

            {/* Instruções para Windows 10 e 11 */}
            {selectedTab === "windows" && (
              <div className="space-y-3 rounded-xl border bg-card p-4">
                <h3 className="font-display text-base font-bold">
                  Como instalar no Computador (Windows 10 e Windows 11)
                </h3>
                {env.canPromptNatively && (
                  <div className="rounded-lg bg-entrada-soft p-3 text-xs text-entrada">
                    <p className="font-semibold">
                      Instalação imediata disponível! Clique abaixo para criar o atalho na Área de
                      Trabalho e Menu Iniciar:
                    </p>
                    <Button
                      size="sm"
                      className="mt-2 w-full bg-entrada hover:bg-entrada/90"
                      onClick={() => void handleDirectPromptInModal()}
                    >
                      <Download className="h-4 w-4" /> Instalar Aplicativo no Windows
                    </Button>
                  </div>
                )}
                <ol className="space-y-2.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      1
                    </span>
                    <span>
                      No <b>Google Chrome</b> ou <b>Microsoft Edge</b>, localize o ícone de
                      computador com uma seta{" "}
                      <b className="text-foreground">("Instalar Gestão da Merenda Escolar")</b> no
                      lado direito da barra de endereços.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      2
                    </span>
                    <span>
                      Ou clique no menu do navegador (<b>⋮</b> ou <b>⋯</b> no canto superior
                      direito) → <b className="text-foreground">Aplicativos</b> (ou{" "}
                      <b>Salvar e compartilhar</b>) →{" "}
                      <b className="text-foreground">Instalar este site como um aplicativo</b>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      3
                    </span>
                    <span>
                      Confirme em <b className="text-foreground">Instalar</b>. O sistema abrirá em
                      janela dedicada e criará um ícone próprio na Área de Trabalho e na Barra de
                      Tarefas do Windows.
                    </span>
                  </li>
                </ol>
              </div>
            )}

            {/* Garantias de Sincronização e Segurança */}
            <div className="rounded-xl border bg-muted/40 p-3.5 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" /> Sincronização em Nuvem e Modo
                Offline Seguro
              </div>
              <p>
                A instalação em celulares ou computadores utiliza a mesma base de dados oficial da
                Secretaria Municipal de Educação, preservando integralmente cadastros, estoques,
                entradas, saídas, relatórios e arquivos importados. Em caso de internet instável, os
                lançamentos são guardados com segurança no aparelho e sincronizados sem duplicidade
                assim que a conexão retornar.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
