import { describe, expect, it } from "vitest";
import {
  formatarData,
  formatarDataHora,
  formatarDiaExtenso,
  hojeSP,
} from "@/lib/datas";

describe("hojeSP", () => {
  it("usa o fuso de São Paulo na virada de dia", () => {
    // 23:30 em SP = 02:30 UTC do dia seguinte
    expect(hojeSP(new Date("2026-03-11T02:30:00Z"))).toBe("2026-03-10");
    expect(hojeSP(new Date("2026-03-11T03:00:00Z"))).toBe("2026-03-11");
  });
});

describe("formatação pt-BR", () => {
  it("formata data", () => {
    expect(formatarData("2026-03-10")).toBe("10/03/2026");
  });

  it("formata data e hora em SP", () => {
    expect(formatarDataHora(new Date("2026-03-11T02:30:00Z"))).toBe("10/03/2026 23:30");
  });

  it("formata dia por extenso", () => {
    expect(formatarDiaExtenso("2026-03-09")).toBe("segunda-feira, 09 de março");
  });
});
