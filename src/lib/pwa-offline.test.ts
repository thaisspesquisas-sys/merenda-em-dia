import { describe, expect, it } from "vitest";
import { detectDeviceEnvironment } from "./pwa-install";
import { buildMovementIdempotencyKey } from "./offline-sync";

describe("PWA — identificação automática de dispositivo e navegador", () => {
  it("identifica celulares Android e navegador Chrome", () => {
    const env = detectDeviceEnvironment(
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    );
    expect(env.platform).toBe("android");
    expect(env.browser).toBe("chrome");
    expect(env.isMobile).toBe(true);
  });

  it("identifica iPhone (iOS) e Safari para exibir instruções de Adicionar à Tela de Início", () => {
    const env = detectDeviceEnvironment(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    );
    expect(env.platform).toBe("ios");
    expect(env.browser).toBe("safari");
    expect(env.isMobile).toBe(true);
  });

  it("identifica computadores Windows 10 e 11 com Microsoft Edge ou Chrome", () => {
    const env = detectDeviceEnvironment(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
    );
    expect(env.platform).toBe("windows");
    expect(env.browser).toBe("edge");
    expect(env.isMobile).toBe(false);
  });
});

describe("Sincronização Offline — chave anti-duplicidade", () => {
  it("gera chaves idempotentes idênticas para o mesmo lançamento evitando duplicação", () => {
    const k1 = buildMovementIdempotencyKey({
      schoolId: "esc-1",
      productId: "prod-1",
      tipo: "entrada",
      data: "2026-11-05",
      quantidade: 25,
      origem: "agricultura",
      nota_fiscal: "NF 123",
    });
    const k2 = buildMovementIdempotencyKey({
      schoolId: "esc-1",
      productId: "prod-1",
      tipo: "entrada",
      data: "2026-11-05",
      quantidade: 25.0,
      origem: "agricultura",
      nota_fiscal: "  nf 123 ",
    });
    const kDiff = buildMovementIdempotencyKey({
      schoolId: "esc-1",
      productId: "prod-1",
      tipo: "entrada",
      data: "2026-11-05",
      quantidade: 30,
      origem: "agricultura",
      nota_fiscal: "NF 123",
    });

    expect(k1).toBe(k2);
    expect(k1).not.toBe(kDiff);
  });
});

