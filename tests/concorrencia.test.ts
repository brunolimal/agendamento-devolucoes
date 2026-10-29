import { randomBytes } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { agendamentos, janelas, portesCaminhao } from "@/db/schema";
import { diaSemana, hojeSP, somarDias } from "@/lib/datas";

// SPEC §8: 10 criações simultâneas numa janela de capacidade 2 => exatamente 2 sucessos.
// Roda contra o banco dev (DATABASE_URL). Cria e remove uma janela e um porte próprios.
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("concorrência em assert_vaga", () => {
  const db = temBanco ? getDb() : (null as never);
  const data = somarDias(hojeSP(), 400);
  const porte = "TESTE_CONC";
  let janelaId: number;

  beforeAll(async () => {
    await db.insert(portesCaminhao).values({ codigo: porte, nome: "Teste", pesoVagas: 1, ordem: 99 });
    const [j] = await db
      .insert(janelas)
      .values({ diaSemana: diaSemana(data), horaInicio: "03:00", horaFim: "04:00", capacidade: 2 })
      .returning();
    janelaId = j.id;
  });

  afterAll(async () => {
    if (janelaId) {
      await db.delete(agendamentos).where(eq(agendamentos.janelaId, janelaId));
      await db.delete(janelas).where(eq(janelas.id, janelaId));
    }
    await db.delete(portesCaminhao).where(inArray(portesCaminhao.codigo, [porte]));
  });

  it("10 reservas simultâneas com capacidade 2 resultam em exatamente 2 sucessos", async () => {
    const tentativas = Array.from({ length: 10 }, (_, i) =>
      db.batch([
        db.execute(sql`select assert_vaga(${data}::date, ${janelaId}::int, 1::int)`),
        db.insert(agendamentos).values({
          protocolo: `TESTE-CONC-${i}-${randomBytes(4).toString("hex")}`,
          token: randomBytes(24).toString("base64url"),
          data,
          janelaId,
          nome: "Teste",
          empresa: "Teste",
          whatsapp: "5511999990000",
          contrato: "TESTE",
          materiais: ["OUTROS"],
          volume: "PEQUENO",
          porteCodigo: porte,
          pesoVagas: 1,
        }),
      ]),
    );
    const resultados = await Promise.allSettled(tentativas);

    const sucessos = resultados.filter((r) => r.status === "fulfilled");
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(sucessos).toHaveLength(2);
    expect(falhas).toHaveLength(8);
    for (const f of falhas) expect(String(f.reason?.message ?? f.reason)).toContain("SEM_VAGA");

    const gravados = await db.select().from(agendamentos).where(eq(agendamentos.janelaId, janelaId));
    expect(gravados).toHaveLength(2);
  }, 60_000);
});
