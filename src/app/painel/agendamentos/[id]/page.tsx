import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { agendamentos, historico, janelas, materiais, mensagensEnviadas, portesCaminhao } from "@/db/schema";
import { AcoesAgendamento } from "@/components/painel/AcoesAgendamento";
import { SeloAlinhar, SeloPrazo } from "@/components/painel/SeloPrazo";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { exigirSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { formatarData, formatarDataHora, formatarDiaExtenso, formatarHora, hojeSP } from "@/lib/datas";
import { classificarPrazo, ocupaVaga, podeEditar, podeFinalizar, podeReagendar, prazoDecisao } from "@/lib/regras";
import { idSchema } from "@/lib/validacao";

const VOLUME: Record<string, string> = { PEQUENO: "Pequeno", MEDIO: "Médio", GRANDE: "Grande", NAO_SEI: "Não informado" };
const ROTULO_ACAO: Record<string, string> = {
  CRIADO: "Criado",
  CONFIRMADO: "Confirmado",
  RECUSADO: "Recusado",
  REAGENDADO: "Reagendado",
  CANCELADO: "Cancelado",
  EDITADO: "Editado",
  CONCLUIDO: "Concluído",
  NAO_COMPARECEU: "Não compareceu",
  FORCOU_VAGA: "Forçou a vaga",
};
const ROTULO_AUTOR: Record<string, string> = { CLIENTE: "Cliente", ADMIN: "Colaborador", SISTEMA: "Sistema" };

function texto(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Resume o JSON de `detalhes` em linhas legíveis ("campo: antes → depois"). */
function descreverDetalhes(detalhes: unknown): string[] {
  if (!detalhes || typeof detalhes !== "object") return [];
  const d = detalhes as { de?: Record<string, unknown>; para?: Record<string, unknown>; motivo?: string };
  const linhas: string[] = [];
  if (d.para && typeof d.para === "object") {
    for (const chave of Object.keys(d.para)) {
      const antes = d.de?.[chave];
      linhas.push(d.de && chave in d.de ? `${chave}: ${texto(antes)} → ${texto(d.para[chave])}` : `${chave}: ${texto(d.para[chave])}`);
    }
  }
  if (d.motivo) linhas.push(`motivo: ${d.motivo}`);
  return linhas;
}

export default async function DetalheAgendamento({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const db = getDb();
  const [linha] = await db
    .select({ ag: agendamentos, janela: janelas, porte: portesCaminhao })
    .from(agendamentos)
    .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
    .innerJoin(portesCaminhao, eq(portesCaminhao.codigo, agendamentos.porteCodigo))
    .where(eq(agendamentos.id, id));
  if (!linha) notFound();
  const { ag, janela, porte } = linha;

  const [{ regras }, eventos, mensagens, todosPortes, todosMateriais] = await Promise.all([
    getConfig(),
    db.select().from(historico).where(eq(historico.agendamentoId, id)).orderBy(desc(historico.criadoEm), desc(historico.id)),
    db.select().from(mensagensEnviadas).where(eq(mensagensEnviadas.agendamentoId, id)).orderBy(desc(mensagensEnviadas.enviadoEm)),
    db.select().from(portesCaminhao).where(eq(portesCaminhao.ativo, true)).orderBy(asc(portesCaminhao.ordem)),
    db.select().from(materiais).where(eq(materiais.ativo, true)).orderBy(asc(materiais.ordem)),
  ]);
  const hoje = hojeSP();

  const nomesMateriais = [
    ...todosMateriais.filter((m) => ag.materiais.includes(m.codigo)).map((m) => m.nome),
    ...(ag.materiaisOutros ? [ag.materiaisOutros] : []),
  ].join(", ");
  const finalizar = podeFinalizar(ag.status, ag.data, hoje);

  const itens: [string, string][] = [
    ["Data", `${formatarDiaExtenso(ag.data)}, ${formatarData(ag.data)}`],
    ["Janela", `${formatarHora(janela.horaInicio)} às ${formatarHora(janela.horaFim)}`],
    ["Cliente", ag.nome],
    ["Empresa", ag.empresa],
    ["WhatsApp", `+${ag.whatsapp}`],
    ["Contrato / obra", ag.contrato],
    ["Materiais", nomesMateriais],
    ["Volume", VOLUME[ag.volume]],
    ["Porte", `${porte.nome} (${ag.pesoVagas} vaga${ag.pesoVagas > 1 ? "s" : ""})`],
    ["Placa", ag.placa ?? "—"],
    ["Motorista", ag.motorista ?? "—"],
    ["Observações", ag.observacoes ?? "—"],
    ["Origem", ag.origem === "CLIENTE" ? "Cliente" : "Painel"],
    ["Criado em", formatarDataHora(ag.criadoEm)],
    ...(ag.motivo ? ([["Motivo", ag.motivo]] as [string, string][]) : []),
  ];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{ag.protocolo}</h1>
          <StatusBadge status={ag.status} />
          {ag.requerAlinhamento && <SeloAlinhar />}
          {ag.status === "SOLICITADO" && (
            <SeloPrazo situacao={classificarPrazo(ag.data, hoje, regras)} prazo={prazoDecisao(ag.data, regras)} />
          )}
        </div>
        {ag.calendarSync === "ERRO" && (
          <p className="rounded-lg bg-orange-50 p-3 text-sm text-orange-900 ring-1 ring-orange-200">
            Falha ao sincronizar com o Google Calendar: {ag.calendarErro ?? "erro desconhecido"}
          </p>
        )}
      </header>

      <AcoesAgendamento
        ag={{
          id: ag.id,
          data: ag.data,
          janelaId: ag.janelaId,
          pesoVagas: ag.pesoVagas,
          porteCodigo: ag.porteCodigo,
          volume: ag.volume,
          nome: ag.nome,
          empresa: ag.empresa,
          whatsapp: ag.whatsapp,
          contrato: ag.contrato,
          materiais: ag.materiais,
          materiaisOutros: ag.materiaisOutros,
          placa: ag.placa,
          motorista: ag.motorista,
          observacoes: ag.observacoes,
        }}
        permissoes={{
          confirmar: ag.status === "SOLICITADO",
          recusar: ag.status === "SOLICITADO",
          reagendar: podeReagendar(ag.status),
          cancelar: ocupaVaga(ag.status),
          editar: podeEditar(ag.status),
          finalizar,
          finalizarAguardando: ag.status === "CONFIRMADO" && !finalizar,
        }}
        hoje={hoje}
        portes={todosPortes.map((p) => ({ codigo: p.codigo, nome: p.nome, pesoVagas: p.pesoVagas }))}
        materiais={todosMateriais.map((m) => ({ codigo: m.codigo, nome: m.nome }))}
      />

      <dl className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        {itens.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Histórico</h2>
        <ol className="space-y-2">
          {eventos.map((e) => (
            <li key={e.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap gap-x-3 text-sm">
                <span className="font-semibold">{ROTULO_ACAO[e.acao] ?? e.acao}</span>
                <span className="text-slate-500">{ROTULO_AUTOR[e.autor] ?? e.autor}</span>
                <span className="text-slate-500">{formatarDataHora(e.criadoEm)}</span>
              </div>
              {descreverDetalhes(e.detalhes).map((l) => (
                <p key={l} className="text-sm text-slate-600">
                  {l}
                </p>
              ))}
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Mensagens enviadas</h2>
        {mensagens.length === 0 && <p className="text-sm text-slate-500">Nenhuma mensagem registrada.</p>}
        {mensagens.map((m) => (
          <div key={m.id} className="rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
            <span className="font-semibold">{m.tipo}</span>
            <span className="text-slate-500"> · {formatarDataHora(m.enviadoEm)}</span>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{m.texto}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
