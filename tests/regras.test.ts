import { describe, expect, it } from "vitest";
import { hojeSP } from "@/lib/datas";
import {
  classificarPrazo,
  dataDoLembrete,
  dentroDaAntecedencia,
  limiteCancelamento,
  ocupaVaga,
  podeClienteCancelar,
  podeConfirmar,
  podeEditar,
  podeFinalizar,
  podeReagendar,
  podeTransitar,
  prazoDecisao,
  requerAlinhamento,
  statusInicial,
  TRANSICOES,
  type Status,
} from "@/lib/regras";

const regras = {
  antecedencia_min_dias: 7,
  antecedencia_max_dias: 60,
  prazo_cancel_dias: 2,
  sla_decisao_dias: 3,
  dias_lembrete: 1,
};

const TODOS: Status[] = [
  "SOLICITADO",
  "CONFIRMADO",
  "RECUSADO",
  "CANCELADO_CLIENTE",
  "CANCELADO_EMPRESA",
  "CONCLUIDO",
  "NAO_COMPARECEU",
];

describe("§5: máquina de estados", () => {
  it("permite exatamente as transições da SPEC", () => {
    const permitidas: [Status, Status][] = [
      ["SOLICITADO", "CONFIRMADO"],
      ["SOLICITADO", "RECUSADO"],
      ["SOLICITADO", "CANCELADO_CLIENTE"],
      ["SOLICITADO", "CANCELADO_EMPRESA"],
      ["CONFIRMADO", "CANCELADO_CLIENTE"],
      ["CONFIRMADO", "CANCELADO_EMPRESA"],
      ["CONFIRMADO", "CONCLUIDO"],
      ["CONFIRMADO", "NAO_COMPARECEU"],
    ];
    for (const de of TODOS) {
      for (const para of TODOS) {
        const esperado = permitidas.some(([a, b]) => a === de && b === para);
        expect(podeTransitar(de, para), `${de} -> ${para}`).toBe(esperado);
      }
    }
  });

  it("status finais não têm saída", () => {
    for (const s of ["RECUSADO", "CANCELADO_CLIENTE", "CANCELADO_EMPRESA", "CONCLUIDO", "NAO_COMPARECEU"] as const) {
      expect(TRANSICOES[s]).toEqual([]);
    }
  });

  it("só SOLICITADO e CONFIRMADO ocupam vaga", () => {
    expect(TODOS.filter(ocupaVaga)).toEqual(["SOLICITADO", "CONFIRMADO"]);
  });

  it("reagendar só em CONFIRMADO; editar só enquanto ocupa vaga", () => {
    expect(TODOS.filter(podeReagendar)).toEqual(["CONFIRMADO"]);
    expect(TODOS.filter(podeEditar)).toEqual(["SOLICITADO", "CONFIRMADO"]);
  });
});

describe("requer_alinhamento", () => {
  it("liga com porte ou volume NAO_SEI e desliga quando os dois são definidos", () => {
    expect(requerAlinhamento("NAO_SEI", "MEDIO")).toBe(true);
    expect(requerAlinhamento("TOCO", "NAO_SEI")).toBe(true);
    expect(requerAlinhamento("NAO_SEI", "NAO_SEI")).toBe(true);
    expect(requerAlinhamento("TOCO", "MEDIO")).toBe(false);
  });
});

describe("RN-06: prazo de decisão", () => {
  // agendamento em 20/03, sla 3 => prazo 17/03
  it("calcula o prazo", () => {
    expect(prazoDecisao("2026-03-20", regras)).toBe("2026-03-17");
  });

  it("classifica no prazo, vence em breve e vencido", () => {
    expect(classificarPrazo("2026-03-20", "2026-03-15", regras)).toBe("NO_PRAZO");
    expect(classificarPrazo("2026-03-20", "2026-03-16", regras)).toBe("VENCE_EM_BREVE");
    expect(classificarPrazo("2026-03-20", "2026-03-17", regras)).toBe("VENCE_EM_BREVE");
    expect(classificarPrazo("2026-03-20", "2026-03-18", regras)).toBe("VENCIDO");
  });

  it("usa a virada de dia de São Paulo", () => {
    // 02:00 UTC de 18/03 ainda é 17/03 em SP: prazo vence hoje, não está vencido
    const hoje = hojeSP(new Date("2026-03-18T02:00:00Z"));
    expect(classificarPrazo("2026-03-20", hoje, regras)).toBe("VENCE_EM_BREVE");
    const depois = hojeSP(new Date("2026-03-18T03:00:00Z"));
    expect(classificarPrazo("2026-03-20", depois, regras)).toBe("VENCIDO");
  });
});

describe("RN-07: confirmar", () => {
  it("exige porte e volume definidos", () => {
    expect(podeConfirmar({ porteCodigo: "TOCO", volume: "MEDIO" })).toBe(true);
    expect(podeConfirmar({ porteCodigo: "NAO_SEI", volume: "MEDIO" })).toBe(false);
    expect(podeConfirmar({ porteCodigo: "TOCO", volume: "NAO_SEI" })).toBe(false);
  });
});

describe("RN-08: cancelamento pelo cliente", () => {
  // agendamento em 20/03, prazo 2 => limite 18/03
  it("calcula o limite", () => {
    expect(limiteCancelamento("2026-03-20", regras)).toBe("2026-03-18");
  });

  it("permite até o limite inclusive, em SOLICITADO ou CONFIRMADO", () => {
    expect(podeClienteCancelar("SOLICITADO", "2026-03-20", "2026-03-18", regras)).toBe(true);
    expect(podeClienteCancelar("CONFIRMADO", "2026-03-20", "2026-03-18", regras)).toBe(true);
    expect(podeClienteCancelar("CONFIRMADO", "2026-03-20", "2026-03-19", regras)).toBe(false);
  });

  it("não permite em status finais", () => {
    expect(podeClienteCancelar("CONCLUIDO", "2026-03-20", "2026-03-10", regras)).toBe(false);
    expect(podeClienteCancelar("CANCELADO_EMPRESA", "2026-03-20", "2026-03-10", regras)).toBe(false);
  });
});

describe("RN-01 e RN-10: antecedência", () => {
  it("valida a faixa hoje+min a hoje+max", () => {
    expect(dentroDaAntecedencia("2026-03-16", "2026-03-09", regras)).toBe(true);
    expect(dentroDaAntecedencia("2026-03-15", "2026-03-09", regras)).toBe(false);
    expect(dentroDaAntecedencia("2026-05-08", "2026-03-09", regras)).toBe(true);
    expect(dentroDaAntecedencia("2026-05-09", "2026-03-09", regras)).toBe(false);
  });
});

describe("RN-05 e RN-10: status inicial", () => {
  it("cliente nasce SOLICITADO; painel nasce CONFIRMADO por padrão", () => {
    expect(statusInicial("CLIENTE")).toBe("SOLICITADO");
    expect(statusInicial("PAINEL")).toBe("CONFIRMADO");
    expect(statusInicial("PAINEL", false)).toBe("SOLICITADO");
  });
});

describe("RN-18: concluir e não compareceu", () => {
  it("só a partir da data e só para CONFIRMADO", () => {
    expect(podeFinalizar("CONFIRMADO", "2026-03-20", "2026-03-19")).toBe(false);
    expect(podeFinalizar("CONFIRMADO", "2026-03-20", "2026-03-20")).toBe(true);
    expect(podeFinalizar("CONFIRMADO", "2026-03-20", "2026-03-21")).toBe(true);
    expect(podeFinalizar("SOLICITADO", "2026-03-20", "2026-03-21")).toBe(false);
  });
});

describe("RN-13: lembrete", () => {
  it("data-alvo = hoje + dias_lembrete", () => {
    expect(dataDoLembrete("2026-03-09", regras)).toBe("2026-03-10");
    expect(dataDoLembrete("2026-03-09", { ...regras, dias_lembrete: 2 })).toBe("2026-03-11");
  });
});
