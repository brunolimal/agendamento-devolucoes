"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { agendamentos, historico, materiais, portesCaminhao } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { hojeSP, limitesDoMes, mesDe } from "@/lib/datas";
import { buscarDisponibilidade, intervaloCliente } from "@/lib/disponibilidade";
import { gerarToken, prefixoProtocolo } from "@/lib/protocolo";
import { ipAtual, limiteExcedido, registrarTentativa, validarInicio } from "@/lib/rate-limit";
import { dentroDaAntecedencia, requerAlinhamento } from "@/lib/regras";
import { assertVaga, executarBatch, mensagemDoErro, type CodigoErro } from "@/lib/transacao";
import { envioPublicoSchema, errosPorCampo } from "@/lib/validacao";

export interface JanelaPublica {
  janelaId: number;
  horaInicio: string;
  horaFim: string;
  vagas: number;
  disponivel: boolean;
}
export interface DiaPublico {
  data: string;
  disponivel: boolean;
  janelas: JanelaPublica[];
}

const mesSchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  peso: z.number().int().min(1).max(4),
});

/** Passo 1: disponibilidade de um mês. Sem porte escolhido o peso é 1 e a vaga é revalidada no envio. */
export async function buscarDisponibilidadeMes(entrada: unknown): Promise<DiaPublico[]> {
  const parsed = mesSchema.safeParse(entrada);
  if (!parsed.success) return [];
  const { regras } = await getConfig();
  const hoje = hojeSP();
  const { min, max } = intervaloCliente(hoje, regras);
  if (parsed.data.mes < mesDe(min) || parsed.data.mes > mesDe(max)) return [];

  const { de, ate } = limitesDoMes(parsed.data.mes);
  const dias = await buscarDisponibilidade({ de, ate, hoje, regras, peso: parsed.data.peso });
  return dias.map((d) => ({
    data: d.data,
    disponivel: d.disponivel,
    janelas: d.janelas.map((j) => ({
      janelaId: j.janelaId,
      horaInicio: j.horaInicio,
      horaFim: j.horaFim,
      vagas: j.vagas,
      disponivel: j.disponivel,
    })),
  }));
}

export type ResultadoCriacao =
  | { ok: true; protocolo: string }
  | { ok: false; erro: string; campos?: Record<string, string>; codigo?: CodigoErro };

/** Passo 4: cria o agendamento SOLICITADO. assert_vaga + INSERT + histórico numa única transação. */
export async function criarAgendamento(entrada: unknown): Promise<ResultadoCriacao> {
  const parsed = envioPublicoSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, erro: "Confira os campos destacados.", campos: errosPorCampo(parsed.error) };
  }
  const d = parsed.data;

  if (d.website) return { ok: false, erro: "Não foi possível enviar a solicitação." }; // honeypot

  const inicio = validarInicio(d.inicio);
  if (!inicio.ok) {
    return {
      ok: false,
      erro:
        inicio.motivo === "RAPIDO_DEMAIS"
          ? "Você preencheu muito rápido. Aguarde alguns segundos e envie novamente."
          : "O formulário expirou. Recarregue a página e tente de novo.",
    };
  }

  const ip = await ipAtual();
  if (await limiteExcedido("envioPublico", ip)) {
    return { ok: false, erro: "Muitas solicitações em pouco tempo. Tente novamente mais tarde." };
  }
  await registrarTentativa("envioPublico", ip);

  const { regras } = await getConfig();
  const hoje = hojeSP();
  if (!dentroDaAntecedencia(d.data, hoje, regras)) {
    return { ok: false, erro: "Essa data não está disponível, escolha outra.", codigo: "JANELA_INVALIDA" };
  }

  const db = getDb();
  const [porte] = await db
    .select()
    .from(portesCaminhao)
    .where(and(eq(portesCaminhao.codigo, d.porteCodigo), eq(portesCaminhao.ativo, true)));
  if (!porte) return { ok: false, erro: "Tipo de caminhão inválido.", campos: { porteCodigo: "Escolha uma opção" } };

  const codigosMateriais = [...new Set(d.materiais)];
  const encontrados = await db
    .select({ codigo: materiais.codigo })
    .from(materiais)
    .where(and(inArray(materiais.codigo, codigosMateriais), eq(materiais.ativo, true)));
  if (encontrados.length !== codigosMateriais.length) {
    return { ok: false, erro: "Material inválido.", campos: { materiais: "Escolha ao menos um material" } };
  }

  const id = randomUUID();
  const prefixo = prefixoProtocolo(hoje);
  try {
    const resultados = await executarBatch([
      assertVaga({ data: d.data, janelaId: d.janelaId, peso: porte.pesoVagas }),
      db
        .insert(agendamentos)
        .values({
          id,
          protocolo: sql`${prefixo}::text || lpad(nextval('protocolo_seq')::text, 4, '0')`,
          token: gerarToken(),
          data: d.data,
          janelaId: d.janelaId,
          status: "SOLICITADO",
          requerAlinhamento: requerAlinhamento(d.porteCodigo, d.volume),
          origem: "CLIENTE",
          nome: d.nome,
          empresa: d.empresa,
          whatsapp: d.whatsapp,
          contrato: d.contrato,
          materiais: codigosMateriais,
          materiaisOutros: d.materiaisOutros,
          volume: d.volume,
          porteCodigo: d.porteCodigo,
          pesoVagas: porte.pesoVagas,
          placa: d.placa,
          motorista: d.motorista,
          observacoes: d.observacoes,
          aceiteEm: sql`now()`,
        })
        .returning({ protocolo: agendamentos.protocolo }),
      db.insert(historico).values({
        agendamentoId: id,
        autor: "CLIENTE",
        acao: "CRIADO",
        detalhes: { para: { data: d.data, janelaId: d.janelaId, porte: d.porteCodigo, volume: d.volume } },
      }),
    ]);
    const [linha] = resultados[1] as { protocolo: string }[];
    return { ok: true, protocolo: linha.protocolo };
  } catch (e) {
    const { codigo, mensagem } = mensagemDoErro(e, "publico");
    return { ok: false, erro: mensagem, codigo };
  }
}
