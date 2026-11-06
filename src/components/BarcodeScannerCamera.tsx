import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Flashlight,
  FlashlightOff,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { normalizeBarcode, playBarcodeBeep } from "@/lib/barcode";
import { Button } from "@/components/ui/button";

interface BarcodeScannerCameraProps {
  onDetected: (barcode: string, formatName?: string) => void;
  /** Mantém o leitor ativo após cada leitura para permitir leituras consecutivas sem fechar a tela */
  continuous?: boolean;
  /** Intervalo mínimo em ms para evitar leituras duplicadas consecutivas do mesmo código */
  duplicateCooldownMs?: number;
  autoStart?: boolean;
  compact?: boolean;
}

export function BarcodeScannerCamera({
  onDetected,
  continuous = true,
  duplicateCooldownMs = 2500,
  autoStart = false,
  compact = false,
}: BarcodeScannerCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastReadRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  const [scanning, setScanning] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastScannedFlash, setLastScannedFlash] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {
        // ignore stop error
      }
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
    setInitializing(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleCodeRecognized = useCallback(
    (rawCode: string, formatName?: string) => {
      const clean = normalizeBarcode(rawCode);
      if (!clean || clean.length < 4) return;

      const now = Date.now();
      // Evita leituras duplicadas consecutivas do mesmo produto dentro da janela de cooldown
      if (
        lastReadRef.current.code === clean &&
        now - lastReadRef.current.time < duplicateCooldownMs
      ) {
        return;
      }

      lastReadRef.current = { code: clean, time: now };
      playBarcodeBeep(soundEnabled);
      setLastScannedFlash(clean);
      setTimeout(() => setLastScannedFlash(null), 900);

      onDetected(clean, formatName);

      if (!continuous) {
        stopCamera();
      }
    },
    [continuous, duplicateCooldownMs, onDetected, soundEnabled, stopCamera],
  );

  const startCamera = useCallback(
    async (preferredDeviceId?: string) => {
      setErrorMsg(null);
      if (typeof window === "undefined") return;

      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setErrorMsg(
          "O acesso à câmera exige conexão segura (HTTPS). Utilize o endereço HTTPS do aplicativo ou pesquise o produto manualmente.",
        );
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg(
          "A câmera não está disponível neste navegador/dispositivo. Utilize o campo de código ou a pesquisa manual abaixo.",
        );
        return;
      }

      stopCamera();
      setInitializing(true);

      try {
        const videoConstraints: MediaTrackConstraints = preferredDeviceId
          ? {
              deviceId: { exact: preferredDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        streamRef.current = stream;

        // Lista câmeras disponíveis após permissão concedida
        try {
          const allDevs = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = allDevs.filter((d) => d.kind === "videoinput");
          setDevices(videoDevs);
          const activeTrack = stream.getVideoTracks()[0];
          const activeDevId = activeTrack?.getSettings()?.deviceId;
          if (activeDevId) setSelectedDeviceId(activeDevId);
        } catch {
          // ignore enumerateDevices error
        }

        // Verifica suporte à lanterna (torch) na câmera traseira
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && "getCapabilities" in videoTrack) {
          try {
            const caps = videoTrack.getCapabilities() as MediaTrackCapabilities & {
              torch?: boolean;
            };
            setTorchSupported(Boolean(caps?.torch));
          } catch {
            setTorchSupported(false);
          }
        }

        if (!videoRef.current) {
          stopCamera();
          return;
        }

        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();

        setScanning(true);
        setInitializing(false);

        // 1. Tenta utilizar ZXing (@zxing/browser + @zxing/library) com suporte completo a EAN-13, EAN-8, UPC-A, UPC-E, CODE-128, CODE-39, ITF
        try {
          const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
            await Promise.all([import("@zxing/browser"), import("@zxing/library")]);

          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.ITF,
            BarcodeFormat.QR_CODE,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);

          const reader = new BrowserMultiFormatReader(hints, {
            delayBetweenScanAttempts: 180,
          });

          if (videoRef.current) {
            const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
              if (result) {
                handleCodeRecognized(result.getText(), String(result.getBarcodeFormat()));
              }
            });
            zxingControlsRef.current = controls;
          }
        } catch {
          // Fallback caso ZXing falhe: utiliza BarcodeDetector nativo do navegador (Android Chrome / Safari)
          const NativeDetector = (
            window as unknown as {
              BarcodeDetector?: new (opts: { formats: string[] }) => {
                detect: (el: HTMLVideoElement) => Promise<{ rawValue: string; format: string }[]>;
              };
            }
          ).BarcodeDetector;

          if (NativeDetector) {
            const detector = new NativeDetector({
              formats: [
                "ean_13",
                "ean_8",
                "upc_a",
                "upc_e",
                "code_128",
                "code_39",
                "itf",
                "qr_code",
              ],
            });
            const loop = async () => {
              if (!videoRef.current || !streamRef.current) return;
              try {
                const results = await detector.detect(videoRef.current);
                if (results && results.length > 0 && results[0]?.rawValue) {
                  handleCodeRecognized(results[0].rawValue, results[0].format);
                }
              } catch {
                // ignore frame error
              }
              rafRef.current = requestAnimationFrame(() => {
                void loop();
              });
            };
            rafRef.current = requestAnimationFrame(() => {
              void loop();
            });
          }
        }
      } catch (err) {
        stopCamera();
        const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setErrorMsg(
            "Permissão da câmera negada. Autorize o uso da câmera nas configurações do navegador do celular ou utilize a pesquisa manual abaixo.",
          );
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setErrorMsg(
            "Nenhuma câmera foi encontrada neste dispositivo. Utilize o campo de código ou a pesquisa manual abaixo.",
          );
        } else {
          setErrorMsg(
            "Não foi possível iniciar a câmera neste momento. Verifique se outro aplicativo está usando a câmera ou pesquise o produto manualmente.",
          );
        }
      }
    },
    [handleCodeRecognized, stopCamera],
  );

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  useEffect(() => {
    if (autoStart) {
      void startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [autoStart, startCamera, stopCamera]);

  return (
    <div className="space-y-3">
      {/* Barra de controles grandes e acessíveis para uso no celular */}
      <div className="flex flex-wrap items-center gap-2">
        {!scanning ? (
          <Button
            type="button"
            size="lg"
            disabled={initializing}
            onClick={() => void startCamera(selectedDeviceId || undefined)}
            className="h-12 flex-1 bg-primary text-base font-bold text-primary-foreground shadow-md sm:flex-none"
          >
            <Camera className="h-5 w-5" /> {initializing ? "ABRINDO CÂMERA…" : "INICIAR LEITURA"}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            variant="destructive"
            onClick={stopCamera}
            className="h-12 flex-1 text-base font-bold shadow-md sm:flex-none"
          >
            <CameraOff className="h-5 w-5" /> ENCERRAR LEITURA
          </Button>
        )}

        {scanning && torchSupported && (
          <Button
            type="button"
            size="lg"
            variant={torchOn ? "default" : "outline"}
            onClick={() => void toggleTorch()}
            className="h-12 px-4"
            title="Ligar / Desligar Lanterna"
          >
            {torchOn ? (
              <>
                <FlashlightOff className="h-5 w-5" /> Lanterna ON
              </>
            ) : (
              <>
                <Flashlight className="h-5 w-5" /> Lanterna
              </>
            )}
          </Button>
        )}

        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => setSoundEnabled((s) => !s)}
          className="h-12 px-3.5"
          title="Ativar / Desativar som de bip ao ler código"
        >
          {soundEnabled ? (
            <>
              <Volume2 className="h-5 w-5 text-entrada" />{" "}
              <span className="text-xs font-semibold">Bip Ativo</span>
            </>
          ) : (
            <>
              <VolumeX className="h-5 w-5 text-muted-foreground" />{" "}
              <span className="text-xs">Sem Som</span>
            </>
          )}
        </Button>

        {scanning && devices.length > 1 && (
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => {
              const idx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
              const nextDev = devices[(idx + 1) % devices.length];
              if (nextDev) {
                setSelectedDeviceId(nextDev.deviceId);
                void startCamera(nextDev.deviceId);
              }
            }}
            className="h-12 px-3.5"
            title="Alternar lente da câmera"
          >
            <RefreshCw className="h-4 w-4" /> Trocar Lente
          </Button>
        )}
      </div>

      {/* Mensagem explicativa caso a câmera não esteja disponível ou sem permissão */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning bg-warning-soft p-3.5 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="space-y-1">
            <div className="font-semibold text-foreground">Câmera indisponível no momento</div>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Área de visualização da câmera com guia de enquadramento */}
      <div
        className={`relative overflow-hidden rounded-2xl border-2 bg-black transition-all ${
          scanning
            ? lastScannedFlash
              ? "border-entrada ring-4 ring-entrada/40"
              : "border-primary"
            : "border-dashed border-muted-foreground/30"
        } ${compact ? "h-56" : "h-64 sm:h-72"}`}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          className={`h-full w-full object-cover ${scanning ? "block" : "hidden"}`}
        />

        {!scanning && (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-white/80">
            <Camera className="mb-2 h-10 w-10 opacity-60" />
            <p className="text-sm font-semibold">
              Toque em &ldquo;INICIAR LEITURA&rdquo; para ativar a câmera traseira do celular
            </p>
            <p className="mt-1 max-w-md text-xs text-white/60">
              Compatível com EAN-13, EAN-8, UPC-A, UPC-E e CODE-128 nas embalagens dos alimentos.
            </p>
          </div>
        )}

        {scanning && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {/* Moldura de enquadramento do código de barras */}
            <div className="relative h-36 w-4/5 max-w-xs rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-xl border-l-4 border-t-4 border-entrada" />
              <div className="absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-xl border-r-4 border-t-4 border-entrada" />
              <div className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-xl border-b-4 border-l-4 border-entrada" />
              <div className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-xl border-b-4 border-r-4 border-entrada" />
              {/* Linha guia central */}
              <div className="absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/90 shadow-[0_0_8px_#ef4444]" />
            </div>
            <span className="mt-3 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
              {lastScannedFlash
                ? `✓ Código lido: ${lastScannedFlash}`
                : "Aponte a câmera para o código de barras da embalagem"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
