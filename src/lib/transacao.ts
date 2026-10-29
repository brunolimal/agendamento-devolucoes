import { sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db";
import type { Status } from "./regras";

/** SPEC §8: toda operação que ocupa vaga chama assert_vaga dentro do mesmo db.batch do INSERT/UPDATE. */
export function assertVaga(a: {
  data: string;
  janelaId: number;
  peso: number;
  excluirId?: string | null;
  forcar?: boolean;
}) {
  return getDb().execute(
    sql`select assert_vaga(${a.data}::date, ${a.janelaId}::int, ${a.peso}::int, ${a.excluirId ?? null}::uuid, ${a.forcar ?? false}::boolean)`,
  );
}

/** Trava a linha e exige um dos status esperados (migration 0002). Evita ação dupla. */
export function assertStatus(id: string, esperados: readonly Status[]) {
  const lista = sql.join(
    esperados.map((s) => sql`${s}`),
    sql`, `,
  );
  return getDb().execute(sql`select assert_status(${id}::uuid, array[${lista}]::text[])`);
}

export async function executarBatch(itens: BatchItem<"pg">[]): Promise<unknown[]> {
  return getDb().batch(itens as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}

export type CodigoErro =
  | "SEM_VAGA"
  | "DATA_BLOQUEADA"
  | "JANELA_INVALIDA"
  | "STATUS_INVALIDO"
  | "AGENDAMENTO_NAO_ENCONTRADO"
  | "DESCONHECIDO";

const CODIGOS: Exclude<CodigoErro, "DESCONHECIDO">[] = [
  "SEM_VAGA",
  "DATA_BLOQUEADA",
  "JANELA_INVALIDA",
  "STATUS_INVALIDO",
  "AGENDAMENTO_NAO_ENCONTRADO",
];

/** Procura o código da exceção do Postgres na mensagem (e nas causas) do erro. */
export function codigoDoErro(e: unknown): CodigoErro {
  let atual: unknown = e;
  for (let i = 0; i < 5 && atual; i++) {
    const msg = atual instanceof Error ? atual.message : String(atual);
    const achado = CODIGOS.find((c) => msg.includes(c));
    if (achado) return achado;
    atual = atual instanceof Error ? atual.cause : undefined;
  }
  return "DESCONHECIDO";
}

const MENSAGENS: Record<"publico" | "painel", Record<CodigoErro, string>> = {
  publico: {
    SEM_VAGA: "Esse horário acabou de ser preenchido, escolha outro.",
    DATA_BLOQUEADA: "Essa data não está disponível, escolha outra.",
    JANELA_INVALIDA: "Esse horário não está disponível, escolha outro.",
    STATUS_INVALIDO: "Esse agendamento já foi alterado. Atualize a página.",
    AGENDAMENTO_NAO_ENCONTRADO: "Agendamento não encontrado.",
    DESCONHECIDO: "Não foi possível concluir agora. Tente novamente.",
  },
  painel: {
    SEM_VAGA: "Não há vaga suficiente nessa janela.",
    DATA_BLOQUEADA: "Essa data ou janela está bloqueada.",
    JANELA_INVALIDA: "Janela inválida para essa data (inativa ou de outro dia da semana).",
    STATUS_INVALIDO: "O status mudou em outra aba. Atualize a página.",
    AGENDAMENTO_NAO_ENCONTRADO: "Agendamento não encontrado.",
    DESCONHECIDO: "Não foi possível concluir a operação. Tente novamente.",
  },
};

export function mensagemDoErro(e: unknown, contexto: "publico" | "painel"): { codigo: CodigoErro; mensagem: string } {
  const codigo = codigoDoErro(e);
  if (codigo === "DESCONHECIDO") console.error("Erro inesperado:", e instanceof Error ? e.message : "desconhecido");
  return { codigo, mensagem: MENSAGENS[contexto][codigo] };
}
