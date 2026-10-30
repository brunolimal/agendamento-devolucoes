"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buscarDisponibilidadeMes, criarAgendamento } from "@/app/agendar/actions";
import { buscarDisponibilidadeMesPainel, criarAgendamentoManual } from "@/app/painel/actions/agendamentos";
import { IlustracaoCaminhao } from "@/components/ui/IlustracaoCaminhao";
import { IlustracaoMaterial } from "@/components/ui/IlustracaoMaterial";
import { formatarDiaExtenso, formatarHora, mesDe, somarDias } from "@/lib/datas";
import { mascararEntrada, normalizarTelefone } from "@/lib/telefone";
import { Calendario } from "./Calendario";

interface JanelaCalendario {
  janelaId: number;
  horaInicio: string;
  horaFim: string;
  vagas: number;
  disponivel: boolean;
  /** Só no painel: ocupação X/Y e bloqueio. */
  capacidade?: number;
  ocupado?: number;
  bloqueada?: boolean;
}
interface DiaCalendario {
  data: string;
  disponivel: boolean;
  janelas: JanelaCalendario[];
}

interface Props {
  /** `publico` (cliente, /agendar) ou `painel` (colaborador, /painel/novo, RN-10). */
  modo?: "publico" | "painel";
  regrasAceite?: string;
  portes: { codigo: string; nome: string; descricao: string | null; pesoVagas: number }[];
  materiais: { codigo: string; nome: string }[];
  /** Primeira e última data liberadas ao cliente (modo público). */
  min: string;
  max: string;
  /** Instante de abertura assinado (modo público: tempo mínimo de preenchimento). */
  inicio?: string;
  /** Data de hoje em São Paulo (modo painel). */
  hoje?: string;
}

type Volume = "PEQUENO" | "MEDIO" | "GRANDE" | "NAO_SEI";
const VOLUMES: { valor: Volume; rotulo: string }[] = [
  { valor: "PEQUENO", rotulo: "Pequeno" },
  { valor: "MEDIO", rotulo: "Médio" },
  { valor: "GRANDE", rotulo: "Grande" },
  { valor: "NAO_SEI", rotulo: "Não sei informar" },
];
const PASSOS = ["Data e horário", "Seus dados", "Carga", "Revisão"];
const PASSOS_PAINEL = ["Data e horário", "Dados do cliente", "Carga", "Revisão"];

const entrada =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/30";
const botaoPrimario =
  "w-full rounded-xl bg-primaria px-5 py-4 text-lg font-semibold text-white disabled:opacity-50 active:opacity-90";
const botaoSecundario = "w-full rounded-xl border border-slate-300 bg-white px-5 py-4 text-lg font-semibold text-slate-700";
const botaoAviso = "w-full rounded-xl bg-orange-600 px-5 py-4 text-lg font-semibold text-white disabled:opacity-50";

function Campo({ rotulo, erro, children }: { rotulo: string; erro?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</span>
      {children}
      {erro && <span className="mt-1 block text-sm text-red-700">{erro}</span>}
    </label>
  );
}

export function Agendador({ modo = "publico", regrasAceite = "", portes, materiais, min, max, inicio = "", hoje = "" }: Props) {
  const router = useRouter();
  const manual = modo === "painel";
  const [passo, setPasso] = useState(1);

  // limites do calendário: o cliente só vê hoje+min..hoje+max; o painel vê tudo a partir de hoje
  const mesMin = mesDe(manual ? hoje : min);
  const mesMax = mesDe(manual ? somarDias(hoje, 3650) : max);

  // passo 1
  const [mes, setMes] = useState(mesMin);
  const [versao, setVersao] = useState(0);
  const [carga, setCarga] = useState<{ chave: string; dias: DiaCalendario[] } | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [janelaId, setJanelaId] = useState<number | null>(null);

  // passo 2
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [contrato, setContrato] = useState("");

  // passo 3
  const [materiaisSel, setMateriaisSel] = useState<string[]>([]);
  const [materiaisOutros, setMateriaisOutros] = useState("");
  const [volume, setVolume] = useState<Volume | null>(null);
  const [porteCodigo, setPorteCodigo] = useState<string | null>(null);
  const [placa, setPlaca] = useState("");
  const [motorista, setMotorista] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // passo 4
  const [aceite, setAceite] = useState(false);
  const [confirmar, setConfirmar] = useState(true); // RN-10: já nasce CONFIRMADO
  const [website, setWebsite] = useState(""); // honeypot (só público)
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [podeForcar, setPodeForcar] = useState(false);
  const [campos, setCampos] = useState<Record<string, string>>({});

  const peso = portes.find((p) => p.codigo === porteCodigo)?.pesoVagas ?? 1;
  const chave = `${mes}|${peso}|${versao}`;
  const carregando = carga?.chave !== chave;

  useEffect(() => {
    let ativo = true;
    const buscar = manual ? buscarDisponibilidadeMesPainel : buscarDisponibilidadeMes;
    buscar({ mes, peso }).then((dias) => {
      if (ativo) setCarga({ chave: `${mes}|${peso}|${versao}`, dias });
    });
    return () => {
      ativo = false;
    };
  }, [mes, peso, versao, manual]);

  const dias = carga && !carregando ? carga.dias : [];
  // painel: qualquer data com janela (mesmo lotada, pois o colaborador pode forçar) a partir de hoje
  const disponiveis = new Set(
    dias.filter((d) => (manual ? d.janelas.length > 0 && d.data >= hoje : d.disponivel)).map((d) => d.data),
  );
  const tons: Record<string, "parcial" | "cheio"> = {};
  if (manual) {
    for (const d of dias) {
      if (d.janelas.length === 0) continue;
      if (d.janelas.every((j) => !j.disponivel)) tons[d.data] = "cheio";
      else if (d.janelas.some((j) => (j.ocupado ?? 0) > 0)) tons[d.data] = "parcial";
    }
  }
  const diaSelecionado = dias.find((d) => d.data === data);
  const janelaEscolhida = diaSelecionado?.janelas.find((j) => j.janelaId === janelaId);

  const [errosPasso, setErrosPasso] = useState<Record<string, string>>({});

  function validarPasso(p: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (p === 1) {
      if (!data || !janelaId) e.janela = "Escolha uma data e um horário";
    }
    if (p === 2) {
      if (nome.trim().length < 2) e.nome = manual ? "Informe o nome do cliente" : "Informe seu nome";
      if (empresa.trim().length < 1) e.empresa = "Informe a empresa";
      if (!normalizarTelefone(whatsapp)) e.whatsapp = "WhatsApp inválido (DDD + número)";
      if (!contrato.trim()) e.contrato = "Informe o nº do contrato ou da obra";
    }
    if (p === 3) {
      if (materiaisSel.length === 0) e.materiais = "Escolha ao menos um material";
      if (!volume) e.volume = "Escolha o volume";
      if (!porteCodigo) e.porteCodigo = "Escolha o caminhão";
    }
    return e;
  }

  function avancar() {
    const e = validarPasso(passo);
    setErrosPasso(e);
    if (Object.keys(e).length === 0) {
      setErro(null);
      setPasso(passo + 1);
    }
  }

  function voltar() {
    setErrosPasso({});
    setPasso(passo - 1);
  }

  // RN-07/RN-10: para nascer CONFIRMADO, porte e volume precisam estar definidos
  const faltaDefinir = manual && confirmar && (porteCodigo === "NAO_SEI" || volume === "NAO_SEI");

  async function enviar(forcar = false) {
    if (!data || !janelaId || !volume || !porteCodigo) return;
    setEnviando(true);
    setErro(null);
    setPodeForcar(false);
    setCampos({});
    const base = {
      data,
      janelaId,
      nome,
      empresa,
      whatsapp,
      contrato,
      materiais: materiaisSel,
      materiaisOutros: materiaisSel.includes("OUTROS") ? materiaisOutros : "",
      volume,
      porteCodigo,
      placa,
      motorista,
      observacoes,
    };

    if (manual) {
      const r = await criarAgendamentoManual({ ...base, confirmar, forcar });
      if (r.ok) {
        router.push(`/painel/agendamentos/${r.id}${confirmar ? "?avisar=CONFIRMACAO" : ""}`);
        return;
      }
      setEnviando(false);
      setErro(r.erro);
      setCampos(r.campos ?? {});
      setPodeForcar(Boolean(r.podeForcar));
      return;
    }

    const r = await criarAgendamento({ ...base, aceite, website, inicio });
    if (r.ok) {
      router.push(`/agendar/protocolo/${r.protocolo}`);
      return;
    }
    setEnviando(false);
    setErro(r.erro);
    setCampos(r.campos ?? {});
    if (r.codigo === "SEM_VAGA" || r.codigo === "DATA_BLOQUEADA" || r.codigo === "JANELA_INVALIDA") {
      setJanelaId(null);
      setVersao((v) => v + 1);
      setPasso(1);
    }
  }

  function alternarMaterial(codigo: string) {
    setMateriaisSel((atual) => (atual.includes(codigo) ? atual.filter((c) => c !== codigo) : [...atual, codigo]));
  }

  const nomePorte = portes.find((p) => p.codigo === porteCodigo)?.nome;
  const nomesMateriais = materiais.filter((m) => materiaisSel.includes(m.codigo)).map((m) => m.nome);
  const passos = manual ? PASSOS_PAINEL : PASSOS;

  return (
    <div className="space-y-4">
      <ol className="flex gap-1" aria-label="Passos">
        {passos.map((p, i) => (
          <li key={p} className="flex-1">
            <div className={`h-1.5 rounded-full ${i + 1 <= passo ? "bg-primaria" : "bg-slate-200"}`} />
            <span className={`mt-1 block text-xs ${i + 1 === passo ? "font-semibold text-slate-900" : "text-slate-500"}`}>
              {i + 1}. {p}
            </span>
          </li>
        ))}
      </ol>

      {erro && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800 ring-1 ring-red-200">
          {erro}
        </p>
      )}

      {passo === 1 && (
        <section className="space-y-4">
          <Calendario
            mes={mes}
            disponiveis={disponiveis}
            selecionada={data}
            carregando={carregando}
            tons={tons}
            mesMin={mesMin}
            mesMax={mesMax}
            onSelecionar={(d) => {
              setData(d);
              setJanelaId(null);
            }}
            onMes={setMes}
          />
          {manual && (
            <p className="text-xs text-slate-500">
              Cores: <span className="rounded bg-amber-100 px-1">com reservas</span>{" "}
              <span className="rounded bg-red-100 px-1">lotado</span>. O painel libera qualquer data a partir de hoje.
            </p>
          )}
          {diaSelecionado && (
            <div className="space-y-2">
              <h2 className="font-semibold capitalize">{formatarDiaExtenso(diaSelecionado.data)}</h2>
              <div className="grid grid-cols-2 gap-2">
                {diaSelecionado.janelas.map((j) => (
                  <button
                    key={j.janelaId}
                    type="button"
                    disabled={!manual && !j.disponivel}
                    onClick={() => setJanelaId(j.janelaId)}
                    aria-pressed={j.janelaId === janelaId}
                    className={`rounded-xl border px-3 py-3 text-left disabled:opacity-40 ${
                      j.janelaId === janelaId ? "border-primaria bg-primaria/10 ring-2 ring-primaria" : "border-slate-300 bg-white"
                    } ${manual && !j.disponivel ? "bg-red-50" : ""}`}
                  >
                    <span className="block font-semibold">
                      {formatarHora(j.horaInicio)} às {formatarHora(j.horaFim)}
                    </span>
                    <span className="text-sm text-slate-600">
                      {manual
                        ? `${j.ocupado ?? 0}/${j.capacidade ?? 0} ocupadas${j.bloqueada ? " · bloqueada" : !j.disponivel ? " · sem vaga" : ""}`
                        : j.disponivel
                          ? `vagas restantes: ${j.vagas}`
                          : "indisponível"}
                    </span>
                  </button>
                ))}
              </div>
              {manual && janelaEscolhida && !janelaEscolhida.disponivel && (
                <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900 ring-1 ring-orange-200">
                  {janelaEscolhida.bloqueada ? "Essa janela está bloqueada." : "Essa janela não comporta o caminhão escolhido."} Só
                  será possível agendar forçando, com confirmação no último passo.
                </p>
              )}
            </div>
          )}
          {errosPasso.janela && <p className="text-sm text-red-700">{errosPasso.janela}</p>}
        </section>
      )}

      {passo === 2 && (
        <section className="space-y-4">
          <Campo rotulo="Nome *" erro={errosPasso.nome ?? campos.nome}>
            <input className={entrada} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={120} />
          </Campo>
          <Campo rotulo="Empresa *" erro={errosPasso.empresa ?? campos.empresa}>
            <input className={entrada} value={empresa} onChange={(e) => setEmpresa(e.target.value)} autoComplete="organization" maxLength={120} />
          </Campo>
          <Campo rotulo="WhatsApp *" erro={errosPasso.whatsapp ?? campos.whatsapp}>
            <input
              className={entrada}
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararEntrada(e.target.value))}
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 98888-7777"
            />
          </Campo>
          <Campo rotulo="Nº do contrato / obra *" erro={errosPasso.contrato ?? campos.contrato}>
            <input className={entrada} value={contrato} onChange={(e) => setContrato(e.target.value)} maxLength={60} />
          </Campo>
        </section>
      )}

      {passo === 3 && (
        <section className="space-y-6">
          <div>
            <h2 className="mb-2 font-semibold">Materiais *</h2>
            <div className="grid grid-cols-2 gap-2">
              {materiais.map((m) => {
                const ativo = materiaisSel.includes(m.codigo);
                return (
                  <button
                    key={m.codigo}
                    type="button"
                    onClick={() => alternarMaterial(m.codigo)}
                    aria-pressed={ativo}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left ${
                      ativo ? "border-primaria bg-primaria/10 ring-2 ring-primaria" : "border-slate-300 bg-white"
                    }`}
                  >
                    <IlustracaoMaterial codigo={m.codigo} className="h-8 w-8 shrink-0 text-primaria" />
                    <span className="font-medium">{m.nome}</span>
                  </button>
                );
              })}
            </div>
            {materiaisSel.includes("OUTROS") && (
              <input
                className={`${entrada} mt-2`}
                placeholder="Quais outros materiais?"
                value={materiaisOutros}
                onChange={(e) => setMateriaisOutros(e.target.value)}
                maxLength={200}
              />
            )}
            {(errosPasso.materiais ?? campos.materiais) && (
              <p className="mt-1 text-sm text-red-700">{errosPasso.materiais ?? campos.materiais}</p>
            )}
          </div>

          <div>
            <h2 className="mb-2 font-semibold">Volume *</h2>
            <div className="grid grid-cols-2 gap-2">
              {VOLUMES.map((v) => (
                <button
                  key={v.valor}
                  type="button"
                  onClick={() => setVolume(v.valor)}
                  aria-pressed={volume === v.valor}
                  className={`rounded-xl border px-3 py-3 font-medium ${
                    volume === v.valor ? "border-primaria bg-primaria/10 ring-2 ring-primaria" : "border-slate-300 bg-white"
                  }`}
                >
                  {v.rotulo}
                </button>
              ))}
            </div>
            {(errosPasso.volume ?? campos.volume) && <p className="mt-1 text-sm text-red-700">{errosPasso.volume ?? campos.volume}</p>}
          </div>

          <div>
            <h2 className="mb-2 font-semibold">Caminhão *</h2>
            <div className="grid grid-cols-2 gap-2">
              {portes.map((p) => (
                <button
                  key={p.codigo}
                  type="button"
                  onClick={() => setPorteCodigo(p.codigo)}
                  aria-pressed={porteCodigo === p.codigo}
                  className={`rounded-xl border px-3 py-3 text-left ${
                    porteCodigo === p.codigo ? "border-primaria bg-primaria/10 ring-2 ring-primaria" : "border-slate-300 bg-white"
                  }`}
                >
                  <IlustracaoCaminhao codigo={p.codigo} className="mb-1 h-12 w-full text-primaria" />
                  <span className="block font-semibold">{p.codigo === "NAO_SEI" ? "Não sei / A alinhar" : p.nome}</span>
                  {p.descricao && !p.descricao.startsWith("[") && <span className="text-xs text-slate-600">{p.descricao}</span>}
                </button>
              ))}
            </div>
            {(errosPasso.porteCodigo ?? campos.porteCodigo) && (
              <p className="mt-1 text-sm text-red-700">{errosPasso.porteCodigo ?? campos.porteCodigo}</p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm text-slate-600">Placa e motorista são opcionais: pode informar depois.</p>
            <Campo rotulo="Placa">
              <input className={entrada} value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} maxLength={12} />
            </Campo>
            <Campo rotulo="Motorista">
              <input className={entrada} value={motorista} onChange={(e) => setMotorista(e.target.value)} maxLength={120} />
            </Campo>
            <Campo rotulo="Observações">
              <textarea className={entrada} rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={500} />
            </Campo>
          </div>
        </section>
      )}

      {passo === 4 && data && (
        <section className="space-y-4">
          <dl className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            {[
              ["Data", `${formatarDiaExtenso(data)}`],
              ["Horário", janelaEscolhida ? `${formatarHora(janelaEscolhida.horaInicio)} às ${formatarHora(janelaEscolhida.horaFim)}` : "—"],
              ["Nome", nome],
              ["Empresa", empresa],
              ["WhatsApp", whatsapp],
              ["Contrato / obra", contrato],
              ["Materiais", [...nomesMateriais, ...(materiaisSel.includes("OUTROS") && materiaisOutros ? [materiaisOutros] : [])].join(", ")],
              ["Volume", VOLUMES.find((v) => v.valor === volume)?.rotulo ?? ""],
              ["Caminhão", nomePorte ?? ""],
              ...(placa ? [["Placa", placa]] : []),
              ...(motorista ? [["Motorista", motorista]] : []),
              ...(observacoes ? [["Observações", observacoes]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          {manual ? (
            <>
              <label className="flex items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-primaria" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} />
                <span className="text-sm text-slate-700">
                  <strong>Já nasce CONFIRMADO.</strong> Desmarque para criar como SOLICITADO (precisará ser confirmado depois).
                </span>
              </label>
              {faltaDefinir && (
                <p className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-900 ring-1 ring-yellow-200">
                  Para já nascer confirmado é preciso definir o caminhão e o volume. Volte e defina, ou desmarque a opção acima.
                </p>
              )}
            </>
          ) : (
            <>
              <label className="flex items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-primaria" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
                <span className="text-sm text-slate-700">{regrasAceite}</span>
              </label>
              {campos.aceite && <p className="text-sm text-red-700">{campos.aceite}</p>}
              {/* honeypot: campo invisível; humanos não preenchem */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                  Site
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </label>
              </div>
            </>
          )}
        </section>
      )}

      <div className="flex gap-3 pt-2">
        {passo > 1 && (
          <button type="button" className={botaoSecundario} onClick={voltar} disabled={enviando}>
            Voltar
          </button>
        )}
        {passo < 4 ? (
          <button type="button" className={botaoPrimario} onClick={avancar}>
            Continuar
          </button>
        ) : manual ? (
          <button type="button" className={botaoPrimario} onClick={() => enviar(false)} disabled={enviando || faltaDefinir}>
            {enviando ? "Criando..." : "Criar agendamento"}
          </button>
        ) : (
          <button type="button" className={botaoPrimario} onClick={() => enviar()} disabled={!aceite || enviando}>
            {enviando ? "Enviando..." : "Solicitar agendamento"}
          </button>
        )}
      </div>

      {manual && passo === 4 && podeForcar && (
        <div className="space-y-2 rounded-xl bg-orange-50 p-4 ring-1 ring-orange-200">
          <p className="text-sm text-orange-900">
            Forçar ignora a capacidade (ou o bloqueio) dessa janela e fica registrado no histórico como &quot;Forçou a vaga&quot;.
          </p>
          <button type="button" className={botaoAviso} onClick={() => enviar(true)} disabled={enviando || faltaDefinir}>
            Agendar mesmo assim
          </button>
        </div>
      )}
    </div>
  );
}
