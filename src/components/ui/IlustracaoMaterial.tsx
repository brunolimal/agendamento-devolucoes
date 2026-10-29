// Ícones genéricos de material (SVG próprio).
export function IlustracaoMaterial({ codigo, className = "" }: { codigo: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label={codigo}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {codigo === "ESCORAS" && (
        <>
          <path d="M12 6v28M20 6v28M28 6v28" />
          <path d="M8 34h8M16 34h8M24 34h8M8 6h8M16 6h8M24 6h8" />
        </>
      )}
      {codigo === "FORMAS" && (
        <>
          <rect x="6" y="8" width="28" height="24" rx="2" />
          <path d="M6 16h28M6 24h28M16 8v24M26 8v24" />
        </>
      )}
      {codigo === "ANDAIMES" && (
        <>
          <rect x="8" y="6" width="24" height="28" />
          <path d="M8 6l24 28M32 6L8 34M8 20h24" />
        </>
      )}
      {codigo === "PERFIS_VIGAS" && (
        <>
          <path d="M8 8h24M8 32h24M20 8v24" />
        </>
      )}
      {codigo === "TORRES" && (
        <>
          <path d="M14 4v32M26 4v32M14 12h12M14 20h12M14 28h12M14 12l12 8M26 12l-12 8M14 20l12 8M26 20l-12 8" />
        </>
      )}
      {codigo === "ACESSORIOS" && (
        <>
          <path d="M20 6l11 6v12l-11 6-11-6V12z" />
          <circle cx="20" cy="18" r="4" />
        </>
      )}
      {!["ESCORAS", "FORMAS", "ANDAIMES", "PERFIS_VIGAS", "TORRES", "ACESSORIOS"].includes(codigo) && (
        <>
          <path d="M6 14l14-8 14 8v14l-14 8-14-8z" />
          <path d="M6 14l14 8 14-8M20 22v14" />
        </>
      )}
    </svg>
  );
}
