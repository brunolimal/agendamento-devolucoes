import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { agendamentos, historico, janelas, mensagensEnviadas } from "@/db/schema";
import { BotaoLembrete } from "@/components/painel/BotaoLembrete";
import { exigirSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { formatarData, formatarDiaSemana, formatarHora, hojeSP, somarDias } from "@/lib/datas";
import { intervaloDoLembrete } from "@/lib/regras";
import { enviadaEm } from "@/lib/templates";

export default async function Lembretes() {
  await exigirSessao();
  const db = getDb();
  const { regras } = await getConfig();
  const hoje = hojeSP();

  // RN-13 (ampliada): de hoje + dias_lembrete até o primeiro dia com janela ativa a partir dele.
  const ativas = await db.selectDistinct({ dia: janelas.diaSemana }).from(janelas).where(eq(janelas.ativo, true));
  const { de, ate } = intervaloDoLembrete(hoje, regras, new Set(ativas.map((a) => a.dia)));

  const confirmados = await db
    .select({ ag: agendamentos, janela: janelas })
    .from(agendamentos)
    .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
    .where(and(eq(agendamentos.status, "CONFIRMADO"), gte(agendamentos.data, de), lte(agendamentos.data, ate)))
    .orderBy(asc(agendamentos.data), asc(janelas.horaInicio));

  const ids = confirmados.map((c) => c.ag.id);
  const [mensagens, eventos] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({ agendamentoId: mensagensEnviadas.agendamentoId, tipo: mensagensEnviadas.tipo, enviadoEm: mensagensEnviadas.enviadoEm })
            .from(mensagensEnviadas)
            .where(and(inArray(mensagensEnviadas.agendamentoId, ids), eq(mensagensEnviadas.tipo, "LEMBRETE"))),
          db
            .select({ agendamentoId: historico.agendamentoId, acao: historico.acao, criadoEm: historico.criadoEm })
            .from(historico)
            .where(and(inArray(historico.agendamentoId, ids), eq(historico.acao, "REAGENDADO"))),
        ]);

  const linhas = confirmados.map(({ ag, janela }) => ({
    ag,
    janela,
    enviada: enviadaEm(
      "LEMBRETE",
      mensagens.filter((m) => m.agendamentoId === ag.id),
      eventos.filter((e) => e.agendamentoId === ag.id),
    ),
  }));
  const pendentes = linhas.filter((l) => !l.enviada);
  const enviados = linhas.filter((l) => l.enviada);

  // Atalho: SOLICITADOS com prazo de decisão vencido (RN-06): data - sla < hoje  =>  data <= hoje + sla - 1
  const limiteVencido = somarDias(hoje, regras.sla_decisao_dias - 1);
  const [{ vencidos }] = await db
    .select({ vencidos: sql<number>`count(*)::int` })
    .from(agendamentos)
    .where(and(eq(agendamentos.status, "SOLICITADO"), lte(agendamentos.data, limiteVencido)));

  const periodo = de === ate ? formatarData(de) : `${formatarData(de)} a ${formatarData(ate)}`;

  const Linha = ({ ag, janela, enviada }: (typeof linhas)[number]) => (
    <li className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <Link href={`/painel/agendamentos/${ag.id}`} className="min-w-0 flex-1">
        <span className="font-semibold">{ag.empresa}</span>
        <span className="text-slate-500"> · {ag.nome}</span>
        <span className="block text-sm text-slate-600">
          {formatarDiaSemana(ag.data)}, {formatarData(ag.data)}, {formatarHora(janela.horaInicio)} às {formatarHora(janela.horaFim)} · {ag.protocolo}
        </span>
      </Link>
      <BotaoLembrete id={ag.id} enviadaEm={enviada ? enviada.toISOString() : null} />
    </li>
  );

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Lembretes</h1>
        <p className="text-slate-600">Agendamentos confirmados de {periodo}.</p>
      </header>

      {vencidos > 0 && (
        <Link
          href={`/painel/agendamentos?status=SOLICITADO&ate=${limiteVencido}`}
          className="block rounded-xl bg-red-50 p-4 font-medium text-red-900 ring-1 ring-red-200"
        >
          {vencidos} solicitaç{vencidos === 1 ? "ão" : "ões"} com prazo de decisão vencido. Ver lista →
        </Link>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Para lembrar ({pendentes.length})</h2>
        {pendentes.length === 0 && <p className="text-slate-500">Nenhum lembrete pendente.</p>}
        <ul className="space-y-2">
          {pendentes.map((l) => (
            <Linha key={l.ag.id} {...l} />
          ))}
        </ul>
      </section>

      {enviados.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Lembretes enviados ({enviados.length})</h2>
          <ul className="space-y-2">
            {enviados.map((l) => (
              <Linha key={l.ag.id} {...l} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
