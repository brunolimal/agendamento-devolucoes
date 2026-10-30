import { and, asc, between, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { z } from "zod";
import { getDb } from "@/db";
import { agendamentos, bloqueios, janelas } from "@/db/schema";
import { COR_STATUS, ROTULO_STATUS } from "@/components/ui/StatusBadge";
import { exigirSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { buscarDisponibilidade, type JanelaDisponivel } from "@/lib/disponibilidade";
import { formatarDiaSemana, formatarHora, hojeSP, intervaloDaVisao, somarDias } from "@/lib/datas";
import type { Status } from "@/lib/regras";

const paramsSchema = z.object({
  visao: z.enum(["dia", "semana"]).catch("semana"),
  data: z.iso.date().optional().catch(undefined),
  cancelados: z.literal("1").optional().catch(undefined),
});

const OCULTOS_POR_PADRAO: Status[] = ["RECUSADO", "CANCELADO_CLIENTE", "CANCELADO_EMPRESA"];
const TODOS_OS_STATUS: Status[] = [
  "SOLICITADO",
  "CONFIRMADO",
  "CONCLUIDO",
  "NAO_COMPARECEU",
  ...OCULTOS_POR_PADRAO,
];

const primeiro = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const diaMes = (data: string) => `${data.slice(8)}/${data.slice(5, 7)}`;

/** Ocupação X/Y: a contagem nunca inclui cancelados/recusados (RN-02). */
function Ocupacao({ ocupado, capacidade }: { ocupado: number; capacidade: number }) {
  const cheia = capacidade > 0 && ocupado >= capacidade;
  const classe = cheia
    ? "bg-red-100 text-red-900 ring-red-300"
    : ocupado > 0
      ? "bg-amber-100 text-amber-900 ring-amber-300"
      : "bg-slate-100 text-slate-700 ring-slate-300";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${classe}`} title="Ocupação (vagas usadas / capacidade)">
      {ocupado}/{capacidade}
    </span>
  );
}

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirSessao();
  const bruto = await searchParams;
  const p = paramsSchema.parse({ visao: primeiro(bruto.visao), data: primeiro(bruto.data), cancelados: primeiro(bruto.cancelados) });
  const { regras } = await getConfig();
  const hoje = hojeSP();
  const data = p.data ?? hoje;
  const visao = p.visao;
  const mostrarCancelados = p.cancelados === "1";
  const { de, ate } = intervaloDaVisao(data, visao);

  const db = getDb();
  const [dias, linhas, listaBloqueios] = await Promise.all([
    buscarDisponibilidade({ de, ate, hoje, regras, peso: 1, ignorarLimites: true }),
    db
      .select({ ag: agendamentos, janela: janelas })
      .from(agendamentos)
      .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
      .where(
        and(
          between(agendamentos.data, de, ate),
          inArray(agendamentos.status, mostrarCancelados ? TODOS_OS_STATUS : TODOS_OS_STATUS.filter((s) => !OCULTOS_POR_PADRAO.includes(s))),
        ),
      )
      .orderBy(asc(agendamentos.data), asc(janelas.horaInicio), asc(agendamentos.protocolo)),
    db.select().from(bloqueios).where(between(bloqueios.data, de, ate)),
  ]);

  const href = (o: { visao?: "dia" | "semana"; data?: string; cancelados?: boolean }) => {
    const q = new URLSearchParams({ visao: o.visao ?? visao, data: o.data ?? data });
    if (o.cancelados ?? mostrarCancelados) q.set("cancelados", "1");
    return `/painel/agenda?${q.toString()}`;
  };
  const passo = visao === "dia" ? 1 : 7;
  const titulo =
    visao === "dia" ? `${formatarDiaSemana(de)}, ${diaMes(de)}` : `Semana de ${diaMes(de)} a ${diaMes(ate)}`;
  const botao = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700";
  const botaoAtivo = "rounded-lg bg-primaria px-3 py-2 text-sm font-semibold text-white";

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ data: somarDias(data, -passo) })} className={botao} aria-label="Anterior">
            ‹
          </Link>
          <Link href={href({ data: hoje })} className={botao}>
            Hoje
          </Link>
          <Link href={href({ data: somarDias(data, passo) })} className={botao} aria-label="Próximo">
            ›
          </Link>
          <span className="px-2 font-semibold capitalize">{titulo}</span>
          <span className="ml-auto flex gap-2">
            <Link href={href({ visao: "dia" })} className={visao === "dia" ? botaoAtivo : botao}>
              Dia
            </Link>
            <Link href={href({ visao: "semana" })} className={visao === "semana" ? botaoAtivo : botao}>
              Semana
            </Link>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="visao" value={visao} />
            {mostrarCancelados && <input type="hidden" name="cancelados" value="1" />}
            <input
              type="date"
              name="data"
              defaultValue={data}
              aria-label="Ir para a data"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <button type="submit" className={botao}>
              Ir
            </button>
          </form>
          <Link href={href({ cancelados: !mostrarCancelados })} className={mostrarCancelados ? botaoAtivo : botao}>
            {mostrarCancelados ? "Ocultar cancelados" : "Mostrar cancelados"}
          </Link>
        </div>
      </header>

      <div className={visao === "semana" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-4"}>
        {dias.map((dia) => {
          const doDia = linhas.filter((l) => l.ag.data === dia.data);
          const bloqueiosDoDia = listaBloqueios.filter((b) => b.data === dia.data);
          const motivoPorJanela = new Map(bloqueiosDoDia.filter((b) => b.janelaId !== null).map((b) => [b.janelaId, b.motivo]));
          const diaInteiro = bloqueiosDoDia.find((b) => b.janelaId === null);

          // janelas ativas do dia + janelas já inativas que ainda têm agendamentos
          const ativas: JanelaDisponivel[] = dia.janelas;
          const idsAtivas = new Set(ativas.map((j) => j.janelaId));
          const inativas = [...new Map(doDia.filter((l) => !idsAtivas.has(l.janela.id)).map((l) => [l.janela.id, l.janela])).values()];

          return (
            <section
              key={dia.data}
              className={`space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ${dia.data === hoje ? "ring-primaria" : "ring-slate-200"}`}
            >
              <h2 className="flex flex-wrap items-center gap-2 font-semibold capitalize">
                {formatarDiaSemana(dia.data)} {diaMes(dia.data)}
                {dia.data === hoje && <span className="rounded-full bg-primaria px-2 py-0.5 text-xs text-white">hoje</span>}
              </h2>
              {diaInteiro && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">Dia bloqueado: {diaInteiro.motivo}</p>
              )}
              {ativas.length === 0 && inativas.length === 0 && <p className="text-sm text-slate-500">Sem janelas neste dia.</p>}

              {ativas.map((j) => {
                const chips = doDia.filter((l) => l.ag.janelaId === j.janelaId);
                return (
                  <div key={j.janelaId} className="space-y-1.5 border-t border-slate-100 pt-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">
                        {formatarHora(j.horaInicio)} às {formatarHora(j.horaFim)}
                      </span>
                      <Ocupacao ocupado={j.ocupado} capacidade={j.capacidade} />
                      {motivoPorJanela.has(j.janelaId) && (
                        <span className="text-xs text-red-800">bloqueada: {motivoPorJanela.get(j.janelaId)}</span>
                      )}
                    </div>
                    {chips.map(({ ag }) => (
                      <Chip key={ag.id} ag={ag} />
                    ))}
                  </div>
                );
              })}

              {inativas.map((janela) => (
                <div key={janela.id} className="space-y-1.5 border-t border-slate-100 pt-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">
                      {formatarHora(janela.horaInicio)} às {formatarHora(janela.horaFim)}
                    </span>
                    <span className="text-xs text-slate-500">janela desativada</span>
                  </div>
                  {doDia
                    .filter((l) => l.janela.id === janela.id)
                    .map(({ ag }) => (
                      <Chip key={ag.id} ag={ag} />
                    ))}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function Chip({ ag }: { ag: typeof agendamentos.$inferSelect }) {
  return (
    <Link
      href={`/painel/agendamentos/${ag.id}`}
      className={`block rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset ${COR_STATUS[ag.status]}`}
      title={ROTULO_STATUS[ag.status]}
    >
      <span className="font-semibold">{ag.empresa}</span>
      <span className="opacity-80">
        {" "}
        · {ag.porteCodigo}
        {ag.requerAlinhamento ? " · ⚠️ alinhar" : ""}
      </span>
      <span className="block text-xs opacity-80">
        {ROTULO_STATUS[ag.status]} · {ag.protocolo}
      </span>
    </Link>
  );
}
