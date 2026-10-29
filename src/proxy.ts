import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, verificarSessao } from "./lib/sessao";

// Next 16: substitui o antigo middleware.ts. Protege /painel/* exceto /painel/login.
// As Server Actions e páginas do painel revalidam a sessão por conta própria (exigirSessao).
export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/painel/login") return NextResponse.next();
  if (await verificarSessao(req.cookies.get(COOKIE_SESSAO)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/painel/login", req.url));
}

export const config = { matcher: ["/painel/:path*"] };
