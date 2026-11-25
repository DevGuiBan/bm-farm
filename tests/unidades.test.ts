import { describe, expect, it } from "vitest";
import { validCnpj } from "@/lib/cnpj";
import { hours, period } from "@/lib/format";
import { metaCode, renderSite } from "@/lib/site-template";

describe("cnpj", () => {
  it("valida dígitos, inclusive no formato alfanumérico", () => {
    expect(validCnpj("11.222.333/0001-81")).toBe(true);
    expect(validCnpj("11.222.333/0001-82")).toBe(false);
    expect(validCnpj("00000000000000")).toBe(false);
    expect(validCnpj("12.ABC.345/01DE-35")).toBe(true);
  });
});

describe("site", () => {
  it("escapa o conteúdo e extrai só o código da meta-tag", () => {
    const html = renderSite({ legal_name: "A & B", trade_name: null, cnpj: "11222333000181", domain: "ab.com.br", public_phone: "11" },
      { headline: "<script>alert(1)</script>", services: ["<img onerror=x>"], metaTag: '<meta name="x" content="abc123xyz"><script>' });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain('content="abc123xyz"');
    expect(metaCode('"><script>')).toBeNull();
  });
});

describe("formatos", () => {
  it("período e horas", () => {
    expect(period({ de: "2026-01-01", ate: "2026-01-31" })).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    expect(period({ ate: "2026-01-30" })).toEqual({ from: "2026-01-01", to: "2026-01-30" });
    expect(period({ de: "lixo", ate: "2026-01-30" }).from).toBe("2026-01-01");
    expect(hours(0.5)).toBe("30 min");
    expect(hours(72)).toBe("3 dias");
  });
});
