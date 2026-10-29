"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { agendamentos, historico } from "@/db/schema";
import { estadoSyncPendente } from "@/lib/calendar";
import { getConfig } from "@/lib/config";
import { hojeSP } from "@/lib/datas";
import { tokenValido } from "@/lib/protocolo";
import { ocupaVaga, podeClienteCancelar } from "@/lib/regras";
import { assertStatus, executarBatch, mensagemDoErro } from "@/lib/transacao";

export type ResultadoCancelamento = { ok: true } | { ok: false; erro: string };

/** RN-08 e RN-15: cancelamento pelo cliente, dentro do prazo. Aparece na caixa de entrada até o "Visto". */
export async function cancelarPeloCliente(token: unknown): Promise<ResultadoCancelamento> {
  if (typeof token !== "string" || !tokenValido(token)) return { ok: false, erro: "Agendamento não encontrado." };

  const db = getDb();
  const [ag] = await db
    .select({
      id: agendamentos.id,
      status: agendamentos.status,
      data: agendamentos.data,
      calendarEventId: agendamentos.calendarEventId,
    })
    .from(agendamentos)
    .where(eq(agendamentos.token, token));
  if (!ag) return { ok: false, erro: "Agendamento não encontrado." };

  if (!ocupaVaga(ag.status)) return { ok: false, erro: "Esse agendamento não pode mais ser cancelado." };

  const { regras } = await getConfig();
  if (!podeClienteCancelar(ag.status, ag.data, hojeSP(), regras)) {
    return { ok: false, erro: "O prazo para cancelar pelo link terminou. Fale com a logística." };
  }

  try {
    await executarBatch([
      assertStatus(ag.id, ["SOLICITADO", "CONFIRMADO"]),
      db
        .update(agendamentos)
        .set({
          status: "CANCELADO_CLIENTE",
          motivo: "Cancelado pelo cliente",
          vistoEm: null,
          // se já havia evento no Calendar, a sincronização precisa removê-lo
          calendarSync: ag.calendarEventId ? estadoSyncPendente() : undefined,
          atualizadoEm: sql`now()`,
        })
        .where(eq(agendamentos.id, ag.id)),
      db.insert(historico).values({
        agendamentoId: ag.id,
        autor: "CLIENTE",
        acao: "CANCELADO",
        detalhes: { de: { status: ag.status }, para: { status: "CANCELADO_CLIENTE" } },
      }),
    ]);
  } catch (e) {
    return { ok: false, erro: mensagemDoErro(e, "publico").mensagem };
  }

  revalidatePath(`/a/${token}`);
  return { ok: true };
}
