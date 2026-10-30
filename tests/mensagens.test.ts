import { describe, expect, it } from "vitest";
import { marcaPadrao, regrasPadrao, templatesPadrao } from "@/db/seed-dados";
import { TIPOS_TEMPLATE } from "@/lib/config";
import { formatarDiaMesHora } from "@/lib/datas";
import { intervaloDoLembrete, type Status } from "@/lib/regras";
import {
  CHAVE_TEMPLATE,
  enviadaEm,
  lerJanelaAnterior,
  montarVariaveis,
  renderizar,
  ROTULO_TIPO,
  TIPOS_MENSAGEM,
  tipoPermitido,
  tiposDisponiveis,
  type TipoMensagem,
} from "@/lib/templates";

const STATUS: Status[] = [
  "SOLICITADO",
  "CONFIRMADO",
  "RECUSADO",
  "CANCELADO_CLIENTE",
  "CANCELADO_EMPRESA",
  "CONCLUIDO",
  "NAO_COMPARECEU",
];

describe("tipos de mensagem x template", () => {
  it("todo tipo (menos LIVRE) aponta para um template existente e tem rótulo", () => {
    for (const tipo of TIPOS_MENSAGEM) {
      expect(ROTULO_TIPO[tipo]).toBeTruthy();
      if (tipo !== "LIVRE") {
        expect(TIPOS_TEMPLATE).toContain(CHAVE_TEMPLATE[tipo]);
        expect(templatesPadrao[CHAVE_TEMPLATE[tipo]]).toBeTruthy();
      }
    }
  });
});

describe("tipoPermitido (bloqueio no servidor)", () => {
  const esperado: Record<Exclude<TipoMensagem, "LIVRE">, Status[]> = {
    CONFIRMACAO: ["CONFIRMADO"],
    RECUSA: ["RECUSADO"],
    ALINHAMENTO: ["SOLICITADO"],
    LEMBRETE: ["CONFIRMADO"],
    REAGENDAMENTO: ["CONFIRMADO"],
    CANCELAMENTO_EMPRESA: ["CANCELADO_EMPRESA"],
    CANCELAMENTO_CLIENTE_OK: ["CANCELADO_CLIENTE"],
  };

  it("cada tipo só vale nos status compatíveis", () => {
    for (const [tipo, status] of Object.entries(esperado)) {
      const permitidos = STATUS.filter((s) => tipoPermitido(tipo as TipoMensagem, s));
      expect(permitidos, tipo).toEqual(status);
    }
  });

  it("LIVRE vale em qualquer status", () => {
    expect(STATUS.every((s) => tipoPermitido("LIVRE", s))).toBe(true);
  });
});

describe("tiposDisponiveis no detalhe", () => {
  it("oferece Alinhar só em SOLICITADO que requer alinhamento", () => {
    expect(tiposDisponiveis("SOLICITADO", true, false)).toEqual(["ALINHAMENTO", "LIVRE"]);
    expect(tiposDisponiveis("SOLICITADO", false, false)).toEqual(["LIVRE"]);
  });

  it("CONFIRMADO: confirmação, lembrete e, se reagendado, reagendamento", () => {
    expect(tiposDisponiveis("CONFIRMADO", false, false)).toEqual(["CONFIRMACAO", "LEMBRETE", "LIVRE"]);
    expect(tiposDisponiveis("CONFIRMADO", false, true)).toEqual(["CONFIRMACAO", "REAGENDAMENTO", "LEMBRETE", "LIVRE"]);
  });

  it("recusa e cancelamentos", () => {
    expect(tiposDisponiveis("RECUSADO", false, false)).toEqual(["RECUSA", "LIVRE"]);
    expect(tiposDisponiveis("CANCELADO_EMPRESA", false, false)).toEqual(["CANCELAMENTO_EMPRESA", "LIVRE"]);
    expect(tiposDisponiveis("CANCELADO_CLIENTE", false, false)).toEqual(["CANCELAMENTO_CLIENTE_OK", "LIVRE"]);
    expect(tiposDisponiveis("CONCLUIDO", false, false)).toEqual(["LIVRE"]);
  });

  it("todo tipo oferecido é permitido para o status", () => {
    for (const s of STATUS) {
      for (const t of tiposDisponiveis(s, true, true)) expect(tipoPermitido(t, s), `${t} em ${s}`).toBe(true);
    }
  });
});

describe("enviadaEm (RN-12: só vale depois do último evento correspondente)", () => {
  const d = (hora: string) => new Date(`2026-03-10T${hora}:00Z`);

  it("sem mensagem: null", () => {
    expect(enviadaEm("CONFIRMACAO", [], [{ acao: "CONFIRMADO", criadoEm: d("10:00") }])).toBeNull();
  });

  it("mensagem posterior ao evento conta; devolve a mais recente", () => {
    const r = enviadaEm(
      "CONFIRMACAO",
      [
        { tipo: "CONFIRMACAO", enviadoEm: d("11:00") },
        { tipo: "CONFIRMACAO", enviadoEm: d("12:00") },
      ],
      [{ acao: "CONFIRMADO", criadoEm: d("10:00") }],
    );
    expect(r?.toISOString()).toBe(d("12:00").toISOString());
  });

  it("um novo reagendamento zera o REAGENDAMENTO e o LEMBRETE, mas não a CONFIRMACAO", () => {
    const mensagens = [
      { tipo: "CONFIRMACAO", enviadoEm: d("10:30") },
      { tipo: "REAGENDAMENTO", enviadoEm: d("11:30") },
      { tipo: "LEMBRETE", enviadoEm: d("11:45") },
    ];
    const eventos = [
      { acao: "CONFIRMADO", criadoEm: d("10:00") },
      { acao: "REAGENDADO", criadoEm: d("11:00") },
      { acao: "REAGENDADO", criadoEm: d("13:00") }, // segundo reagendamento
    ];
    expect(enviadaEm("REAGENDAMENTO", mensagens, eventos)).toBeNull();
    expect(enviadaEm("LEMBRETE", mensagens, eventos)).toBeNull();
    expect(enviadaEm("CONFIRMACAO", mensagens, eventos)).not.toBeNull();
    // antes do segundo reagendamento, o primeiro envio valia
    expect(enviadaEm("REAGENDAMENTO", mensagens, eventos.slice(0, 2))).not.toBeNull();
  });

  it("ALINHAMENTO e LIVRE não são zerados por eventos", () => {
    const eventos = [{ acao: "REAGENDADO", criadoEm: d("13:00") }];
    expect(enviadaEm("ALINHAMENTO", [{ tipo: "ALINHAMENTO", enviadoEm: d("09:00") }], eventos)).not.toBeNull();
    expect(enviadaEm("LIVRE", [{ tipo: "LIVRE", enviadoEm: d("09:00") }], eventos)).not.toBeNull();
  });

  it("ignora mensagens de outros tipos", () => {
    expect(enviadaEm("RECUSA", [{ tipo: "CONFIRMACAO", enviadoEm: d("12:00") }], [])).toBeNull();
  });
});

describe("lerJanelaAnterior", () => {
  it("lê o `de` do histórico REAGENDADO", () => {
    expect(lerJanelaAnterior({ de: { data: "2026-03-18", janela: "14:00–15:00" }, para: {} })).toEqual({
      data: "2026-03-18",
      horaInicio: "14:00",
      horaFim: "15:00",
    });
  });

  it("devolve undefined para formatos inesperados", () => {
    expect(lerJanelaAnterior(null)).toBeUndefined();
    expect(lerJanelaAnterior({ de: { data: "2026-03-18" } })).toBeUndefined();
    expect(lerJanelaAnterior({ de: { data: "2026-03-18", janela: "sem-separador" } })).toBeUndefined();
  });
});

describe("templates padrão renderizam sem sobras para cada tipo", () => {
  const variaveis = montarVariaveis({
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
    materiaisNomes: ["Escoras"],
    anterior: lerJanelaAnterior({ de: { data: "2026-03-18", janela: "14:00–15:00" } }),
    marca: marcaPadrao,
    regras: regrasPadrao,
    appUrl: "https://app.exemplo.com",
  });

  it.each(TIPOS_MENSAGEM.filter((t) => t !== "LIVRE"))("%s", (tipo) => {
    const texto = renderizar(templatesPadrao[CHAVE_TEMPLATE[tipo as Exclude<TipoMensagem, "LIVRE">]], variaveis);
    expect(texto).not.toMatch(/\{\w+\}/);
    expect(texto).toContain("Carlos");
  });

  it("sem reagendamento anterior, o template de reagendamento deixa o campo visível", () => {
    const { data_anterior: _a, janela_anterior: _j, ...semAnterior } = variaveis;
    void _a;
    void _j;
    expect(renderizar(templatesPadrao.reagendamento, semAnterior)).toContain("{data_anterior}");
  });
});

describe("RN-13 ampliada: intervalo dos lembretes", () => {
  const seg_sex = new Set([1, 2, 3, 4, 5]);
  const regras = { ...regrasPadrao, dias_lembrete: 1 };

  it("quinta lembra a sexta", () => {
    expect(intervaloDoLembrete("2026-03-05", regras, seg_sex)).toEqual({ de: "2026-03-06", ate: "2026-03-06" });
  });

  it("sexta lembra a segunda (sábado e domingo não têm janela)", () => {
    expect(intervaloDoLembrete("2026-03-06", regras, seg_sex)).toEqual({ de: "2026-03-07", ate: "2026-03-09" });
  });

  it("sábado e domingo também apontam para a segunda", () => {
    expect(intervaloDoLembrete("2026-03-07", regras, seg_sex)).toEqual({ de: "2026-03-08", ate: "2026-03-09" });
    expect(intervaloDoLembrete("2026-03-08", regras, seg_sex)).toEqual({ de: "2026-03-09", ate: "2026-03-09" });
  });

  it("usa dias_lembrete configurável", () => {
    expect(intervaloDoLembrete("2026-03-05", { ...regras, dias_lembrete: 2 }, seg_sex)).toEqual({
      de: "2026-03-07",
      ate: "2026-03-09",
    });
  });

  it("sem nenhuma janela ativa, não estende o intervalo", () => {
    expect(intervaloDoLembrete("2026-03-06", regras, new Set())).toEqual({ de: "2026-03-07", ate: "2026-03-07" });
  });

  it("a virada de dia de São Paulo define o 'hoje'", async () => {
    const { hojeSP } = await import("@/lib/datas");
    // 02:30 UTC de sábado 07/03 ainda é sexta 06/03 em SP
    const hoje = hojeSP(new Date("2026-03-07T02:30:00Z"));
    expect(hoje).toBe("2026-03-06");
    expect(intervaloDoLembrete(hoje, regras, seg_sex).ate).toBe("2026-03-09");
  });
});

describe("formatarDiaMesHora (RN-12: 'Enviada em DD/MM HH:MM')", () => {
  it("formata no fuso de São Paulo", () => {
    expect(formatarDiaMesHora(new Date("2026-03-11T02:30:00Z"))).toBe("10/03 23:30");
  });
});
