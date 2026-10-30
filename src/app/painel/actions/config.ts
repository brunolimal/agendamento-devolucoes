"use server";

import { createHash } from "node:crypto";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import {
  agendamentos,
  bloqueios,
  capacidadeExcecoes,
  configuracao,
  imagens,
  janelas,
  materiais,
  portesCaminhao,
} from "@/db/schema";
import { exigirSessao } from "@/lib/auth";
import { getConfig, marcaSchema, regrasSchema, templatesSchema, TIPOS_TEMPLATE } from "@/lib/config";
import { diaSemana, hojeSP } from "@/lib/datas";
import { CODIGO_REGEX, LIMITES_IMAGEM, TIPOS_IMAGEM, urlDaImagem, validarImagem, type TipoImagem } from "@/lib/imagem";
import { descreverJanela, encontrarSobreposicao, NOMES_DIA, planejarCopia } from "@/lib/janelas";
import { STATUS_QUE_OCUPAM } from "@/lib/regras";
import { normalizarTelefone, soDigitos } from "@/lib/telefone";
import { executarBatch } from "@/lib/transacao";
import { errosPorCampo } from "@/lib/validacao";

export type ResultadoConfig =
  | { ok: true; mensagem: string; avisos?: string[] }
  | { ok: false; erro: string; campos?: Record<string, string> };

const ok = (mensagem: string, avisos: string[] = []): ResultadoConfig => ({ ok: true, mensagem, avisos });
const falha = (erro: string, campos?: Record<string, string>): ResultadoConfig => ({ ok: false, erro, campos });
const invalido = (e: z.ZodError): ResultadoConfig => falha("Confira os campos destacados.", errosPorCampo(e));

/** A configuração é lida a cada request: salvar já vale para o app inteiro, sem deploy. */
function recarregar() {
  revalidatePath("/", "layout");
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// ---------------------------------------------------------------- marca e regras

export async function salvarMarca(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const bruto = objeto(entrada);
  const whatsapp = typeof bruto.whatsapp_empresa === "string" ? bruto.whatsapp_empresa : "";
  const logo = typeof bruto.logo_url === "string" ? bruto.logo_url.trim() : bruto.logo_url;
  const p = marcaSchema.safeParse({
    ...bruto,
    whatsapp_empresa: normalizarTelefone(whatsapp) ?? soDigitos(whatsapp),
    logo_url: logo === "" ? null : logo,
    link_maps: typeof bruto.link_maps === "string" ? bruto.link_maps.trim() : bruto.link_maps,
  });
  if (!p.success) return invalido(p.error);

  await getDb().update(configuracao).set({ marca: p.data, atualizadoEm: sql`now()` }).where(eq(configuracao.id, 1));
  recarregar();
  return ok("Marca salva.");
}

export async function salvarRegras(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = regrasSchema.safeParse(entrada);
  if (!p.success) return invalido(p.error);

  await getDb().update(configuracao).set({ regras: p.data, atualizadoEm: sql`now()` }).where(eq(configuracao.id, 1));
  recarregar();
  const avisos: string[] = [];
  if (p.data.antecedencia_min_dias >= p.data.antecedencia_max_dias - 6) {
    avisos.push("A faixa de datas liberada ao cliente ficou muito curta.");
  }
  return ok("Regras salvas. Já valem para o app inteiro.", avisos);
}

// ---------------------------------------------------------------- mensagens (templates)

const templateSchema = z.object({ chave: z.enum(TIPOS_TEMPLATE), texto: z.string() });

export async function salvarTemplate(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = templateSchema.safeParse(entrada);
  if (!p.success) return falha("Dados inválidos.");
  const { chave, texto } = p.data;

  const { templates } = await getConfig();
  const novo = templatesSchema.safeParse({ ...templates, [chave]: texto });
  if (!novo.success) {
    const campos = errosPorCampo(novo.error);
    return falha(campos[chave] ?? "Template inválido.", campos);
  }

  await getDb().update(configuracao).set({ templates: novo.data, atualizadoEm: sql`now()` }).where(eq(configuracao.id, 1));
  recarregar();
  return ok("Template salvo. As próximas mensagens já usam este texto.");
}

// ---------------------------------------------------------------- janelas

const horaSchema = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, "Hora inválida")
  .transform((h) => h.slice(0, 5));

const janelaEdicaoSchema = z
  .object({
    id: z.number().int().positive().optional(),
    horaInicio: horaSchema,
    horaFim: horaSchema,
    capacidade: z.number({ error: "Informe a capacidade" }).int().min(0, "Mínimo 0").max(99, "Máximo 99"),
    ativo: z.boolean(),
  })
  .refine((j) => j.horaFim > j.horaInicio, { message: "O fim deve ser depois do início", path: ["horaFim"] });

const diaJanelasSchema = z.object({
  dia: z.number().int().min(0).max(6),
  janelas: z.array(janelaEdicaoSchema).max(24, "Máximo de 24 janelas por dia"),
});

/** Janelas referenciadas por agendamentos, exceções ou bloqueios não podem ser apagadas: ficam desativadas. */
async function janelasReferenciadas(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const db = getDb();
  const [a, e, b] = await db.batch([
    db.selectDistinct({ id: agendamentos.janelaId }).from(agendamentos).where(inArray(agendamentos.janelaId, ids)),
    db.selectDistinct({ id: capacidadeExcecoes.janelaId }).from(capacidadeExcecoes).where(inArray(capacidadeExcecoes.janelaId, ids)),
    db.selectDistinct({ id: bloqueios.janelaId }).from(bloqueios).where(inArray(bloqueios.janelaId, ids)),
  ]);
  return new Set([...a, ...e, ...b].map((r) => r.id).filter((id): id is number => id !== null));
}

/** Datas futuras de um dia da semana em que a ocupação já passa da capacidade (aviso, nunca bloqueio). */
async function datasAcimaDaCapacidade(dia: number): Promise<number> {
  const linhas = await getDb()
    .select({ data: agendamentos.data })
    .from(agendamentos)
    .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
    .leftJoin(capacidadeExcecoes, and(eq(capacidadeExcecoes.janelaId, janelas.id), eq(capacidadeExcecoes.data, agendamentos.data)))
    .where(and(inArray(agendamentos.status, [...STATUS_QUE_OCUPAM]), gte(agendamentos.data, hojeSP()), eq(janelas.diaSemana, dia)))
    .groupBy(agendamentos.data, agendamentos.janelaId, janelas.capacidade, capacidadeExcecoes.capacidade)
    .having(sql`sum(${agendamentos.pesoVagas}) > coalesce(${capacidadeExcecoes.capacidade}, ${janelas.capacidade})`);
  return linhas.length;
}

/** Agendamentos futuros (que ocupam vaga) em janelas desativadas de um dia da semana. */
async function agendamentosEmJanelasInativas(dia: number): Promise<number> {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(agendamentos)
    .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
    .where(
      and(
        inArray(agendamentos.status, [...STATUS_QUE_OCUPAM]),
        gte(agendamentos.data, hojeSP()),
        eq(janelas.diaSemana, dia),
        eq(janelas.ativo, false),
      ),
    );
  return r?.n ?? 0;
}

async function avisosDoDia(dia: number): Promise<string[]> {
  const [acima, emInativas] = await Promise.all([datasAcimaDaCapacidade(dia), agendamentosEmJanelasInativas(dia)]);
  const avisos: string[] = [];
  if (acima > 0) {
    avisos.push(`${acima} data(s) futura(s) de ${NOMES_DIA[dia].toLowerCase()} já estão acima da capacidade. Nada foi cancelado.`);
  }
  if (emInativas > 0) {
    avisos.push(`${emInativas} agendamento(s) futuro(s) de ${NOMES_DIA[dia].toLowerCase()} estão em janelas desativadas e continuam valendo.`);
  }
  return avisos;
}

export async function salvarJanelasDia(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = diaJanelasSchema.safeParse(entrada);
  if (!p.success) {
    const primeira = p.error.issues[0];
    return falha(primeira?.message ?? "Confira as janelas.");
  }
  const { dia, janelas: lista } = p.data;

  const sobreposicao = encontrarSobreposicao(lista.filter((j) => j.ativo));
  if (sobreposicao) {
    return falha(`As janelas ${descreverJanela(sobreposicao[0])} e ${descreverJanela(sobreposicao[1])} se sobrepõem. Ajuste os horários.`);
  }

  const db = getDb();
  const existentes = await db.select().from(janelas).where(eq(janelas.diaSemana, dia));
  const idsDoDia = new Set(existentes.map((e) => e.id));
  const enviados = lista.flatMap((j) => (j.id ? [j.id] : []));
  if (enviados.some((id) => !idsDoDia.has(id)) || new Set(enviados).size !== enviados.length) {
    return falha("As janelas mudaram em outra aba. Atualize a página.");
  }

  const mantidos = new Set(enviados);
  const descartar = existentes.filter((e) => !mantidos.has(e.id)).map((e) => e.id);
  const referenciadas = await janelasReferenciadas(descartar);
  const remover = descartar.filter((id) => !referenciadas.has(id));
  const desativar = descartar.filter((id) => referenciadas.has(id));
  const novas = lista.filter((j) => !j.id);

  const itens: BatchItem<"pg">[] = [];
  for (const j of lista) {
    if (j.id) {
      itens.push(
        db.update(janelas).set({ horaInicio: j.horaInicio, horaFim: j.horaFim, capacidade: j.capacidade, ativo: j.ativo }).where(eq(janelas.id, j.id)),
      );
    }
  }
  if (novas.length > 0) {
    itens.push(
      db.insert(janelas).values(
        novas.map((j) => ({ diaSemana: dia, horaInicio: j.horaInicio, horaFim: j.horaFim, capacidade: j.capacidade, ativo: j.ativo })),
      ),
    );
  }
  if (remover.length > 0) itens.push(db.delete(janelas).where(inArray(janelas.id, remover)));
  if (desativar.length > 0) itens.push(db.update(janelas).set({ ativo: false }).where(inArray(janelas.id, desativar)));
  if (itens.length === 0) return ok("Nada para salvar.");

  try {
    await executarBatch(itens);
  } catch {
    return falha("Não foi possível salvar as janelas. Tente novamente.");
  }

  recarregar();
  const avisos = await avisosDoDia(dia);
  if (desativar.length > 0) {
    avisos.unshift(`${desativar.length} janela(s) tinham histórico e foram desativadas em vez de apagadas.`);
  }
  return ok(`Janelas de ${NOMES_DIA[dia].toLowerCase()} salvas.`, avisos);
}

const copiaSchema = z.object({
  origem: z.number().int().min(0).max(6),
  destinos: z.array(z.number().int().min(0).max(6)).min(1, "Escolha ao menos um dia"),
});

/** "Copiar para outros dias": replica as janelas ativas e salvas do dia de origem nos dias escolhidos. */
export async function copiarJanelas(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = copiaSchema.safeParse(entrada);
  if (!p.success) return falha(p.error.issues[0]?.message ?? "Dados inválidos.");
  const destinos = [...new Set(p.data.destinos)].filter((d) => d !== p.data.origem);
  if (destinos.length === 0) return falha("Escolha ao menos um dia diferente do de origem.");

  const db = getDb();
  const todas = await db.select().from(janelas);
  const origem = todas.filter((j) => j.diaSemana === p.data.origem && j.ativo);
  if (origem.length === 0) return falha("O dia de origem não tem janelas ativas salvas.");

  const planos = destinos.map((d) => ({ dia: d, plano: planejarCopia(origem, todas.filter((j) => j.diaSemana === d)) }));
  const descartar = planos.flatMap((x) => x.plano.descartar);
  const referenciadas = await janelasReferenciadas(descartar);
  const remover = descartar.filter((id) => !referenciadas.has(id));
  const desativar = descartar.filter((id) => referenciadas.has(id));

  const itens: BatchItem<"pg">[] = [];
  for (const { dia, plano } of planos) {
    for (const a of plano.atualizar) {
      itens.push(db.update(janelas).set({ capacidade: a.capacidade, ativo: true }).where(eq(janelas.id, a.id)));
    }
    if (plano.criar.length > 0) itens.push(db.insert(janelas).values(plano.criar.map((c) => ({ ...c, diaSemana: dia }))));
  }
  if (remover.length > 0) itens.push(db.delete(janelas).where(inArray(janelas.id, remover)));
  if (desativar.length > 0) itens.push(db.update(janelas).set({ ativo: false }).where(inArray(janelas.id, desativar)));

  try {
    await executarBatch(itens);
  } catch {
    return falha("Não foi possível copiar as janelas. Tente novamente.");
  }

  recarregar();
  const avisos = (await Promise.all(destinos.map(avisosDoDia))).flat();
  if (desativar.length > 0) avisos.unshift(`${desativar.length} janela(s) com histórico foram desativadas em vez de apagadas.`);
  return ok(`Janelas copiadas de ${NOMES_DIA[p.data.origem].toLowerCase()} para ${destinos.length} dia(s).`, avisos);
}

// ---------------------------------------------------------------- exceções de capacidade

const excecaoSchema = z.object({
  data: z.iso.date("Data inválida"),
  janelaId: z.number().int().positive(),
  capacidade: z.number({ error: "Informe a capacidade" }).int().min(0, "Mínimo 0").max(99, "Máximo 99"),
});

export async function salvarExcecao(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = excecaoSchema.safeParse(entrada);
  if (!p.success) return invalido(p.error);
  const { data, janelaId, capacidade } = p.data;
  if (data < hojeSP()) return falha("Escolha uma data a partir de hoje.", { data: "Data no passado" });

  const db = getDb();
  const [janela] = await db.select().from(janelas).where(eq(janelas.id, janelaId));
  if (!janela || !janela.ativo) return falha("Janela inválida ou desativada.", { janelaId: "Escolha outra janela" });
  if (janela.diaSemana !== diaSemana(data)) {
    return falha("Essa janela é de outro dia da semana (o assert_vaga recusaria reservas).", { janelaId: "Janela de outro dia" });
  }

  await db
    .insert(capacidadeExcecoes)
    .values({ data, janelaId, capacidade })
    .onConflictDoUpdate({ target: [capacidadeExcecoes.data, capacidadeExcecoes.janelaId], set: { capacidade } });

  const [ocupacao] = await db
    .select({ ocupado: sql<number>`coalesce(sum(${agendamentos.pesoVagas}), 0)::int` })
    .from(agendamentos)
    .where(
      and(eq(agendamentos.data, data), eq(agendamentos.janelaId, janelaId), inArray(agendamentos.status, [...STATUS_QUE_OCUPAM])),
    );
  recarregar();
  const avisos = ocupacao && ocupacao.ocupado > capacidade ? [`Essa janela já tem ${ocupacao.ocupado} vaga(s) ocupada(s), acima da nova capacidade.`] : [];
  return ok("Exceção salva.", avisos);
}

const chaveExcecaoSchema = z.object({ data: z.iso.date(), janelaId: z.number().int().positive() });

export async function removerExcecao(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = chaveExcecaoSchema.safeParse(entrada);
  if (!p.success) return falha("Dados inválidos.");
  await getDb()
    .delete(capacidadeExcecoes)
    .where(and(eq(capacidadeExcecoes.data, p.data.data), eq(capacidadeExcecoes.janelaId, p.data.janelaId)));
  recarregar();
  return ok("Exceção removida.");
}

// ---------------------------------------------------------------- bloqueios

const bloqueioSchema = z.object({
  data: z.iso.date("Data inválida"),
  janelaId: z.number().int().positive().nullable(),
  motivo: z.string().trim().min(1, "Informe o motivo").max(200, "Máximo de 200 caracteres"),
});

export async function criarBloqueio(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = bloqueioSchema.safeParse(entrada);
  if (!p.success) return invalido(p.error);
  const { data, janelaId, motivo } = p.data;
  if (data < hojeSP()) return falha("Escolha uma data a partir de hoje.", { data: "Data no passado" });

  const db = getDb();
  if (janelaId !== null) {
    const [janela] = await db.select().from(janelas).where(eq(janelas.id, janelaId));
    if (!janela) return falha("Janela inválida.", { janelaId: "Escolha outra janela" });
    if (janela.diaSemana !== diaSemana(data)) return falha("Essa janela é de outro dia da semana.", { janelaId: "Janela de outro dia" });
  }

  await db.insert(bloqueios).values({ data, janelaId, motivo });
  const condicoes = [eq(agendamentos.data, data), inArray(agendamentos.status, [...STATUS_QUE_OCUPAM])];
  if (janelaId !== null) condicoes.push(eq(agendamentos.janelaId, janelaId));
  const [afetados] = await db.select({ n: sql<number>`count(*)::int` }).from(agendamentos).where(and(...condicoes));
  recarregar();
  return ok(
    "Bloqueio criado.",
    afetados && afetados.n > 0 ? [`${afetados.n} agendamento(s) ativo(s) nesse período continuam valendo. Reagende ou cancele se for preciso.`] : [],
  );
}

export async function removerBloqueio(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = z.object({ id: z.number().int().positive() }).safeParse(entrada);
  if (!p.success) return falha("Dados inválidos.");
  await getDb().delete(bloqueios).where(eq(bloqueios.id, p.data.id));
  recarregar();
  return ok("Bloqueio removido.");
}

// ---------------------------------------------------------------- portes e materiais (só editar e ativar/desativar)
// A imagem de cada um só entra pelo upload (enviarImagem): não existe campo de imagem por link.

const porteSchema = z.object({
  codigo: z.string().min(1).max(40),
  nome: z.string().trim().min(1, "Informe o nome").max(40, "Máximo de 40 caracteres"),
  descricao: z.string().trim().max(200, "Máximo de 200 caracteres").nullish().transform((v) => v || null),
  pesoVagas: z.number({ error: "Informe o peso" }).int().min(1, "Mínimo 1").max(4, "Máximo 4"),
  ordem: z.number({ error: "Informe a ordem" }).int().min(0).max(99),
  ativo: z.boolean(),
});

export async function salvarPorte(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = porteSchema.safeParse(entrada);
  if (!p.success) return invalido(p.error);
  const d = p.data;

  const db = getDb();
  const [atual] = await db.select().from(portesCaminhao).where(eq(portesCaminhao.codigo, d.codigo));
  if (!atual) return falha("Porte não encontrado.");
  if (d.codigo === "NAO_SEI" && !d.ativo) return falha('O porte "Não sei / A alinhar" não pode ser desativado.');
  if (!d.ativo) {
    const [outros] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(portesCaminhao)
      .where(and(eq(portesCaminhao.ativo, true), ne(portesCaminhao.codigo, d.codigo), ne(portesCaminhao.codigo, "NAO_SEI")));
    if (!outros || outros.n === 0) return falha("Mantenha ao menos um porte ativo além de 'Não sei'.");
  }

  await db
    .update(portesCaminhao)
    .set({ nome: d.nome, descricao: d.descricao, pesoVagas: d.pesoVagas, ordem: d.ordem, ativo: d.ativo })
    .where(eq(portesCaminhao.codigo, d.codigo));
  recarregar();
  return ok(
    `Porte ${d.nome} salvo.`,
    d.pesoVagas !== atual.pesoVagas ? ["O novo peso vale só para agendamentos novos. Os já criados mantêm o peso gravado."] : [],
  );
}

const materialSchema = z.object({
  codigo: z.string().min(1).max(40),
  nome: z.string().trim().min(1, "Informe o nome").max(40, "Máximo de 40 caracteres"),
  ordem: z.number({ error: "Informe a ordem" }).int().min(0).max(99),
  ativo: z.boolean(),
});

export async function salvarMaterial(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = materialSchema.safeParse(entrada);
  if (!p.success) return invalido(p.error);
  const d = p.data;

  const db = getDb();
  const [atual] = await db.select().from(materiais).where(eq(materiais.codigo, d.codigo));
  if (!atual) return falha("Material não encontrado.");
  if (!d.ativo) {
    const [outros] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(materiais)
      .where(and(eq(materiais.ativo, true), ne(materiais.codigo, d.codigo)));
    if (!outros || outros.n === 0) return falha("Mantenha ao menos um material ativo.");
  }

  await db.update(materiais).set({ nome: d.nome, ordem: d.ordem, ativo: d.ativo }).where(eq(materiais.codigo, d.codigo));
  recarregar();
  return ok(`Material ${d.nome} salvo.`);
}

// ---------------------------------------------------------------- imagens de portes e materiais (upload)

const envioImagemSchema = z.object({
  tipo: z.enum(TIPOS_IMAGEM as [TipoImagem, ...TipoImagem[]]),
  codigo: z.string().regex(CODIGO_REGEX),
  arquivo: z.instanceof(File),
});

async function itemExiste(tipo: TipoImagem, codigo: string): Promise<boolean> {
  const db = getDb();
  const linhas =
    tipo === "porte"
      ? await db.select({ c: portesCaminhao.codigo }).from(portesCaminhao).where(eq(portesCaminhao.codigo, codigo))
      : await db.select({ c: materiais.codigo }).from(materiais).where(eq(materiais.codigo, codigo));
  return linhas.length > 0;
}

/**
 * Upload de imagem (SPEC §10). O navegador já reduziu o arquivo; aqui o servidor revalida tudo:
 * tamanho, formato real (assinatura dos bytes, nunca o tipo informado) e dimensões.
 */
export async function enviarImagem(formData: FormData): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = envioImagemSchema.safeParse({
    tipo: formData.get("tipo"),
    codigo: formData.get("codigo"),
    arquivo: formData.get("arquivo"),
  });
  if (!p.success) return falha("Escolha um arquivo de imagem.");
  const { tipo, codigo, arquivo } = p.data;

  // confere o tamanho antes de ler o conteúdo
  if (arquivo.size > LIMITES_IMAGEM.maxBytes) {
    return falha(`A imagem tem mais de ${LIMITES_IMAGEM.maxBytes / 1024} KB depois de reduzida. Use uma imagem mais simples.`);
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const v = validarImagem(bytes);
  if (!v.ok) return falha(v.erro);
  if (!(await itemExiste(tipo, codigo))) return falha(tipo === "porte" ? "Porte não encontrado." : "Material não encontrado.");

  const hash = createHash("sha256").update(bytes).digest("hex");
  const url = urlDaImagem(tipo, codigo, hash);
  const dados = Buffer.from(bytes).toString("base64");
  const db = getDb();
  try {
    await executarBatch([
      db
        .insert(imagens)
        .values({ tipo, codigo, tipoMime: v.tipoMime, dados, tamanho: v.tamanho, largura: v.largura, altura: v.altura, hash })
        .onConflictDoUpdate({
          target: [imagens.tipo, imagens.codigo],
          set: {
            tipoMime: v.tipoMime,
            dados,
            tamanho: v.tamanho,
            largura: v.largura,
            altura: v.altura,
            hash,
            atualizadoEm: sql`now()`,
          },
        }),
      tipo === "porte"
        ? db.update(portesCaminhao).set({ imagemUrl: url }).where(eq(portesCaminhao.codigo, codigo))
        : db.update(materiais).set({ imagemUrl: url }).where(eq(materiais.codigo, codigo)),
    ]);
  } catch {
    return falha("Não foi possível salvar a imagem. Tente novamente.");
  }
  recarregar();
  return ok("Imagem salva. Já aparece para o cliente.");
}

const chaveImagemSchema = z.object({
  tipo: z.enum(TIPOS_IMAGEM as [TipoImagem, ...TipoImagem[]]),
  codigo: z.string().regex(CODIGO_REGEX),
});

/** Remove a imagem enviada: o cliente volta a ver o ícone padrão. */
export async function removerImagem(entrada: unknown): Promise<ResultadoConfig> {
  await exigirSessao();
  const p = chaveImagemSchema.safeParse(entrada);
  if (!p.success) return falha("Dados inválidos.");
  const { tipo, codigo } = p.data;
  const db = getDb();
  await executarBatch([
    db.delete(imagens).where(and(eq(imagens.tipo, tipo), eq(imagens.codigo, codigo))),
    tipo === "porte"
      ? db.update(portesCaminhao).set({ imagemUrl: null }).where(eq(portesCaminhao.codigo, codigo))
      : db.update(materiais).set({ imagemUrl: null }).where(eq(materiais.codigo, codigo)),
  ]);
  recarregar();
  return ok("Imagem removida. O cliente volta a ver o ícone padrão.");
}
