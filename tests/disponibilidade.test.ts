import { describe, expect, it } from "vitest";
import {
  calcularDisponibilidade,
  capacidadeEfetiva,
  intervaloCliente,
  type EntradaDisponibilidade,
} from "@/lib/disponibilidade";

const regras = {
  antecedencia_min_dias: 7,
  antecedencia_max_dias: 60,
  prazo_cancel_dias: 2,
  sla_decisao_dias: 3,
  dias_lembrete: 1,
};

// 2026-03-09 é segunda-feira. Faixa do cliente: 2026-03-16 (seg) a 2026-05-08 (sex).
const HOJE = "2026-03-09";
const janelas = [
  { id: 1, diaSemana: 1, horaInicio: "08:00:00", horaFim: "09:00:00", capacidade: 2 },
  { id: 2, diaSemana: 1, horaInicio: "09:00:00", horaFim: "10:00:00", capacidade: 2 },
  { id: 3, diaSemana: 5, horaInicio: "08:00:00", horaFim: "09:00:00", capacidade: 2 },
];

function base(extra: Partial<EntradaDisponibilidade> = {}): EntradaDisponibilidade {
  return {
    de: "2026-03-09",
    ate: "2026-05-15",
    hoje: HOJE,
    regras,
    peso: 1,
    janelas,
    excecoes: [],
    bloqueios: [],
    ocupacao: [],
    ...extra,
  };
}

const dia = (r: ReturnType<typeof calcularDisponibilidade>, data: string) => r.find((d) => d.data === data)!;

describe("RN-01: datas disponíveis ao cliente", () => {
  it("calcula a faixa hoje+min até hoje+max", () => {
    expect(intervaloCliente(HOJE, regras)).toEqual({ min: "2026-03-16", max: "2026-05-08" });
  });

  it("libera os extremos da faixa e bloqueia fora dela", () => {
    const r = calcularDisponibilidade(base());
    expect(dia(r, "2026-03-09").disponivel).toBe(false); // hoje
    expect(dia(r, "2026-03-13").disponivel).toBe(false); // sexta, antes do mínimo
    expect(dia(r, "2026-03-16").disponivel).toBe(true); // hoje + 7
    expect(dia(r, "2026-05-08").disponivel).toBe(true); // hoje + 60
    expect(dia(r, "2026-05-15").disponivel).toBe(false); // depois do máximo
  });

  it("dia sem janela ativa não é disponível", () => {
    const r = calcularDisponibilidade(base());
    expect(dia(r, "2026-03-17").janelas).toEqual([]); // terça
    expect(dia(r, "2026-03-17").disponivel).toBe(false);
  });

  it("a antecedência usa 'hoje' de São Paulo (virada de dia)", async () => {
    const { hojeSP } = await import("@/lib/datas");
    // 02:30 UTC de 10/03 ainda é 09/03 em São Paulo
    const hoje = hojeSP(new Date("2026-03-10T02:30:00Z"));
    expect(intervaloCliente(hoje, regras).min).toBe("2026-03-16");
  });

  it("o painel pode ignorar os limites (RN-10)", () => {
    const r = calcularDisponibilidade(base({ ignorarLimites: true }));
    expect(dia(r, "2026-03-09").disponivel).toBe(true);
  });
});

describe("RN-02: ocupação e capacidade", () => {
  it("janela cheia fica indisponível e a outra continua", () => {
    const r = calcularDisponibilidade(base({ ocupacao: [{ data: "2026-03-16", janelaId: 1, ocupado: 2 }] }));
    const d = dia(r, "2026-03-16");
    expect(d.janelas[0]).toMatchObject({ janelaId: 1, vagas: 0, disponivel: false });
    expect(d.janelas[1]).toMatchObject({ janelaId: 2, vagas: 2, disponivel: true });
    expect(d.disponivel).toBe(true);
  });

  it("dia com todas as janelas cheias fica indisponível", () => {
    const r = calcularDisponibilidade(
      base({
        ocupacao: [
          { data: "2026-03-16", janelaId: 1, ocupado: 2 },
          { data: "2026-03-16", janelaId: 2, ocupado: 3 },
        ],
      }),
    );
    expect(dia(r, "2026-03-16").disponivel).toBe(false);
    expect(dia(r, "2026-03-16").janelas[1].vagas).toBe(0); // nunca negativo
  });

  it("exceção de capacidade substitui a da janela", () => {
    expect(capacidadeEfetiva(2, 1)).toBe(1);
    expect(capacidadeEfetiva(2, 0)).toBe(0);
    expect(capacidadeEfetiva(2, undefined)).toBe(2);
    const r = calcularDisponibilidade(base({ excecoes: [{ data: "2026-03-16", janelaId: 1, capacidade: 1 }] }));
    expect(dia(r, "2026-03-16").janelas[0].capacidade).toBe(1);
    expect(dia(r, "2026-03-23").janelas[0].capacidade).toBe(2);
  });

  it("bloqueio de dia inteiro e de uma janela", () => {
    const inteiro = calcularDisponibilidade(base({ bloqueios: [{ data: "2026-03-16", janelaId: null }] }));
    expect(dia(inteiro, "2026-03-16").disponivel).toBe(false);

    const parcial = calcularDisponibilidade(base({ bloqueios: [{ data: "2026-03-16", janelaId: 1 }] }));
    expect(dia(parcial, "2026-03-16").janelas[0].bloqueada).toBe(true);
    expect(dia(parcial, "2026-03-16").janelas[1].disponivel).toBe(true);
  });
});

describe("RN-04: peso do porte", () => {
  it("exige vagas >= peso", () => {
    const ocupacao = [{ data: "2026-03-16", janelaId: 1, ocupado: 1 }];
    const leve = calcularDisponibilidade(base({ peso: 1, ocupacao }));
    const pesado = calcularDisponibilidade(base({ peso: 2, ocupacao }));
    expect(dia(leve, "2026-03-16").janelas[0].disponivel).toBe(true);
    expect(dia(pesado, "2026-03-16").janelas[0].disponivel).toBe(false);
    expect(dia(pesado, "2026-03-16").janelas[1].disponivel).toBe(true);
  });
});
