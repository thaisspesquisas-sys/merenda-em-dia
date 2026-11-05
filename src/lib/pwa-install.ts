export type DevicePlatform = "android" | "ios" | "windows" | "macos" | "linux" | "other";
export type BrowserType = "chrome" | "edge" | "safari" | "firefox" | "samsung" | "other";

export interface DeviceEnvironment {
  platform: DevicePlatform;
  platformLabel: string;
  browser: BrowserType;
  browserLabel: string;
  isMobile: boolean;
  isStandalone: boolean;
  isSecure: boolean;
  canPromptNatively: boolean;
}

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

let deferredPromptEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const fn of listeners) fn();
}

export function initPwaListeners() {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPromptEvent = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener("appinstalled", () => {
    deferredPromptEvent = null;
    notifyListeners();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {
          // Non-blocking in dev environments
        });
    });
  }
}

export function subscribePwaInstallState(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function hasNativeInstallPrompt(): boolean {
  return deferredPromptEvent !== null;
}

export async function triggerNativeInstallPrompt(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  if (!deferredPromptEvent) return "unavailable";
  try {
    await deferredPromptEvent.prompt();
    const choice = await deferredPromptEvent.userChoice;
    if (choice.outcome === "accepted") {
      deferredPromptEvent = null;
      notifyListeners();
      return "accepted";
    }
    return "dismissed";
  } catch {
    return "unavailable";
  }
}

export function detectDeviceEnvironment(userAgentOverride?: string): DeviceEnvironment {
  const ua = userAgentOverride ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const lower = ua.toLowerCase();

  let platform: DevicePlatform = "other";
  let platformLabel = "Dispositivo";

  // Detect iOS (including iPadOS desktop-class Safari)
  const isIPadOS =
    typeof navigator !== "undefined" &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1 &&
    !userAgentOverride;

  if (/iphone|ipad|ipod/.test(lower) || isIPadOS) {
    platform = "ios";
    platformLabel = /ipad/.test(lower) || isIPadOS ? "iPad (iOS)" : "iPhone (iOS)";
  } else if (/android/.test(lower)) {
    platform = "android";
    platformLabel = "Celular / Tablet Android";
  } else if (/windows nt 10\.0|windows nt 11\.0|win64|win32|windows/.test(lower)) {
    platform = "windows";
    platformLabel = "Computador Windows 10 / 11";
  } else if (/macintosh|mac os x/.test(lower)) {
    platform = "macos";
    platformLabel = "Computador Mac";
  } else if (/linux/.test(lower)) {
    platform = "linux";
    platformLabel = "Computador Linux";
  }

  let browser: BrowserType = "other";
  let browserLabel = "Navegador";
  if (/edg\/|edga\/|edgios\//.test(lower)) {
    browser = "edge";
    browserLabel = "Microsoft Edge";
  } else if (/samsungbrowser/.test(lower)) {
    browser = "samsung";
    browserLabel = "Samsung Internet";
  } else if (/chrome\/|crios\//.test(lower) && !/edg\//.test(lower)) {
    browser = "chrome";
    browserLabel = "Google Chrome";
  } else if (/firefox\/|fxios\//.test(lower)) {
    browser = "firefox";
    browserLabel = "Mozilla Firefox";
  } else if (/safari\//.test(lower) && !/chrome\/|crios\//.test(lower)) {
    browser = "safari";
    browserLabel = "Safari";
  }

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.matchMedia?.("(display-mode: window-controls-overlay)")?.matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  const isSecure =
    typeof window !== "undefined"
      ? window.isSecureContext ||
        window.location.protocol === "https:" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
      : true;

  return {
    platform,
    platformLabel,
    browser,
    browserLabel,
    isMobile: platform === "android" || platform === "ios",
    isStandalone: Boolean(isStandalone),
    isSecure,
    canPromptNatively: deferredPromptEvent !== null,
  };
}
