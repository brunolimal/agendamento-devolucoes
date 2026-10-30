import { describe, expect, it } from "vitest";
import { marcaPadrao, regrasPadrao, templatesPadrao } from "@/db/seed-dados";
import { configuracaoSchema, marcaSchema, regrasSchema, templatesSchema, TIPOS_TEMPLATE } from "@/lib/config-schemas";
import { DESCRICAO_VARIAVEL, ROTULO_TEMPLATE, VARIAVEIS } from "@/lib/templates";

describe("configuracaoSchema: os JSONs do seed são válidos", () => {
  it("marca, regras e templates padrão passam", () => {
    expect(() => configuracaoSchema.parse({ marca: marcaPadrao, regras: regrasPadrao, templates: templatesPadrao })).not.toThrow();
  });
});

describe("marcaSchema", () => {
  const ok = (extra: object) => marcaSchema.safeParse({ ...marcaPadrao, ...extra });

  it("exige cor #rrggbb", () => {
    expect(ok({ cor_primaria: "#0f766e" }).success).toBe(true);
    expect(ok({ cor_primaria: "verde" }).success).toBe(false);
    expect(ok({ cor_primaria: "#fff" }).success).toBe(false);
  });

  it("WhatsApp só com dígitos e DDI (12 ou 13)", () => {
    expect(ok({ whatsapp_empresa: "5511900000000" }).success).toBe(true);
    expect(ok({ whatsapp_empresa: "551190000000" }).success).toBe(true);
    expect(ok({ whatsapp_empresa: "11900000000" }).success).toBe(false);
    expect(ok({ whatsapp_empresa: "+55 (11) 90000-0000" }).success).toBe(false);
  });

  it("logo e mapa precisam ser http(s); o mapa pode ficar vazio, o logo pode ser nulo", () => {
    expect(ok({ logo_url: null }).success).toBe(true);
    expect(ok({ logo_url: "https://exemplo.com/logo.png" }).success).toBe(true);
    expect(ok({ logo_url: "javascript:alert(1)" }).success).toBe(false);
    expect(ok({ logo_url: "ftp://exemplo.com/logo.png" }).success).toBe(false);
    expect(ok({ logo_url: "nao-e-url" }).success).toBe(false);
    expect(ok({ link_maps: "" }).success).toBe(true);
    expect(ok({ link_maps: "https://maps.google.com/?q=x" }).success).toBe(true);
    expect(ok({ link_maps: "texto solto" }).success).toBe(false);
  });

  it("campos de texto são obrigatórios e têm limite", () => {
    expect(ok({ nome: "   " }).success).toBe(false);
    expect(ok({ nome: "x".repeat(81) }).success).toBe(false);
    expect(ok({ regras_aceite: "" }).success).toBe(false);
    expect(ok({ texto_boas_vindas: "x".repeat(501) }).success).toBe(false);
  });
});

describe("regrasSchema", () => {
  const ok = (extra: object) => regrasSchema.safeParse({ ...regrasPadrao, ...extra });

  it("aceita os padrões e inteiros não negativos", () => {
    expect(ok({}).success).toBe(true);
    expect(ok({ prazo_cancel_dias: 0, dias_lembrete: 0 }).success).toBe(true);
  });

  it("rejeita negativos, decimais e texto", () => {
    expect(ok({ prazo_cancel_dias: -1 }).success).toBe(false);
    expect(ok({ sla_decisao_dias: 1.5 }).success).toBe(false);
    expect(ok({ dias_lembrete: "1" }).success).toBe(false);
    expect(ok({ dias_lembrete: undefined }).success).toBe(false);
  });

  it("a antecedência mínima não pode passar da máxima", () => {
    const r = ok({ antecedencia_min_dias: 30, antecedencia_max_dias: 10 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["antecedencia_min_dias"]);
    expect(ok({ antecedencia_min_dias: 10, antecedencia_max_dias: 10 }).success).toBe(true);
  });

  it("a antecedência máxima tem pelo menos 1 dia", () => {
    expect(ok({ antecedencia_min_dias: 0, antecedencia_max_dias: 0 }).success).toBe(false);
  });
});

describe("templatesSchema", () => {
  const ok = (extra: object) => templatesSchema.safeParse({ ...templatesPadrao, ...extra });

  it("exige os 7 templates e rejeita vazio", () => {
    const { lembrete: _l, ...incompleto } = templatesPadrao;
    void _l;
    expect(templatesSchema.safeParse(incompleto).success).toBe(false);
    expect(ok({ lembrete: "" }).success).toBe(false);
  });

  it("variável desconhecida é erro, apontando o template certo", () => {
    const r = ok({ recusa: "Olá, {nome}! Veja {inexistente}." });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["recusa"]);
      expect(r.error.issues[0].message).toContain("{inexistente}");
    }
  });

  it("aceita qualquer variável da lista oficial", () => {
    const todas = VARIAVEIS.map((v) => `{${v}}`).join(" ");
    expect(ok({ confirmacao: todas }).success).toBe(true);
  });

  it("tem limite de tamanho", () => {
    expect(ok({ confirmacao: "x".repeat(4001) }).success).toBe(false);
  });
});

describe("metadados do editor de mensagens", () => {
  it("toda variável tem descrição e todo template tem rótulo", () => {
    for (const v of VARIAVEIS) expect(DESCRICAO_VARIAVEL[v], v).toBeTruthy();
    for (const t of TIPOS_TEMPLATE) expect(ROTULO_TEMPLATE[t], t).toBeTruthy();
  });
});
