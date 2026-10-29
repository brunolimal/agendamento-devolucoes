import { randomBytes } from "node:crypto";

/** RN-16: prefixo `DEV-AAMM-` a partir de uma data yyyy-MM-dd (SP). A sequência vem de protocolo_seq. */
export function prefixoProtocolo(hoje: string): string {
  const [ano, mes] = hoje.split("-");
  return `DEV-${ano.slice(2)}${mes}-`;
}

export function formatarProtocolo(hoje: string, sequencia: number): string {
  return `${prefixoProtocolo(hoje)}${String(sequencia).padStart(4, "0")}`;
}

export function protocoloValido(valor: string): boolean {
  return /^DEV-\d{4}-\d{4,}$/.test(valor);
}

/** RN-16: token de 32 caracteres aleatórios URL-safe. */
export function gerarToken(): string {
  return randomBytes(24).toString("base64url");
}

export function tokenValido(valor: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(valor);
}
