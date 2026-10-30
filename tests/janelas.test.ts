import { describe, expect, it } from "vitest";
import {
  descreverJanela,
  encontrarSobreposicao,
  normalizarHora,
  NOMES_DIA,
  ORDEM_DIAS,
  paraMinutos,
  planejarCopia,
} from "@/lib/janelas";

const j = (horaInicio: string, horaFim: string, capacidade = 2) => ({ horaInicio, horaFim, capacidade });

describe("horários", () => {
  it("normaliza e converte para minutos", () => {
    expect(normalizarHora("08:00:00")).toBe("08:00");
    expect(paraMinutos("08:30")).toBe(510);
    expect(paraMinutos("13:00:00")).toBe(780);
    expect(descreverJanela(j("08:00:00", "09:00:00"))).toBe("08:00–09:00");
  });

  it("segunda a domingo, com 0 = domingo", () => {
    expect(ORDEM_DIAS).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(NOMES_DIA[0]).toBe("Domingo");
    expect(NOMES_DIA[1]).toBe("Segunda-feira");
  });
});

describe("encontrarSobreposicao", () => {
  it("janelas encostadas não se sobrepõem", () => {
    expect(encontrarSobreposicao([j("08:00", "09:00"), j("09:00", "10:00"), j("13:00", "14:00")])).toBeNull();
  });

  it("detecta sobreposição parcial, total e dentro de outra", () => {
    expect(encontrarSobreposicao([j("08:00", "10:00"), j("09:00", "11:00")])).not.toBeNull();
    expect(encontrarSobreposicao([j("08:00", "09:00"), j("08:00", "09:00")])).not.toBeNull();
    expect(encontrarSobreposicao([j("08:00", "12:00"), j("09:00", "10:00")])).not.toBeNull();
  });

  it("não depende da ordem da lista e devolve o par em conflito", () => {
    const par = encontrarSobreposicao([j("13:00", "14:00"), j("09:30", "10:30"), j("08:00", "09:45")]);
    expect(par?.map((x) => x.horaInicio)).toEqual(["08:00", "09:30"]);
  });

  it("lista vazia ou com um item não tem conflito", () => {
    expect(encontrarSobreposicao([])).toBeNull();
    expect(encontrarSobreposicao([j("08:00", "09:00")])).toBeNull();
  });

  it("aceita horários com segundos (vindos do banco)", () => {
    expect(encontrarSobreposicao([j("08:00:00", "09:00:00"), j("08:30:00", "09:30:00")])).not.toBeNull();
  });
});

describe("planejarCopia (copiar para outros dias)", () => {
  const existente = (id: number, ini: string, fim: string, capacidade = 2, ativo = true) => ({ id, ...j(ini, fim, capacidade), ativo });

  it("dia de destino vazio: cria tudo", () => {
    const plano = planejarCopia([j("08:00", "09:00", 3), j("09:00", "10:00")], []);
    expect(plano.criar).toEqual([
      { horaInicio: "08:00", horaFim: "09:00", capacidade: 3, ativo: true },
      { horaInicio: "09:00", horaFim: "10:00", capacidade: 2, ativo: true },
    ]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.descartar).toEqual([]);
  });

  it("casa por início e fim: atualiza a capacidade em vez de recriar", () => {
    const plano = planejarCopia([j("08:00", "09:00", 5)], [existente(10, "08:00:00", "09:00:00", 1)]);
    expect(plano.atualizar).toEqual([{ id: 10, capacidade: 5 }]);
    expect(plano.criar).toEqual([]);
    expect(plano.descartar).toEqual([]);
  });

  it("o que sobra no destino é marcado para descarte", () => {
    const plano = planejarCopia([j("08:00", "09:00")], [existente(1, "08:00", "09:00"), existente(2, "10:00", "11:00"), existente(3, "14:00", "15:00", 2, false)]);
    expect(plano.atualizar.map((a) => a.id)).toEqual([1]);
    expect(plano.descartar).toEqual([2, 3]);
  });

  it("mistura: atualiza, cria e descarta", () => {
    const plano = planejarCopia(
      [j("08:00", "09:00"), j("09:00", "10:00")],
      [existente(1, "09:00", "10:00", 9), existente(2, "16:00", "17:00")],
    );
    expect(plano.atualizar).toEqual([{ id: 1, capacidade: 2 }]);
    expect(plano.criar).toEqual([{ horaInicio: "08:00", horaFim: "09:00", capacidade: 2, ativo: true }]);
    expect(plano.descartar).toEqual([2]);
  });

  it("janela duplicada no destino: usa uma e descarta a outra", () => {
    const plano = planejarCopia([j("08:00", "09:00")], [existente(1, "08:00", "09:00"), existente(2, "08:00", "09:00")]);
    expect(plano.atualizar).toEqual([{ id: 1, capacidade: 2 }]);
    expect(plano.descartar).toEqual([2]);
  });

  it("origem vazia descarta tudo do destino", () => {
    expect(planejarCopia([], [existente(1, "08:00", "09:00")]).descartar).toEqual([1]);
  });
});
