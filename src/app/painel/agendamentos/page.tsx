import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { z } from "zod";
import { getDb } from "@/db";
import { agendamentos, janelas, statusAgendamento } from "@/db/schema";
import { StatusBadge, ROTULO_STATUS } from "@/components/ui/StatusBadge";
import { exigirSessao } from "@/lib/auth";
import { formatarData, formatarHora } from "@/lib/datas";

const LIMITE = 100;

const filtroSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(statusAgendamento.enumValues).optional(),
  de: z.iso.date().optional(),
  ate: z.iso.date().optional(),
});

const vazioParaUndefined = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : undefined);

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/30";

export default async function ListaAgendamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirSessao();
  const bruto = await searchParams;
  const parsed = filtroSchema.safeParse({
    q: vazioParaUndefined(bruto.q),
    status: vazioParaUndefined(bruto.status),
    de: vazioParaUndefined(bruto.de),
    ate: vazioParaUndefined(bruto.ate),
  });
  const filtro = parsed.success ? parsed.data : {};

  const condicoes: SQL[] = [];
  if (filtro.q) {
    const like = `%${filtro.q.replace(/[\\%_]/g, "\\$&")}%`;
    const busca = or(
      ilike(agendamentos.protocolo, like),
      ilike(agendamentos.nome, like),
      ilike(agendamentos.empresa, like),
      ilike(agendamentos.contrato, like),
    );
    if (busca) condicoes.push(busca);
  }
  if (filtro.status) condicoes.push(eq(agendamentos.status, filtro.status));
  if (filtro.de) condicoes.push(gte(agendamentos.data, filtro.de));
  if (filtro.ate) condicoes.push(lte(agendamentos.data, filtro.ate));

  const linhas = await getDb()
    .select({ ag: agendamentos, janela: janelas })
    .from(agendamentos)
    .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(agendamentos.data), desc(janelas.horaInicio))
    .limit(LIMITE);

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <h1 className="text-2xl font-bold">Agendamentos</h1>

      <form method="get" className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-5">
        <input name="q" defaultValue={filtro.q} placeholder="Protocolo, nome, empresa ou contrato" className={`${campo} lg:col-span-2`} />
        <select name="status" defaultValue={filtro.status ?? ""} className={campo}>
          <option value="">Todos os status</option>
          {statusAgendamento.enumValues.map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS[s]}
            </option>
          ))}
        </select>
        <input type="date" name="de" defaultValue={filtro.de} aria-label="De" className={campo} />
        <input type="date" name="ate" defaultValue={filtro.ate} aria-label="Até" className={campo} />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <button type="submit" className="rounded-lg bg-primaria px-5 py-2 text-sm font-semibold text-white">
            Filtrar
          </button>
          <Link href="/painel/agendamentos" className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700">
            Limpar
          </Link>
        </div>
      </form>

      <p className="text-sm text-slate-500">
        {linhas.length === LIMITE ? `Mostrando os ${LIMITE} mais recentes. Refine o filtro.` : `${linhas.length} resultado(s)`}
      </p>

      <ul className="space-y-2">
        {linhas.map(({ ag, janela }) => (
          <li key={ag.id}>
            <Link
              href={`/painel/agendamentos/${ag.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-primaria"
            >
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{ag.empresa}</span>
                <span className="text-slate-500"> · {ag.nome}</span>
                <span className="block text-sm text-slate-600">
                  {ag.protocolo} · {formatarData(ag.data)}, {formatarHora(janela.horaInicio)} às {formatarHora(janela.horaFim)} · contrato {ag.contrato}
                </span>
              </span>
              <StatusBadge status={ag.status} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
