// Imagem enviada pelo painel (porte ou material). Vem de /imagens/..., rota própria: não passa pelo otimizador do Next.
export function ImagemCatalogo({ src, alt = "", className = "" }: { src: string; alt?: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} loading="lazy" decoding="async" />
  );
}
