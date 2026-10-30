import type { statusAgendamento, volumeCarga } from "@/db/schema";
import type { Regras } from "./config";
import { diaSemana, somarDias } from "./datas";

export type Status = (typeof statusAgendamento.enumValues)[number];
export type Volume = (typeof volumeCarga.enumValues)[number];

/** Máquina de estados (SPEC §5). Reagendar não muda o status e fica fora desta tabela. */
export const TRANSICOES: Record<Status, readonly Status[]> = {
  SOLICITADO: ["CONFIRMADO", "RECUSADO", "CANCELADO_CLIENTE", "CANCELADO_EMPRESA"],
  CONFIRMADO: ["CANCELADO_CLIENTE", "CANCELADO_EMPRESA", "CONCLUIDO", "NAO_COMPARECEU"],
  RECUSADO: [],
  CANCELADO_CLIENTE: [],
  CANCELADO_EMPRESA: [],
  CONCLUIDO: [],
  NAO_COMPARECEU: [],
};

export const STATUS_QUE_OCUPAM: readonly Status[] = ["SOLICITADO", "CONFIRMADO"];

export function ocupaVaga(status: Status): boolean {
  return STATUS_QUE_OCUPAM.includes(status);
}

export function podeTransitar(de: Status, para: Status): boolean {
  return TRANSICOES[de].includes(para);
}

/** Reagendar só vale para CONFIRMADO (§5). */
export function podeReagendar(status: Status): boolean {
  return status === "CONFIRMADO";
}

/** Editar dados só enquanto o agendamento ocupa vaga. */
export function podeEditar(status: Status): boolean {
  return ocupaVaga(status);
}

/** §5: true quando porte ou volume é NAO_SEI. */
export function requerAlinhamento(porteCodigo: string, volume: Volume): boolean {
  return porteCodigo === "NAO_SEI" || volume === "NAO_SEI";
}

export type SituacaoPrazo = "NO_PRAZO" | "VENCE_EM_BREVE" | "VENCIDO";

/** RN-06: prazo = data - sla_decisao_dias. Vencido se hoje > prazo; "em breve" se faltar <= 1 dia. */
export function prazoDecisao(data: string, regras: Regras): string {
  return somarDias(data, -regras.sla_decisao_dias);
}

export function classificarPrazo(data: string, hoje: string, regras: Regras): SituacaoPrazo {
  const prazo = prazoDecisao(data, regras);
  if (hoje > prazo) return "VENCIDO";
  if (hoje >= somarDias(prazo, -1)) return "VENCE_EM_BREVE";
  return "NO_PRAZO";
}

/** RN-07: confirmar exige porte e volume definidos. */
export function podeConfirmar(entrada: { porteCodigo: string; volume: Volume }): boolean {
  return entrada.porteCodigo !== "NAO_SEI" && entrada.volume !== "NAO_SEI";
}

/** RN-08: data limite para o cliente cancelar pelo link. */
export function limiteCancelamento(data: string, regras: Regras): string {
  return somarDias(data, -regras.prazo_cancel_dias);
}

/** RN-08: status SOLICITADO/CONFIRMADO e hoje <= data - prazo_cancel_dias. */
export function podeClienteCancelar(status: Status, data: string, hoje: string, regras: Regras): boolean {
  return ocupaVaga(status) && hoje <= limiteCancelamento(data, regras);
}

/** RN-18: concluir / não compareceu só a partir da data do agendamento. */
export function podeFinalizar(status: Status, data: string, hoje: string): boolean {
  return status === "CONFIRMADO" && hoje >= data;
}

/** RN-01: a data está entre hoje+min e hoje+max (inclusive)? */
export function dentroDaAntecedencia(data: string, hoje: string, regras: Regras): boolean {
  return (
    data >= somarDias(hoje, regras.antecedencia_min_dias) && data <= somarDias(hoje, regras.antecedencia_max_dias)
  );
}

/** RN-05 e RN-10: cliente sempre nasce SOLICITADO; manual nasce CONFIRMADO por padrão (checkbox editável). */
export function statusInicial(origem: "CLIENTE" | "PAINEL", confirmar = true): Status {
  return origem === "PAINEL" && confirmar ? "CONFIRMADO" : "SOLICITADO";
}

/** RN-13: data-alvo dos lembretes. */
export function dataDoLembrete(hoje: string, regras: Regras): string {
  return somarDias(hoje, regras.dias_lembrete);
}

/**
 * RN-13 (ampliada): de `hoje + dias_lembrete` até o primeiro dia a partir dele com janela ativa.
 * Na sexta, o alvo (sábado) não tem janela e o intervalo se estende até a segunda.
 */
export function intervaloDoLembrete(
  hoje: string,
  regras: Regras,
  diasComJanela: ReadonlySet<number>,
): { de: string; ate: string } {
  const de = dataDoLembrete(hoje, regras);
  let ate = de;
  for (let i = 0; i < 7 && diasComJanela.size > 0 && !diasComJanela.has(diaSemana(ate)); i++) {
    ate = somarDias(ate, 1);
  }
  return { de, ate };
}
