// Ilustrações genéricas de caminhão (SVG próprio, sem marca). O tamanho da carroceria varia com o porte.
const MODELOS: Record<string, { corpo: number; rodas: number; articulada?: boolean }> = {
  VUC: { corpo: 34, rodas: 2 },
  TRES_QUARTOS: { corpo: 46, rodas: 2 },
  TOCO: { corpo: 60, rodas: 2 },
  TRUCK: { corpo: 74, rodas: 3 },
  CARRETA: { corpo: 90, rodas: 4, articulada: true },
  NAO_SEI: { corpo: 60, rodas: 2 },
};

export function IlustracaoCaminhao({ codigo, className = "" }: { codigo: string; className?: string }) {
  const m = MODELOS[codigo] ?? MODELOS.TOCO;
  const cabine = 28;
  const x0 = 4;
  const xCorpo = x0 + cabine + 3;
  const largura = xCorpo + m.corpo + 6;
  // rodas: uma sob a cabine e as demais distribuídas na carroceria
  const xs = [x0 + 14, ...Array.from({ length: m.rodas - 1 }, (_, i) => xCorpo + m.corpo - 10 - i * 14)];

  return (
    <svg
      viewBox={`0 0 ${largura} 52`}
      className={className}
      role="img"
      aria-label={`Caminhão ${codigo}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d={`M${x0} 38V16h16l10 12v10z`} />
      <path d={`M${x0 + 6} 20h9l6 8H${x0 + 6}z`} />
      <rect x={xCorpo} y={m.articulada ? 20 : 12} width={m.corpo} height={m.articulada ? 18 : 26} rx="2" />
      {m.articulada && <path d={`M${xCorpo - 3} 38h${m.corpo + 3}`} />}
      {xs.map((x) => (
        <circle key={x} cx={x} cy="42" r="5" fill="white" />
      ))}
      {codigo === "NAO_SEI" && (
        <text x={xCorpo + m.corpo / 2} y="32" textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor" stroke="none">
          ?
        </text>
      )}
    </svg>
  );
}
