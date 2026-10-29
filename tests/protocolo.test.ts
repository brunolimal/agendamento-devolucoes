import { describe, expect, it } from "vitest";
import { formatarProtocolo, gerarToken, prefixoProtocolo, protocoloValido, tokenValido } from "@/lib/protocolo";

describe("RN-16: protocolo e token", () => {
  it("formata DEV-AAMM-NNNN com zeros à esquerda", () => {
    expect(prefixoProtocolo("2026-03-09")).toBe("DEV-2603-");
    expect(formatarProtocolo("2026-03-09", 7)).toBe("DEV-2603-0007");
    expect(formatarProtocolo("2026-12-31", 1234)).toBe("DEV-2612-1234");
    expect(formatarProtocolo("2026-12-31", 12345)).toBe("DEV-2612-12345");
  });

  it("valida o formato do protocolo", () => {
    expect(protocoloValido("DEV-2603-0007")).toBe(true);
    expect(protocoloValido("DEV-2603-7")).toBe(false);
    expect(protocoloValido("XXX-2603-0007")).toBe(false);
    expect(protocoloValido("DEV-2603-0007'; drop")).toBe(false);
  });

  it("gera token único de 32 caracteres URL-safe", () => {
    const tokens = new Set(Array.from({ length: 200 }, gerarToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) {
      expect(t).toHaveLength(32);
      expect(tokenValido(t)).toBe(true);
    }
    expect(tokenValido("curto")).toBe(false);
    expect(tokenValido(`${"a".repeat(31)}!`)).toBe(false);
  });
});
