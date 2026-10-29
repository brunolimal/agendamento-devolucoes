import { describe, expect, it } from "vitest";
import {
  formatarData,
  formatarDataHora,
  diaSemana,
  formatarDiaExtenso,
  hojeSP,
  instanteSP,
  somarDias,
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

describe("aritmética de datas", () => {
  it("soma dias atravessando o mês", () => {
    expect(somarDias("2026-03-30", 3)).toBe("2026-04-02");
    expect(somarDias("2026-03-02", -3)).toBe("2026-02-27");
  });

  it("devolve o dia da semana (0 = domingo)", () => {
    expect(diaSemana("2026-03-08")).toBe(0);
    expect(diaSemana("2026-03-09")).toBe(1);
  });

  it("converte data e hora de SP para instante UTC", () => {
    expect(instanteSP("2026-03-10", "23:30").toISOString()).toBe("2026-03-11T02:30:00.000Z");
  });
});
