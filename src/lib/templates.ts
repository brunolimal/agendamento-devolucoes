import type { Marca, Regras } from "./config";
import { formatarData, formatarDiaSemana, formatarHora } from "./datas";
import { limiteCancelamento } from "./regras";

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
