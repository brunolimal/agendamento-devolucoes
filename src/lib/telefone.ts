export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** RN-17: só dígitos com DDI. 10 ou 11 dígitos ganham o prefixo 55. Válido entre 12 e 13. */
export function normalizarTelefone(valor: string): string | null {
  let d = soDigitos(valor);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

/** Máscara de digitação BR: (11) 98888-7777. */
export function mascararEntrada(valor: string): string {
  let d = soDigitos(valor);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Exibição sem expor o número inteiro: +55 (11) *****-7777. */
export function mascararParaExibir(telefone: string): string {
  const d = soDigitos(telefone);
  if (d.length < 12) return "***";
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) *****-${d.slice(-4)}`;
}
