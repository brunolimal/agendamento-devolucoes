import { TZDate } from "@date-fns/tz";
import { addDays, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const FUSO = "America/Sao_Paulo";

/** Instante atual no fuso de São Paulo. `agora` existe para os testes. */
export function agoraSP(agora: Date = new Date()): TZDate {
  return new TZDate(agora.getTime(), FUSO);
}

/** Data de hoje em São Paulo, no formato yyyy-MM-dd. */
export function hojeSP(agora?: Date): string {
  return format(agoraSP(agora), "yyyy-MM-dd");
}

/** Converte um instante (Date, ISO ou yyyy-MM-dd) para TZDate em São Paulo. */
function paraSP(valor: Date | string): TZDate {
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [ano, mes, dia] = valor.split("-").map(Number);
    return new TZDate(ano, mes - 1, dia, FUSO);
  }
  return new TZDate(new Date(valor).getTime(), FUSO);
}

/** dd/MM/yyyy */
export function formatarData(valor: Date | string): string {
  return format(paraSP(valor), "dd/MM/yyyy", { locale: ptBR });
}

/** dd/MM/yyyy HH:mm */
export function formatarDataHora(valor: Date | string): string {
  return format(paraSP(valor), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/** Ex.: "segunda-feira, 05 de janeiro" */
export function formatarDiaExtenso(valor: Date | string): string {
  return format(paraSP(valor), "EEEE, dd 'de' MMMM", { locale: ptBR });
}

/** Soma `n` dias (pode ser negativo) a uma data yyyy-MM-dd. */
export function somarDias(data: string, n: number): string {
  return format(addDays(paraSP(data), n), "yyyy-MM-dd");
}

/** Dia da semana de uma data yyyy-MM-dd (0 = domingo, igual ao extract(dow)). */
export function diaSemana(data: string): number {
  return paraSP(data).getDay();
}

/** Instante (UTC) de uma data yyyy-MM-dd e hora HH:mm no fuso de São Paulo. */
export function instanteSP(data: string, hora = "12:00"): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  return new Date(new TZDate(ano, mes - 1, dia, h, m, FUSO).getTime());
}

/** Dia da semana por extenso, ex.: "segunda-feira". */
export function formatarDiaSemana(valor: Date | string): string {
  return format(paraSP(valor), "EEEE", { locale: ptBR });
}

/** "08:00:00" -> "08:00". */
export function formatarHora(hora: string): string {
  return hora.slice(0, 5);
}

/** Primeiro e último dia de um mês "yyyy-MM". */
export function limitesDoMes(mes: string): { de: string; ate: string } {
  const de = `${mes}-01`;
  return { de, ate: format(endOfMonth(paraSP(de)), "yyyy-MM-dd") };
}

/** Todas as datas de `de` até `ate` (inclusive). */
export function listarDias(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/** "yyyy-MM" a partir de uma data yyyy-MM-dd. */
export function mesDe(data: string): string {
  return data.slice(0, 7);
}

/** "2026-03" -> "março de 2026". */
export function formatarMes(mes: string): string {
  return format(paraSP(`${mes}-01`), "MMMM 'de' yyyy", { locale: ptBR });
}
