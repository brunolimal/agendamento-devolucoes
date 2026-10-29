// A sincronização em si entra na etapa do Google Calendar (RN-14, SPEC §12).
// Por ora só o estado inicial de `calendar_sync` ao ocupar/alterar um agendamento.

export function calendarConfigurado(): boolean {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "";
  const chave = process.env.GOOGLE_PRIVATE_KEY ?? "";
  const agenda = process.env.GOOGLE_CALENDAR_ID ?? "";
  return email.includes("@") && chave.length > 30 && agenda.length > 3;
}

/** RN-14: DESATIVADO sem variáveis do Google; senão PENDENTE para a sincronização pegar depois. */
export function estadoSyncPendente(): "PENDENTE" | "DESATIVADO" {
  return calendarConfigurado() ? "PENDENTE" : "DESATIVADO";
}
