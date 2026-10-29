import { jwtVerify, SignJWT } from "jose";

// Só jose: este módulo também roda no proxy (sem next/headers, sem bcrypt).
export const COOKIE_SESSAO = "sessao";
export const DURACAO_SESSAO_SEGUNDOS = 12 * 60 * 60;

function chave(): Uint8Array {
  const segredo = process.env.SESSION_SECRET ?? "";
  if (segredo.length < 32) throw new Error("SESSION_SECRET deve ter 32 ou mais caracteres");
  return new TextEncoder().encode(segredo);
}

export async function assinarSessao(): Promise<string> {
  return new SignJWT({ papel: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_SEGUNDOS}s`)
    .sign(chave());
}

export async function verificarSessao(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, chave(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
