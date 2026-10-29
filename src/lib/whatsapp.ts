import { soDigitos } from "./telefone";

/** SPEC §11: https://wa.me/{numero}?text={texto}. */
export function linkWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${soDigitos(numero)}?text=${encodeURIComponent(texto)}`;
}

/** Botão "Falar com a logística" da página do cliente. */
export function linkLogistica(whatsappEmpresa: string, protocolo: string): string {
  return linkWhatsapp(whatsappEmpresa, `Olá! Sobre o agendamento ${protocolo}: `);
}
