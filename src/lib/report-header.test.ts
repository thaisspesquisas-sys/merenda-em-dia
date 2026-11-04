import { describe, expect, it } from "vitest";
import { cropBounds, validateHeaderFile } from "./report-header";

describe("Header import", () => {
  it("accepts Word models", () => expect(() => validateHeaderFile({ name: "cabecalho.docx", size: 200 })).not.toThrow());
  it("accepts Excel models", () => expect(() => validateHeaderFile({ name: "cabecalho.xlsx", size: 200 })).not.toThrow());
  it("keeps crop within original image", () => expect(cropBounds(1200, 2000, 90, 30)).toEqual({ x: 0, y: 1800, width: 1200, height: 200 }));
  it("rejects executable input", () => expect(() => validateHeaderFile({ name: "modelo.exe", size: 200 })).toThrow());
});