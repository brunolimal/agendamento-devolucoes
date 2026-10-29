import { describe, expect, it } from "vitest";
import { marcaPadrao, regrasPadrao, templatesPadrao } from "@/db/seed-dados";
import { marcaSchema, regrasSchema, templatesSchema } from "@/lib/config";
import { envioPublicoSchema, errosPorCampo, novoAgendamentoSchema } from "@/lib/validacao";

const valido = {
  data: "2026-03-16",
  janelaId: 1,
  nome: "  Carlos Silva ",
  empresa: "Construtora Alfa",
  whatsapp: "(11) 98888-7777",
  contrato: "CT-1",
  materiais: ["ESCORAS"],
  materiaisOutros: "",
  volume: "MEDIO",
  porteCodigo: "TOCO",
};

describe("zod: novo agendamento", () => {
  it("normaliza telefone, apara textos e converte vazios em null", () => {
    const r = novoAgendamentoSchema.parse(valido);
    expect(r.nome).toBe("Carlos Silva");
    expect(r.whatsapp).toBe("5511988887777");
    expect(r.materiaisOutros).toBeNull();
    expect(r.placa).toBeNull();
  });

  it("rejeita telefone, data e materiais inválidos", () => {
    const r = novoAgendamentoSchema.safeParse({ ...valido, whatsapp: "123", data: "16/03/2026", materiais: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(errosPorCampo(r.error)).sort()).toEqual(["data", "materiais", "whatsapp"]);
  });

  it("rejeita volume desconhecido", () => {
    expect(novoAgendamentoSchema.safeParse({ ...valido, volume: "ENORME" }).success).toBe(false);
  });

  it("o envio público exige aceite e o instante de abertura", () => {
    expect(envioPublicoSchema.safeParse({ ...valido, inicio: "x" }).success).toBe(false);
    expect(envioPublicoSchema.safeParse({ ...valido, inicio: "x", aceite: true }).success).toBe(true);
  });
});

describe("zod: configuração (§7)", () => {
  it("o seed padrão é válido", () => {
    expect(() => marcaSchema.parse(marcaPadrao)).not.toThrow();
    expect(() => regrasSchema.parse(regrasPadrao)).not.toThrow();
    expect(() => templatesSchema.parse(templatesPadrao)).not.toThrow();
  });

  it("rejeita cor inválida e regra negativa", () => {
    expect(marcaSchema.safeParse({ ...marcaPadrao, cor_primaria: "verde" }).success).toBe(false);
    expect(regrasSchema.safeParse({ ...regrasPadrao, prazo_cancel_dias: -1 }).success).toBe(false);
  });
});
