"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { agendamentos, historico, janelas, materiais, portesCaminhao, volumeCarga } from "@/db/schema";
import { exigirSessao } from "@/lib/auth";
import { estadoSyncPendente } from "@/lib/calendar";
import { getConfig } from "@/lib/config";
import { formatarHora, hojeSP } from "@/lib/datas";
import { buscarDisponibilidade, type JanelaDisponivel } from "@/lib/disponibilidade";
import {
  podeConfirmar,
  podeEditar,
  podeFinalizar,
  podeReagendar,
  podeTransitar,
  requerAlinhamento,
  type Status,
} from "@/lib/regras";
import {
  assertStatus,
  assertVaga,
  executarBatch,
  mensagemDoErro,
  type CodigoErro,
} from "@/lib/transacao";
import { idSchema, novoAgendamentoSchema, errosPorCampo } from "@/lib/validacao";

export type ResultadoAcao =
  | { ok: true }
  | { ok: false; erro: string; codigo?: CodigoErro; podeForcar?: boolean; campos?: Record<string, string> };

const falha = (erro: string): ResultadoAcao => ({ ok: false, erro });
const dadosInvalidos = (): ResultadoAcao => falha("Dados inválidos. Atualize a página e tente de novo.");

const motivoSchema = z.string().trim().min(1, "Informe o motivo").max(300, "Máximo de 300 caracteres");

function atualizarTelas() {
  revalidatePath("/painel", "layout");
}

async function carregar(id: string) {
  const [r] = await getDb()
    .select({ ag: agendamentos, janela: janelas })
    .from(agendamentos)
    .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
    .where(eq(agendamentos.id, id));
  return r;
}

async function executar(itens: Parameters<typeof executarBatch>[0]): Promise<ResultadoAcao> {
  try {
    await executarBatch(itens);
  } catch (e) {
    const { codigo, mensagem } = mensagemDoErro(e, "painel");
    return { ok: false, erro: mensagem, codigo, podeForcar: codigo === "SEM_VAGA" || codigo === "DATA_BLOQUEADA" };
  }
  atualizarTelas();
  return { ok: true };
}

// ---------------------------------------------------------------- confirmar (RN-07)

const confirmarSchema = z.object({
  id: idSchema,
  porteCodigo: z.string().min(1).max(40),
  volume: z.enum(volumeCarga.enumValues),
  forcar: z.boolean().default(false),
});

export async function confirmarAgendamento(entrada: unknown): Promise<ResultadoAcao> {
  await exigirSessao();
  const p = confirmarSchema.safeParse(entrada);
  if (!p.success) return dadosInvalidos();
  const { id, porteCodigo, volume, forcar } = p.data;

  const r = await carregar(id);
  if (!r) return falha("Agendamento não encontrado.");
  const { ag } = r;
  if (!podeTransitar(ag.status, "CONFIRMADO")) return falha("Só é possível confirmar solicitações pendentes.");
  if (!podeConfirmar({ porteCodigo, volume })) return falha("Defina o porte e o volume (não pode ficar 'Não sei').");

  const db = getDb();
  const [porte] = await db.select().from(portesCaminhao).where(eq(portesCaminhao.codigo, porteCodigo));
  if (!porte) return falha("Porte inválido.");

  const eventos = [
    {
      agendamentoId: id,
      autor: "ADMIN",
      acao: "CONFIRMADO",
      detalhes: {
        de: { porte: ag.porteCodigo, volume: ag.volume, peso: ag.pesoVagas },
        para: { porte: porteCodigo, volume, peso: porte.pesoVagas },
        forcou: forcar,
      },
    },
    ...(forcar ? [{ agendamentoId: id, autor: "ADMIN", acao: "FORCOU_VAGA", detalhes: { data: ag.data, janelaId: ag.janelaId } }] : []),
  ];

  return executar([
    assertStatus(id, ["SOLICITADO"]),
    assertVaga({ data: ag.data, janelaId: ag.janelaId, peso: porte.pesoVagas, excluirId: id, forcar }),
    db
      .update(agendamentos)
      .set({
        status: "CONFIRMADO",
        porteCodigo,
        volume,
        pesoVagas: porte.pesoVagas,
        requerAlinhamento: requerAlinhamento(porteCodigo, volume),
        calendarSync: estadoSyncPendente(),
        atualizadoEm: sql`now()`,
      })
      .where(eq(agendamentos.id, id)),
    db.insert(historico).values(eventos),
  ]);
}

// ---------------------------------------------------------------- recusar / cancelar

const motivoAcaoSchema = z.object({ id: idSchema, motivo: motivoSchema });

export async function recusarAgendamento(entrada: unknown): Promise<ResultadoAcao> {
  await exigirSessao();
  const p = motivoAcaoSchema.safeParse(entrada);
  if (!p.success) return { ok: false, erro: "Informe o motivo.", campos: errosPorCampo(p.error) };
  const { id, motivo } = p.data;

  const r = await carregar(id);
  if (!r) return falha("Agendamento não encontrado.");
  if (!podeTransitar(r.ag.status, "RECUSADO")) return falha("Só é possível recusar solicitações pendentes.");

  const db = getDb();
  return executar([
    assertStatus(id, ["SOLICITADO"]),
    db
      .update(agendamentos)
      .set({ status: "RECUSADO", motivo, atualizadoEm: sql`now()` })
      .where(eq(agendamentos.id, id)),
    db.insert(historico).values({
      agendamentoId: id,
      autor: "ADMIN",
      acao: "RECUSADO",
      detalhes: { de: { status: r.ag.status }, para: { status: "RECUSADO" }, motivo },
    }),
  ]);
}

export async function cancelarAgendamento(entrada: unknown): Promise<ResultadoAcao> {
  await exigirSessao();
  const p = motivoAcaoSchema.safeParse(entrada);
  if (!p.success) return { ok: false, erro: "Informe o motivo.", campos: errosPorCampo(p.error) };
  const { id, motivo } = p.data;

  const r = await carregar(id);
  if (!r) return falha("Agendamento não encontrado.");
  if (!podeTransitar(r.ag.status, "CANCELADO_EMPRESA")) return falha("Esse agendamento não pode mais ser cancelado.");

  const db = getDb();
  return executar([
    assertStatus(id, ["SOLICITADO", "CONFIRMADO"]),
    db
      .update(agendamentos)
      .set({
        status: "CANCELADO_EMPRESA",
        motivo,
        // se já havia evento no Calendar, a sincronização precisa removê-lo
        calendarSync: r.ag.calendarEventId ? estadoSyncPendente() : undefined,
        atualizadoEm: sql`now()`,
      })
      .where(eq(agendamentos.id, id)),
    db.insert(historico).values({
      agendamentoId: id,
      autor: "ADMIN",
      acao: "CANCELADO",
      detalhes: { de: { status: r.ag.status }, para: { status: "CANCELADO_EMPRESA" }, motivo },
    }),
  ]);
}

// ---------------------------------------------------------------- reagendar (RN-09)

const reagendarSchema = z.object({
  id: idSchema,
  data: z.iso.date(),
  janelaId: z.number().int().positive(),
  forcar: z.boolean().default(false),
});

export async function reagendarAgendamento(entrada: unknown): Promise<ResultadoAcao> {
  await exigirSessao();
  const p = reagendarSchema.safeParse(entrada);
  if (!p.success) return dadosInvalidos();
  const { id, data, janelaId, forcar } = p.data;

  const r = await carregar(id);
  if (!r) return falha("Agendamento não encontrado.");
  const { ag, janela: atual } = r;
  if (!podeReagendar(ag.status)) return falha("Só é possível reagendar agendamentos confirmados.");
  if (data < hojeSP()) return falha("Escolha uma data a partir de hoje.");
  if (data === ag.data && janelaId === ag.janelaId) return falha("Escolha outra data ou outra janela.");

  const db = getDb();
  const [nova] = await db.select().from(janelas).where(eq(janelas.id, janelaId));
  if (!nova) return falha("Janela inválida.");

  const texto = (j: { horaInicio: string; horaFim: string }) => `${formatarHora(j.horaInicio)}–${formatarHora(j.horaFim)}`;
  const eventos = [
    {
      agendamentoId: id,
      autor: "ADMIN",
      acao: "REAGENDADO",
      detalhes: {
        de: { data: ag.data, janela: texto(atual) },
        para: { data, janela: texto(nova) },
      },
    },
    ...(forcar ? [{ agendamentoId: id, autor: "ADMIN", acao: "FORCOU_VAGA", detalhes: { data, janelaId } }] : []),
  ];

  return executar([
    assertStatus(id, ["CONFIRMADO"]),
    assertVaga({ data, janelaId, peso: ag.pesoVagas, excluirId: id, forcar }),
    db
      .update(agendamentos)
      .set({ data, janelaId, calendarSync: estadoSyncPendente(), atualizadoEm: sql`now()` })
      .where(eq(agendamentos.id, id)),
    db.insert(historico).values(eventos),
  ]);
}

// ---------------------------------------------------------------- editar

const editarSchema = novoAgendamentoSchema
  .omit({ data: true, janelaId: true })
  .extend({ id: idSchema, forcar: z.boolean().default(false) });

export async function editarAgendamento(entrada: unknown): Promise<ResultadoAcao> {
  await exigirSessao();
  const p = editarSchema.safeParse(entrada);
  if (!p.success) return { ok: false, erro: "Confira os campos destacados.", campos: errosPorCampo(p.error) };
  const { id, forcar, ...d } = p.data;

  const r = await carregar(id);
  if (!r) return falha("Agendamento não encontrado.");
  const { ag } = r;
  if (!podeEditar(ag.status)) return falha("Esse agendamento não pode mais ser editado.");
  if (ag.status === "CONFIRMADO" && !podeConfirmar({ porteCodigo: d.porteCodigo, volume: d.volume })) {
    return falha("Agendamento confirmado precisa de porte e volume definidos.");
  }

  const db = getDb();
  const codigos = [...new Set(d.materiais)];
  const [[porte], mats] = await Promise.all([
    db.select().from(portesCaminhao).where(eq(portesCaminhao.codigo, d.porteCodigo)),
    db.select({ codigo: materiais.codigo }).from(materiais).where(inArray(materiais.codigo, codigos)),
  ]);
  if (!porte) return falha("Porte inválido.");
  if (mats.length !== codigos.length) return falha("Material inválido.");

  const novo = {
    nome: d.nome,
    empresa: d.empresa,
    whatsapp: d.whatsapp,
    contrato: d.contrato,
    materiais: codigos,
    materiaisOutros: d.materiaisOutros,
    volume: d.volume,
    porteCodigo: d.porteCodigo,
    placa: d.placa,
    motorista: d.motorista,
    observacoes: d.observacoes,
  };
  const de: Record<string, unknown> = {};
  const para: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(novo)) {
    const anterior = ag[campo as keyof typeof ag];
    if (JSON.stringify(anterior) !== JSON.stringify(valor)) {
      de[campo] = anterior;
      para[campo] = valor;
    }
  }
  if (Object.keys(para).length === 0) return falha("Nada foi alterado.");

  const pesoMudou = porte.pesoVagas !== ag.pesoVagas;
  return executar([
    assertStatus(id, ["SOLICITADO", "CONFIRMADO"]),
    ...(pesoMudou
      ? [assertVaga({ data: ag.data, janelaId: ag.janelaId, peso: porte.pesoVagas, excluirId: id, forcar })]
      : []),
    db
      .update(agendamentos)
      .set({
        ...novo,
        pesoVagas: porte.pesoVagas,
        requerAlinhamento: requerAlinhamento(d.porteCodigo, d.volume),
        calendarSync: ag.status === "CONFIRMADO" ? estadoSyncPendente() : undefined,
        atualizadoEm: sql`now()`,
      })
      .where(eq(agendamentos.id, id)),
    db.insert(historico).values([
      { agendamentoId: id, autor: "ADMIN", acao: "EDITADO", detalhes: { de, para } },
      ...(pesoMudou && forcar
        ? [{ agendamentoId: id, autor: "ADMIN", acao: "FORCOU_VAGA", detalhes: { data: ag.data, janelaId: ag.janelaId } }]
        : []),
    ]),
  ]);
}

// ---------------------------------------------------------------- concluir / não compareceu (RN-18)

async function finalizar(entrada: unknown, destino: Extract<Status, "CONCLUIDO" | "NAO_COMPARECEU">): Promise<ResultadoAcao> {
  await exigirSessao();
  const p = z.object({ id: idSchema }).safeParse(entrada);
  if (!p.success) return dadosInvalidos();
  const { id } = p.data;

  const r = await carregar(id);
  if (!r) return falha("Agendamento não encontrado.");
  if (!podeTransitar(r.ag.status, destino)) return falha("Só agendamentos confirmados podem ser finalizados.");
  if (!podeFinalizar(r.ag.status, r.ag.data, hojeSP())) return falha("Disponível a partir da data do agendamento.");

  const db = getDb();
  return executar([
    assertStatus(id, ["CONFIRMADO"]),
    db
      .update(agendamentos)
      .set({
        status: destino,
        // RN-14: não comparecimento remove o evento do Calendar; concluir mantém
        calendarSync: destino === "NAO_COMPARECEU" && r.ag.calendarEventId ? estadoSyncPendente() : undefined,
        atualizadoEm: sql`now()`,
      })
      .where(eq(agendamentos.id, id)),
    db.insert(historico).values({
      agendamentoId: id,
      autor: "ADMIN",
      acao: destino,
      detalhes: { de: { status: r.ag.status }, para: { status: destino } },
    }),
  ]);
}

export async function concluirAgendamento(entrada: unknown): Promise<ResultadoAcao> {
  return finalizar(entrada, "CONCLUIDO");
}

export async function marcarNaoCompareceu(entrada: unknown): Promise<ResultadoAcao> {
  return finalizar(entrada, "NAO_COMPARECEU");
}

// ---------------------------------------------------------------- caixa de entrada e apoio

/** RN-15: tira da caixa de entrada um cancelamento feito pelo cliente. */
export async function marcarVisto(formData: FormData): Promise<void> {
  await exigirSessao();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await getDb()
    .update(agendamentos)
    .set({ vistoEm: sql`now()` })
    .where(and(eq(agendamentos.id, id.data), eq(agendamentos.status, "CANCELADO_CLIENTE"), isNull(agendamentos.vistoEm)));
  atualizarTelas();
}

const diaSchema = z.object({ data: z.iso.date(), peso: z.number().int().min(1).max(4) });

/** Janelas de uma data com a ocupação (X/Y), para reagendar. Painel ignora antecedências (RN-09/RN-10). */
export async function janelasDoDia(entrada: unknown): Promise<JanelaDisponivel[]> {
  await exigirSessao();
  const p = diaSchema.safeParse(entrada);
  if (!p.success) return [];
  const { regras } = await getConfig();
  const [dia] = await buscarDisponibilidade({
    de: p.data.data,
    ate: p.data.data,
    hoje: hojeSP(),
    regras,
    peso: p.data.peso,
    ignorarLimites: true,
  });
  return dia?.janelas ?? [];
}
