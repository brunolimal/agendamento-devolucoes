import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agendamentos, bloqueios, capacidadeExcecoes, janelas } from "@/db/schema";
import type { Regras } from "./config";
import { diaSemana, listarDias, somarDias } from "./datas";
import { STATUS_QUE_OCUPAM } from "./regras";

export interface JanelaBase {
  id: number;
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  capacidade: number;
}

export interface JanelaDisponivel {
  janelaId: number;
  horaInicio: string;
  horaFim: string;
  capacidade: number;
  ocupado: number;
  vagas: number;
  bloqueada: boolean;
  disponivel: boolean;
}

export interface DiaDisponivel {
  data: string;
  disponivel: boolean;
  janelas: JanelaDisponivel[];
}

export interface EntradaDisponibilidade {
  de: string;
  ate: string;
  hoje: string;
  regras: Regras;
  /** RN-04: peso do porte (1 se ainda não escolhido). */
  peso: number;
  janelas: JanelaBase[];
  excecoes: { data: string; janelaId: number; capacidade: number }[];
  bloqueios: { data: string; janelaId: number | null }[];
  ocupacao: { data: string; janelaId: number; ocupado: number }[];
  /** Painel (RN-10): ignora antecedência mínima e máxima. */
  ignorarLimites?: boolean;
}

/** RN-01: primeira e última data que o cliente pode escolher. */
export function intervaloCliente(hoje: string, regras: Regras): { min: string; max: string } {
  return { min: somarDias(hoje, regras.antecedencia_min_dias), max: somarDias(hoje, regras.antecedencia_max_dias) };
}

/** RN-02: capacidade efetiva = exceção da data, se houver, senão a da janela. */
export function capacidadeEfetiva(capacidadeJanela: number, excecao?: number): number {
  return excecao ?? capacidadeJanela;
}

/** Cálculo puro (RN-01, RN-02, RN-04). */
export function calcularDisponibilidade(e: EntradaDisponibilidade): DiaDisponivel[] {
  const { min, max } = intervaloCliente(e.hoje, e.regras);
  const excecoes = new Map(e.excecoes.map((x) => [`${x.data}|${x.janelaId}`, x.capacidade]));
  const ocupacao = new Map(e.ocupacao.map((x) => [`${x.data}|${x.janelaId}`, x.ocupado]));

  return listarDias(e.de, e.ate).map((data) => {
    const foraDaFaixa = !e.ignorarLimites && (data < min || data > max);
    if (foraDaFaixa) return { data, disponivel: false, janelas: [] };

    const doDia = e.janelas
      .filter((j) => j.diaSemana === diaSemana(data))
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    const lista = doDia.map((j): JanelaDisponivel => {
      const capacidade = capacidadeEfetiva(j.capacidade, excecoes.get(`${data}|${j.id}`));
      const ocupado = ocupacao.get(`${data}|${j.id}`) ?? 0;
      const vagas = Math.max(capacidade - ocupado, 0);
      const bloqueada = e.bloqueios.some((b) => b.data === data && (b.janelaId === null || b.janelaId === j.id));
      return {
        janelaId: j.id,
        horaInicio: j.horaInicio,
        horaFim: j.horaFim,
        capacidade,
        ocupado,
        vagas,
        bloqueada,
        disponivel: !bloqueada && vagas >= e.peso,
      };
    });
    return { data, disponivel: lista.some((j) => j.disponivel), janelas: lista };
  });
}

/** Carrega os dados do banco e calcula a disponibilidade de um intervalo. */
export async function buscarDisponibilidade(
  entrada: Pick<EntradaDisponibilidade, "de" | "ate" | "hoje" | "regras" | "peso" | "ignorarLimites">,
): Promise<DiaDisponivel[]> {
  const db = getDb();
  const [lj, ex, bl, oc] = await db.batch([
    db.select().from(janelas).where(sql`${janelas.ativo}`),
    db
      .select()
      .from(capacidadeExcecoes)
      .where(and(gte(capacidadeExcecoes.data, entrada.de), lte(capacidadeExcecoes.data, entrada.ate))),
    db.select().from(bloqueios).where(and(gte(bloqueios.data, entrada.de), lte(bloqueios.data, entrada.ate))),
    db
      .select({
        data: agendamentos.data,
        janelaId: agendamentos.janelaId,
        ocupado: sql<number>`coalesce(sum(${agendamentos.pesoVagas}), 0)::int`,
      })
      .from(agendamentos)
      .where(
        and(
          gte(agendamentos.data, entrada.de),
          lte(agendamentos.data, entrada.ate),
          inArray(agendamentos.status, [...STATUS_QUE_OCUPAM]),
        ),
      )
      .groupBy(agendamentos.data, agendamentos.janelaId),
  ]);
  return calcularDisponibilidade({
    ...entrada,
    janelas: lj.map((j) => ({ ...j })),
    excecoes: ex,
    bloqueios: bl,
    ocupacao: oc,
  });
}
