import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
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
