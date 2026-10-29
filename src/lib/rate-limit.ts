import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { tentativasPublicas } from "@/db/schema";

export const LIMITES = {
  /** SPEC §9: 10 envios por IP por hora. */
  envioPublico: { prefixo: "pub:", max: 10, minutos: 60 },
  /** SPEC §14: 5 tentativas erradas por IP a cada 15 min. */
  login: { prefixo: "login:", max: 5, minutos: 15 },
} as const;

export type TipoLimite = keyof typeof LIMITES;

export function hashIp(ip: string, salt: string = process.env.IP_HASH_SALT ?? ""): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function extrairIp(h: { get(nome: string): string | null }): string {
  const encaminhado = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return encaminhado || h.get("x-real-ip")?.trim() || "desconhecido";
}

export async function ipAtual(): Promise<string> {
  return extrairIp(await headers());
}

export function excedeuLimite(contagem: number, max: number): boolean {
  return contagem >= max;
}

function chave(tipo: TipoLimite, ip: string): string {
  return `${LIMITES[tipo].prefixo}${hashIp(ip)}`;
}

async function contar(tipo: TipoLimite, ip: string): Promise<number> {
  const { minutos } = LIMITES[tipo];
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(tentativasPublicas)
    .where(
      and(
        eq(tentativasPublicas.ipHash, chave(tipo, ip)),
        gt(tentativasPublicas.criadoEm, sql`now() - make_interval(mins => ${minutos}::int)`),
      ),
    );
  return r?.n ?? 0;
}

export async function limiteExcedido(tipo: TipoLimite, ip: string): Promise<boolean> {
  return excedeuLimite(await contar(tipo, ip), LIMITES[tipo].max);
}

/** Registra uma tentativa (envio público) ou falha (login) e apaga registros com mais de 1 dia. */
export async function registrarTentativa(tipo: TipoLimite, ip: string): Promise<void> {
  const db = getDb();
  await db.insert(tentativasPublicas).values({ ipHash: chave(tipo, ip) });
  await db.delete(tentativasPublicas).where(lt(tentativasPublicas.criadoEm, sql`now() - interval '1 day'`));
}

// Tempo mínimo de preenchimento (SPEC §9): o formulário recebe um instante assinado ao abrir.
// Date.now() aqui é medição técnica de intervalo, não regra de negócio de data.
function assinatura(instante: string): string {
  return createHmac("sha256", `${process.env.SESSION_SECRET ?? ""}|inicio`).update(instante).digest("hex");
}

export function assinarInicio(agora: number = Date.now()): string {
  const instante = String(agora);
  return `${instante}.${assinatura(instante)}`;
}

export function validarInicio(
  token: string,
  minimoSegundos = 5,
  agora: number = Date.now(),
): { ok: true } | { ok: false; motivo: "INVALIDO" | "RAPIDO_DEMAIS" } {
  const [instante, assinado] = token.split(".");
  if (!instante || !assinado || !/^\d+$/.test(instante)) return { ok: false, motivo: "INVALIDO" };
  const esperado = Buffer.from(assinatura(instante));
  const recebido = Buffer.from(assinado);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    return { ok: false, motivo: "INVALIDO" };
  }
  if (agora - Number(instante) < minimoSegundos * 1000) return { ok: false, motivo: "RAPIDO_DEMAIS" };
  return { ok: true };
}
