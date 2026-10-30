import type { Marca, Regras, Templates } from "./config";
import { formatarData, formatarDiaSemana, formatarHora } from "./datas";
import { limiteCancelamento, type Status } from "./regras";

export const VARIAVEIS = [
  "nome",
  "empresa_cliente",
  "protocolo",
  "data",
  "dia_semana",
  "hora_inicio",
  "hora_fim",
  "data_anterior",
  "janela_anterior",
  "porte",
  "materiais",
  "endereco_patio",
  "link_maps",
  "link",
  "limite_cancelamento",
  "motivo",
  "nome_empresa",
] as const;

export type NomeVariavel = (typeof VARIAVEIS)[number];
export type Variaveis = Partial<Record<NomeVariavel, string>>;

/** Substitui {variavel}. Variável sem valor (ou desconhecida) permanece literal, para o colaborador notar. */
export function renderizar(template: string, variaveis: Variaveis): string {
  return template.replace(/\{(\w+)\}/g, (inteiro, nome: string) => {
    const valor = (variaveis as Record<string, string | undefined>)[nome];
    return valor === undefined ? inteiro : valor;
  });
}

export function variaveisDoTemplate(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
}

export function variaveisDesconhecidas(template: string): string[] {
  return variaveisDoTemplate(template).filter((v) => !(VARIAVEIS as readonly string[]).includes(v));
}

export interface ContextoMensagem {
  agendamento: {
    nome: string;
    empresa: string;
    protocolo: string;
    data: string;
    token: string;
    motivo?: string | null;
  };
  janela: { horaInicio: string; horaFim: string };
  porteNome: string;
  materiaisNomes: string[];
  materiaisOutros?: string | null;
  anterior?: { data: string; horaInicio: string; horaFim: string };
  marca: Marca;
  regras: Regras;
  appUrl: string;
}

/** Monta as variáveis da §11 a partir de um agendamento. */
export function montarVariaveis(c: ContextoMensagem): Variaveis {
  const materiais = [...c.materiaisNomes, ...(c.materiaisOutros ? [c.materiaisOutros] : [])].join(", ");
  return {
    nome: c.agendamento.nome,
    empresa_cliente: c.agendamento.empresa,
    protocolo: c.agendamento.protocolo,
    data: formatarData(c.agendamento.data),
    dia_semana: formatarDiaSemana(c.agendamento.data),
    hora_inicio: formatarHora(c.janela.horaInicio),
    hora_fim: formatarHora(c.janela.horaFim),
    ...(c.anterior && {
      data_anterior: formatarData(c.anterior.data),
      janela_anterior: `${formatarHora(c.anterior.horaInicio)} às ${formatarHora(c.anterior.horaFim)}`,
    }),
    porte: c.porteNome,
    materiais,
    endereco_patio: c.marca.endereco_patio,
    link_maps: c.marca.link_maps,
    link: `${c.appUrl}/a/${c.agendamento.token}`,
    limite_cancelamento: formatarData(limiteCancelamento(c.agendamento.data, c.regras)),
    ...(c.agendamento.motivo ? { motivo: c.agendamento.motivo } : {}),
    nome_empresa: c.marca.nome,
  };
}

// ---------------------------------------------------------------- tipos de mensagem (RN-12)

export const TIPOS_MENSAGEM = [
  "CONFIRMACAO",
  "RECUSA",
  "ALINHAMENTO",
  "LEMBRETE",
  "REAGENDAMENTO",
  "CANCELAMENTO_EMPRESA",
  "CANCELAMENTO_CLIENTE_OK",
  "LIVRE",
] as const;

export type TipoMensagem = (typeof TIPOS_MENSAGEM)[number];
export type TipoComTemplate = Exclude<TipoMensagem, "LIVRE">;

/** Chave do template em `configuracao.templates` para cada tipo (LIVRE não tem template). */
export const CHAVE_TEMPLATE: Record<TipoComTemplate, keyof Templates> = {
  CONFIRMACAO: "confirmacao",
  RECUSA: "recusa",
  ALINHAMENTO: "alinhamento",
  LEMBRETE: "lembrete",
  REAGENDAMENTO: "reagendamento",
  CANCELAMENTO_EMPRESA: "cancelamento_empresa",
  CANCELAMENTO_CLIENTE_OK: "cancelamento_cliente_ok",
};

export const ROTULO_TIPO: Record<TipoMensagem, string> = {
  CONFIRMACAO: "Confirmação",
  RECUSA: "Recusa",
  ALINHAMENTO: "Alinhar",
  LEMBRETE: "Lembrete",
  REAGENDAMENTO: "Reagendamento",
  CANCELAMENTO_EMPRESA: "Cancelamento",
  CANCELAMENTO_CLIENTE_OK: "Cancelamento recebido",
  LIVRE: "Mensagem livre",
};

const STATUS_DO_TIPO: Record<TipoMensagem, readonly Status[] | null> = {
  CONFIRMACAO: ["CONFIRMADO"],
  RECUSA: ["RECUSADO"],
  ALINHAMENTO: ["SOLICITADO"],
  LEMBRETE: ["CONFIRMADO"],
  REAGENDAMENTO: ["CONFIRMADO"],
  CANCELAMENTO_EMPRESA: ["CANCELADO_EMPRESA"],
  CANCELAMENTO_CLIENTE_OK: ["CANCELADO_CLIENTE"],
  LIVRE: null, // qualquer status
};

/** Bloqueia, no servidor, tipo de mensagem incompatível com o status. LIVRE vale em qualquer status. */
export function tipoPermitido(tipo: TipoMensagem, status: Status): boolean {
  const permitidos = STATUS_DO_TIPO[tipo];
  return permitidos === null || permitidos.includes(status);
}

/** Ações do histórico que "zeram" o estado de enviada do tipo (um novo reagendamento zera o REAGENDAMENTO). */
const EVENTO_DO_TIPO: Partial<Record<TipoMensagem, readonly string[]>> = {
  CONFIRMACAO: ["CONFIRMADO"],
  RECUSA: ["RECUSADO"],
  REAGENDAMENTO: ["REAGENDADO"],
  LEMBRETE: ["REAGENDADO"], // a data mudou: o lembrete anterior fala da data antiga
  CANCELAMENTO_EMPRESA: ["CANCELADO"],
  CANCELAMENTO_CLIENTE_OK: ["CANCELADO"],
};

/** Quando o tipo foi enviado no estado atual: só conta a mensagem posterior ao último evento correspondente. */
export function enviadaEm(
  tipo: TipoMensagem,
  mensagens: { tipo: string; enviadoEm: Date }[],
  eventos: { acao: string; criadoEm: Date }[],
): Date | null {
  const acoes = EVENTO_DO_TIPO[tipo] ?? [];
  const ultimoEvento = eventos
    .filter((e) => acoes.includes(e.acao))
    .reduce((maior, e) => Math.max(maior, e.criadoEm.getTime()), -Infinity);
  const validas = mensagens.filter((m) => m.tipo === tipo && m.enviadoEm.getTime() >= ultimoEvento);
  if (validas.length === 0) return null;
  return new Date(Math.max(...validas.map((m) => m.enviadoEm.getTime())));
}

/** Lê `de` do histórico REAGENDADO ({data, janela: "08:00–09:00"}) para {data_anterior}/{janela_anterior}. */
export function lerJanelaAnterior(
  detalhes: unknown,
): { data: string; horaInicio: string; horaFim: string } | undefined {
  const de = (detalhes as { de?: { data?: unknown; janela?: unknown } } | null)?.de;
  if (!de || typeof de.data !== "string" || typeof de.janela !== "string") return undefined;
  const [horaInicio, horaFim] = de.janela.split("–").map((s) => s.trim());
  if (!horaInicio || !horaFim) return undefined;
  return { data: de.data, horaInicio, horaFim };
}

/** Mensagens oferecidas no detalhe, conforme o status (LIVRE sempre). */
export function tiposDisponiveis(status: Status, requerAlinhamento: boolean, reagendado: boolean): TipoMensagem[] {
  const tipos: TipoMensagem[] = [];
  if (status === "SOLICITADO" && requerAlinhamento) tipos.push("ALINHAMENTO");
  if (status === "CONFIRMADO") {
    tipos.push("CONFIRMACAO");
    if (reagendado) tipos.push("REAGENDAMENTO");
    tipos.push("LEMBRETE");
  }
  if (status === "RECUSADO") tipos.push("RECUSA");
  if (status === "CANCELADO_EMPRESA") tipos.push("CANCELAMENTO_EMPRESA");
  if (status === "CANCELADO_CLIENTE") tipos.push("CANCELAMENTO_CLIENTE_OK");
  tipos.push("LIVRE");
  return tipos;
}
