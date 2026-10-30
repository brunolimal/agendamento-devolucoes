"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { agendamentos, historico, janelas, materiais, mensagensEnviadas, portesCaminhao } from "@/db/schema";
import { exigirSessao } from "@/lib/auth";
import { appUrl, getConfig } from "@/lib/config";
import { mascararParaExibir } from "@/lib/telefone";
import {
  CHAVE_TEMPLATE,
  enviadaEm,
  lerJanelaAnterior,
  montarVariaveis,
  renderizar,
  TIPOS_MENSAGEM,
  tipoPermitido,
  variaveisDoTemplate,
} from "@/lib/templates";
import { idSchema } from "@/lib/validacao";
import { linkWhatsapp } from "@/lib/whatsapp";

export type PreparoMensagem =
  | {
      ok: true;
      texto: string;
      nome: string;
      /** Telefone mascarado, só para conferência na tela. */
      telefone: string;
      /** ISO do último envio no estado atual (RN-12), ou null. */
      enviadaEm: string | null;
      /** Variáveis que ficaram sem valor no texto renderizado. */
      pendentes: string[];
    }
  | { ok: false; erro: string };

const preparoSchema = z.object({ id: idSchema, tipo: z.enum(TIPOS_MENSAGEM) });

/** Renderiza o template do tipo para o agendamento. A tela deixa o colaborador editar antes de enviar. */
export async function prepararMensagem(entrada: unknown): Promise<PreparoMensagem> {
  await exigirSessao();
  const p = preparoSchema.safeParse(entrada);
  if (!p.success) return { ok: false, erro: "Dados inválidos." };
  const { id, tipo } = p.data;

  const db = getDb();
  const [r] = await db
    .select({ ag: agendamentos, janela: janelas, porte: portesCaminhao })
    .from(agendamentos)
    .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
    .innerJoin(portesCaminhao, eq(portesCaminhao.codigo, agendamentos.porteCodigo))
    .where(eq(agendamentos.id, id));
  if (!r) return { ok: false, erro: "Agendamento não encontrado." };
  if (!tipoPermitido(tipo, r.ag.status)) {
    return { ok: false, erro: "Esse tipo de mensagem não se aplica ao status atual do agendamento." };
  }

  const [{ marca, regras, templates }, mats, eventos, mensagens] = await Promise.all([
    getConfig(),
    db.select().from(materiais).where(inArray(materiais.codigo, r.ag.materiais)),
    db.select().from(historico).where(eq(historico.agendamentoId, id)).orderBy(desc(historico.criadoEm), desc(historico.id)),
    db.select().from(mensagensEnviadas).where(eq(mensagensEnviadas.agendamentoId, id)),
  ]);

  let texto = "";
  if (tipo !== "LIVRE") {
    const variaveis = montarVariaveis({
      agendamento: {
        nome: r.ag.nome,
        empresa: r.ag.empresa,
        protocolo: r.ag.protocolo,
        data: r.ag.data,
        token: r.ag.token,
        motivo: r.ag.motivo,
      },
      janela: r.janela,
      porteNome: r.porte.nome,
      materiaisNomes: mats.map((m) => m.nome),
      materiaisOutros: r.ag.materiaisOutros,
      anterior: lerJanelaAnterior(eventos.find((e) => e.acao === "REAGENDADO")?.detalhes),
      marca,
      regras,
      appUrl: appUrl(),
    });
    texto = renderizar(templates[CHAVE_TEMPLATE[tipo]], variaveis);
  }

  const enviada = enviadaEm(tipo, mensagens, eventos);
  return {
    ok: true,
    texto,
    nome: r.ag.nome,
    telefone: mascararParaExibir(r.ag.whatsapp),
    enviadaEm: enviada ? enviada.toISOString() : null,
    pendentes: variaveisDoTemplate(texto),
  };
}

const envioSchema = z.object({
  id: idSchema,
  tipo: z.enum(TIPOS_MENSAGEM),
  texto: z.string().trim().min(1, "Escreva a mensagem").max(4000, "Mensagem muito longa"),
});

export type ResultadoEnvio = { ok: true; link: string; enviadoEm: string } | { ok: false; erro: string };

/**
 * RN-12: grava a mensagem (tipo + texto final) ANTES de a tela abrir o wa.me.
 * O link é montado aqui, com o número lido do banco.
 */
export async function registrarEnvio(entrada: unknown): Promise<ResultadoEnvio> {
  await exigirSessao();
  const p = envioSchema.safeParse(entrada);
  if (!p.success) return { ok: false, erro: p.error.issues[0]?.message ?? "Dados inválidos." };
  const { id, tipo, texto } = p.data;

  const db = getDb();
  const [ag] = await db
    .select({ status: agendamentos.status, whatsapp: agendamentos.whatsapp })
    .from(agendamentos)
    .where(eq(agendamentos.id, id));
  if (!ag) return { ok: false, erro: "Agendamento não encontrado." };
  if (!tipoPermitido(tipo, ag.status)) {
    return { ok: false, erro: "Esse tipo de mensagem não se aplica ao status atual do agendamento." };
  }

  const [linha] = await db
    .insert(mensagensEnviadas)
    .values({ agendamentoId: id, tipo, texto })
    .returning({ enviadoEm: mensagensEnviadas.enviadoEm });

  revalidatePath("/painel", "layout");
  return { ok: true, link: linkWhatsapp(ag.whatsapp, texto), enviadoEm: linha.enviadoEm.toISOString() };
}
