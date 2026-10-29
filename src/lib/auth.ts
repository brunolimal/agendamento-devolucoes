import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { assinarSessao, COOKIE_SESSAO, DURACAO_SESSAO_SEGUNDOS, verificarSessao } from "./sessao";

function digest(valor: string): Buffer {
  return createHash("sha256").update(valor).digest();
}

export function modoDemo(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Senha do admin (hash bcrypt em env). Com DEMO_MODE=true aceita também DEMO_ADMIN_PASSWORD. */
export async function senhaConfere(senha: string): Promise<boolean> {
  const demo = process.env.DEMO_ADMIN_PASSWORD;
  if (modoDemo() && demo && timingSafeEqual(digest(senha), digest(demo))) return true;

  // No .env.local o "$" do hash precisa ir escapado ("\$"); aceita as duas formas.
  const hash = (process.env.ADMIN_PASSWORD_HASH ?? "").replace(/\\\$/g, "$");
  if (!hash.startsWith("$2")) return false;
  return bcrypt.compare(senha, hash);
}

export async function criarSessao(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, await assinarSessao(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_SEGUNDOS,
  });
}

export async function encerrarSessao(): Promise<void> {
  (await cookies()).delete(COOKIE_SESSAO);
}

export async function temSessao(): Promise<boolean> {
  return verificarSessao((await cookies()).get(COOKIE_SESSAO)?.value);
}

/** Toda Server Action e página do painel chama isto (não confiar só no proxy). */
export async function exigirSessao(): Promise<void> {
  if (!(await temSessao())) redirect("/painel/login");
}
