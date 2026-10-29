import { describe, expect, it } from "vitest";
import { marcaPadrao, regrasPadrao, templatesPadrao } from "@/db/seed-dados";
import {
  montarVariaveis,
  renderizar,
  variaveisDesconhecidas,
  variaveisDoTemplate,
  type ContextoMensagem,
} from "@/lib/templates";

const ctx: ContextoMensagem = {
  agendamento: {
    nome: "Carlos",
    empresa: "Construtora Alfa",
    protocolo: "DEV-2603-0007",
    data: "2026-03-20",
    token: "a".repeat(32),
    motivo: "Pátio fechado",
  },
  janela: { horaInicio: "08:00:00", horaFim: "09:00:00" },
  porteNome: "Toco",
  materiaisNomes: ["Escoras", "Formas"],
  materiaisOutros: "Cones",
  anterior: { data: "2026-03-18", horaInicio: "14:00:00", horaFim: "15:00:00" },
  marca: marcaPadrao,
  regras: regrasPadrao,
  appUrl: "https://app.exemplo.com",
};

describe("renderizar (§11)", () => {
  it("substitui variáveis e mantém as não preenchidas", () => {
    expect(renderizar("Olá, {nome}! {desconhecida}", { nome: "Ana" })).toBe("Olá, Ana! {desconhecida}");
    expect(renderizar("{nome} {nome}", { nome: "Ana" })).toBe("Ana Ana");
    expect(renderizar("[{motivo}]", { motivo: "" })).toBe("[]");
  });

  it("lista variáveis do template e detecta desconhecidas", () => {
    expect(variaveisDoTemplate("{a} {b} {a}")).toEqual(["a", "b"]);
    expect(variaveisDesconhecidas("{nome} {foo}")).toEqual(["foo"]);
  });
});

describe("montarVariaveis", () => {
  const v = montarVariaveis(ctx);

  it("formata data, dia da semana e horários em pt-BR", () => {
    expect(v.data).toBe("20/03/2026");
    expect(v.dia_semana).toBe("sexta-feira");
    expect(v.hora_inicio).toBe("08:00");
    expect(v.hora_fim).toBe("09:00");
  });

  it("monta link, limite de cancelamento e materiais", () => {
    expect(v.link).toBe(`https://app.exemplo.com/a/${"a".repeat(32)}`);
    expect(v.limite_cancelamento).toBe("18/03/2026");
    expect(v.materiais).toBe("Escoras, Formas, Cones");
    expect(v.nome_empresa).toBe(marcaPadrao.nome);
  });

  it("monta data e janela anteriores", () => {
    expect(v.data_anterior).toBe("18/03/2026");
    expect(v.janela_anterior).toBe("14:00 às 15:00");
  });
});

describe("templates padrão", () => {
  it("só usam variáveis conhecidas e renderizam sem sobras", () => {
    const v = montarVariaveis(ctx);
    for (const [tipo, tpl] of Object.entries(templatesPadrao)) {
      expect(variaveisDesconhecidas(tpl), tipo).toEqual([]);
      expect(renderizar(tpl, v), tipo).not.toMatch(/\{\w+\}/);
    }
  });

  it("a confirmação traz protocolo, janela e link do cliente", () => {
    const texto = renderizar(templatesPadrao.confirmacao, montarVariaveis(ctx));
    expect(texto).toContain("DEV-2603-0007");
    expect(texto).toContain("sexta-feira, 20/03/2026, das 08:00 às 09:00");
    expect(texto).toContain("até 18/03/2026");
  });
});
