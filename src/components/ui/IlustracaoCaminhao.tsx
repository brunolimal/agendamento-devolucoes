// Ilustrações genéricas de caminhão (SVG próprio, sem marca). O tamanho da carroceria varia com o porte.
// O caminhão anda para a DIREITA: carroceria à esquerda, cabine à direita com o para-brisa inclinado para a frente.
const MODELOS: Record<string, { corpo: number; rodas: number; articulada?: boolean }> = {
  VUC: { corpo: 34, rodas: 2 },
  TRES_QUARTOS: { corpo: 46, rodas: 2 },
  TOCO: { corpo: 60, rodas: 2 },
  TRUCK: { corpo: 74, rodas: 3 },
  CARRETA: { corpo: 90, rodas: 4, articulada: true },
  NAO_SEI: { corpo: 60, rodas: 2 },
};

const LARGURA_CABINE = 26;

export function IlustracaoCaminhao({ codigo, className = "" }: { codigo: string; className?: string }) {
  const m = MODELOS[codigo] ?? MODELOS.TOCO;
  const xCorpo = 4;
  const xCabine = xCorpo + m.corpo + 3;
  const largura = xCabine + LARGURA_CABINE + 4;
  // rodas: uma sob a cabine (frente) e as demais distribuídas na carroceria, a partir do fundo
  const xs = [xCabine + 14, ...Array.from({ length: m.rodas - 1 }, (_, i) => xCorpo + 12 + i * 14)];

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
      {/* cabine: lateral traseira reta e para-brisa inclinado voltado para a direita */}
      <path d={`M${xCabine} 38V16h16l10 12v10z`} />
      <path d={`M${xCabine + 5} 20h9l6 8H${xCabine + 5}z`} />
      <rect x={xCorpo} y={m.articulada ? 20 : 12} width={m.corpo} height={m.articulada ? 18 : 26} rx="2" />
      {m.articulada && <path d={`M${xCorpo} 38h${m.corpo + 3}`} />}
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
