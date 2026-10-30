// Regras puras do editor de janelas (SPEC §10): sobreposição e cópia para outros dias.

export const NOMES_DIA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
/** Ordem de exibição: segunda a domingo (no banco, 0 = domingo). */
export const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

/** "08:00:00" -> "08:00". */
export function normalizarHora(hora: string): string {
  return hora.slice(0, 5);
}

export function paraMinutos(hora: string): number {
  const [h, m] = normalizarHora(hora).split(":").map(Number);
  return h * 60 + m;
}

export interface JanelaHorario {
  horaInicio: string;
  horaFim: string;
}

/** Primeiro par de janelas que se sobrepõem (janelas encostadas, como 08–09 e 09–10, não se sobrepõem). */
export function encontrarSobreposicao<T extends JanelaHorario>(lista: T[]): [T, T] | null {
  const ordenada = [...lista].sort((a, b) => paraMinutos(a.horaInicio) - paraMinutos(b.horaInicio));
  for (let i = 0; i < ordenada.length; i++) {
    for (let j = i + 1; j < ordenada.length; j++) {
      const a = ordenada[i];
      const b = ordenada[j];
      if (paraMinutos(b.horaInicio) < paraMinutos(a.horaFim)) return [a, b];
    }
  }
  return null;
}

export function descreverJanela(j: JanelaHorario): string {
  return `${normalizarHora(j.horaInicio)}–${normalizarHora(j.horaFim)}`;
}

export interface JanelaOrigem extends JanelaHorario {
  capacidade: number;
}
export interface JanelaExistente extends JanelaOrigem {
  id: number;
  ativo: boolean;
}

export interface PlanoDeCopia {
  atualizar: { id: number; capacidade: number }[];
  criar: (JanelaOrigem & { ativo: true })[];
  /** Existentes no destino que não estão na origem: serão removidas (ou desativadas, se tiverem referências). */
  descartar: number[];
}

/**
 * Copiar os horários de um dia para outro: casa por início+fim, atualiza a capacidade,
 * cria o que falta e marca para descarte o que sobra.
 */
export function planejarCopia(origem: JanelaOrigem[], existentes: JanelaExistente[]): PlanoDeCopia {
  const chave = (j: JanelaHorario) => `${normalizarHora(j.horaInicio)}-${normalizarHora(j.horaFim)}`;
  const livres = new Map<string, JanelaExistente[]>();
  for (const e of existentes) livres.set(chave(e), [...(livres.get(chave(e)) ?? []), e]);

  const plano: PlanoDeCopia = { atualizar: [], criar: [], descartar: [] };
  for (const o of origem) {
    const par = livres.get(chave(o))?.shift();
    if (par) plano.atualizar.push({ id: par.id, capacidade: o.capacidade });
    else
      plano.criar.push({
        horaInicio: normalizarHora(o.horaInicio),
        horaFim: normalizarHora(o.horaFim),
        capacidade: o.capacidade,
        ativo: true,
      });
  }
  for (const restantes of livres.values()) plano.descartar.push(...restantes.map((r) => r.id));
  return plano;
}
