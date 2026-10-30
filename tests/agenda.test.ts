import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { agendamentos, janelas, portesCaminhao } from "@/db/schema";
import { diaSemana, hojeSP, intervaloDaVisao, somarDias } from "@/lib/datas";
import { buscarDisponibilidade } from "@/lib/disponibilidade";
import { statusInicial } from "@/lib/regras";

describe("intervaloDaVisao (agenda)", () => {
  it("dia: só a própria data", () => {
    expect(intervaloDaVisao("2026-03-11", "dia")).toEqual({ de: "2026-03-11", ate: "2026-03-11" });
  });

  it("semana: de segunda a domingo, de qualquer dia da semana", () => {
    // 2026-03-09 é segunda
    for (const d of ["2026-03-09", "2026-03-11", "2026-03-14", "2026-03-15"]) {
      expect(intervaloDaVisao(d, "semana"), d).toEqual({ de: "2026-03-09", ate: "2026-03-15" });
    }
  });

  it("a semana atravessa a virada de mês e de ano", () => {
    expect(intervaloDaVisao("2026-04-01", "semana")).toEqual({ de: "2026-03-30", ate: "2026-04-05" });
    expect(intervaloDaVisao("2026-12-31", "semana")).toEqual({ de: "2026-12-28", ate: "2027-01-03" });
  });
});

describe("RN-10: agendamento manual", () => {
  it("nasce CONFIRMADO por padrão e SOLICITADO se o checkbox for desmarcado", () => {
    expect(statusInicial("PAINEL")).toBe("CONFIRMADO");
    expect(statusInicial("PAINEL", true)).toBe("CONFIRMADO");
    expect(statusInicial("PAINEL", false)).toBe("SOLICITADO");
  });
});

// RN-02 contra o banco dev: cancelados e recusados nunca entram na ocupação X/Y.
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("ocupação X/Y no banco (RN-02)", () => {
  const db = temBanco ? getDb() : (null as never);
  const data = somarDias(hojeSP(), 402);
  const porte = "TESTE_OCUP";
  let janelaId: number;
  const protocolos: string[] = [];

  beforeAll(async () => {
    await db.insert(portesCaminhao).values({ codigo: porte, nome: "Teste", pesoVagas: 1, ordem: 97 });
    const [j] = await db
      .insert(janelas)
      .values({ diaSemana: diaSemana(data), horaInicio: "05:00", horaFim: "06:00", capacidade: 3 })
      .returning();
    janelaId = j.id;
    const base = {
      data,
      janelaId,
      nome: "Teste",
      empresa: "Teste",
      whatsapp: "5511999990000",
      contrato: "TESTE",
      materiais: ["OUTROS"],
      volume: "PEQUENO" as const,
      porteCodigo: porte,
      pesoVagas: 1,
    };
    for (const status of ["SOLICITADO", "CONFIRMADO", "CANCELADO_CLIENTE", "CANCELADO_EMPRESA", "RECUSADO", "CONCLUIDO"] as const) {
      const protocolo = `TESTE-OC-${status}-${randomBytes(3).toString("hex")}`;
      protocolos.push(protocolo);
      await db.insert(agendamentos).values({ ...base, protocolo, token: randomBytes(24).toString("base64url"), status });
    }
  });

  afterAll(async () => {
    if (janelaId) await db.delete(agendamentos).where(eq(agendamentos.janelaId, janelaId));
    if (janelaId) await db.delete(janelas).where(eq(janelas.id, janelaId));
    await db.delete(portesCaminhao).where(inArray(portesCaminhao.codigo, [porte]));
  });

  it("só SOLICITADO e CONFIRMADO ocupam vaga", async () => {
    const regras = { antecedencia_min_dias: 7, antecedencia_max_dias: 60, prazo_cancel_dias: 2, sla_decisao_dias: 3, dias_lembrete: 1 };
    const [dia] = await buscarDisponibilidade({ de: data, ate: data, hoje: hojeSP(), regras, peso: 1, ignorarLimites: true });
    const janela = dia.janelas.find((j) => j.janelaId === janelaId);
    expect(janela).toMatchObject({ capacidade: 3, ocupado: 2, vagas: 1, disponivel: true });
  });
});
