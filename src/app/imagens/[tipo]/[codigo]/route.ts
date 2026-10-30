import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { imagens } from "@/db/schema";
import { CODIGO_REGEX, TIPOS_IMAGEM, type TipoImagem } from "@/lib/imagem";

const paramsSchema = z.object({
  tipo: z.enum(TIPOS_IMAGEM as [TipoImagem, ...TipoImagem[]]),
  codigo: z.string().regex(CODIGO_REGEX),
});

const naoEncontrada = () => new Response("Não encontrada", { status: 404 });

/**
 * Serve a imagem enviada pelo painel (pública: o cliente precisa vê-la).
 * Com `?v=<hash>` na URL o cache é imutável; sem ela, revalida por ETag.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string; codigo: string }> }) {
  const p = paramsSchema.safeParse(await params);
  if (!p.success) return naoEncontrada();

  const [img] = await getDb()
    .select()
    .from(imagens)
    .where(and(eq(imagens.tipo, p.data.tipo), eq(imagens.codigo, p.data.codigo)));
  if (!img) return naoEncontrada();

  const etag = `"${img.hash}"`;
  const versao = new URL(req.url).searchParams.get("v") ?? "";
  const imutavel = versao.length >= 8 && img.hash.startsWith(versao);
  const cabecalhos: Record<string, string> = {
    ETag: etag,
    "Cache-Control": imutavel ? "public, max-age=31536000, immutable" : "public, max-age=300, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  };

  const condicional = req.headers.get("if-none-match");
  if (condicional && condicional.split(",").map((v) => v.trim()).includes(etag)) {
    return new Response(null, { status: 304, headers: cabecalhos });
  }

  const corpo = new Uint8Array(Buffer.from(img.dados, "base64"));
  return new Response(corpo, {
    headers: {
      ...cabecalhos,
      "Content-Type": img.tipoMime,
      "Content-Length": String(corpo.length),
      "Content-Disposition": "inline",
    },
  });
}
