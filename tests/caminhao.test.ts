import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IlustracaoCaminhao } from "@/components/ui/IlustracaoCaminhao";

const PORTES = ["VUC", "TRES_QUARTOS", "TOCO", "TRUCK", "CARRETA", "NAO_SEI"];

function geometria(codigo: string) {
  const svg = renderToStaticMarkup(createElement(IlustracaoCaminhao, { codigo }));
  const larguraTotal = Number(/viewBox="0 0 (\d+) 52"/.exec(svg)?.[1]);
  const rect = /<rect x="(\d+)"[^>]*width="(\d+)"/.exec(svg);
  const cabine = /<path d="M(\d+) 38V16h16l10 12v10z"/.exec(svg);
  const parabrisa = /<path d="M(\d+) 20h9l6 8H\1z"/.exec(svg);
  const rodas = [...svg.matchAll(/<circle cx="(\d+)"/g)].map((m) => Number(m[1]));
  return {
    larguraTotal,
    corpoX: Number(rect?.[1]),
    corpoLargura: Number(rect?.[2]),
    cabineX: Number(cabine?.[1]),
    parabrisaX: Number(parabrisa?.[1]),
    rodas,
  };
}

describe("IlustracaoCaminhao: cabine à direita, voltada para a frente", () => {
  it.each(PORTES)("%s: a cabine fica à direita da carroceria", (codigo) => {
    const g = geometria(codigo);
    expect(Number.isFinite(g.cabineX), "caminho da cabine encontrado").toBe(true);
    expect(g.cabineX).toBeGreaterThanOrEqual(g.corpoX + g.corpoLargura);
  });

  it.each(PORTES)("%s: o para-brisa inclina para a direita e a cabine cabe no desenho", (codigo) => {
    const g = geometria(codigo);
    // o caminho da cabine é 'h16 l10 12': sobe e desce para a DIREITA (frente), nunca para a esquerda
    expect(g.parabrisaX).toBeGreaterThan(g.cabineX);
    expect(g.cabineX + 26).toBeLessThanOrEqual(g.larguraTotal);
  });

  it.each(PORTES)("%s: a roda da frente fica sob a cabine e as demais sob a carroceria", (codigo) => {
    const g = geometria(codigo);
    const [frente, ...traseiras] = g.rodas;
    expect(frente).toBeGreaterThan(g.cabineX);
    expect(frente).toBeLessThan(g.cabineX + 26);
    for (const x of traseiras) {
      expect(x).toBeGreaterThan(g.corpoX);
      expect(x).toBeLessThan(g.corpoX + g.corpoLargura);
    }
  });

  it("portes maiores têm carroceria maior (VUC < Toco < Carreta)", () => {
    const largura = (c: string) => geometria(c).corpoLargura;
    expect(largura("VUC")).toBeLessThan(largura("TOCO"));
    expect(largura("TOCO")).toBeLessThan(largura("CARRETA"));
  });

  it("'Não sei' mostra o ponto de interrogação dentro da carroceria", () => {
    const svg = renderToStaticMarkup(createElement(IlustracaoCaminhao, { codigo: "NAO_SEI" }));
    expect(svg).toContain(">?</text>");
    const g = geometria("NAO_SEI");
    const xTexto = Number(/<text x="([\d.]+)"/.exec(svg)?.[1]);
    expect(xTexto).toBeGreaterThan(g.corpoX);
    expect(xTexto).toBeLessThan(g.corpoX + g.corpoLargura);
  });
});
