"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  cancelarAgendamento,
  concluirAgendamento,
  confirmarAgendamento,
  editarAgendamento,
  janelasDoDia,
  marcarNaoCompareceu,
  reagendarAgendamento,
  recusarAgendamento,
  type ResultadoAcao,
} from "@/app/painel/actions/agendamentos";
import { formatarDiaMesHora, formatarHora } from "@/lib/datas";
import type { JanelaDisponivel } from "@/lib/disponibilidade";
import { mascararEntrada } from "@/lib/telefone";
import { ROTULO_TIPO, type TipoMensagem } from "@/lib/templates";
import { AvisarCliente } from "./AvisarCliente";

type Volume = "PEQUENO" | "MEDIO" | "GRANDE" | "NAO_SEI";
const VOLUMES: { valor: Volume; rotulo: string }[] = [
  { valor: "PEQUENO", rotulo: "Pequeno" },
  { valor: "MEDIO", rotulo: "Médio" },
  { valor: "GRANDE", rotulo: "Grande" },
  { valor: "NAO_SEI", rotulo: "Não sei informar" },
];

export interface DadosAgendamento {
  id: string;
  data: string;
  janelaId: number;
  pesoVagas: number;
  porteCodigo: string;
  volume: Volume;
  nome: string;
  empresa: string;
  whatsapp: string;
  contrato: string;
  materiais: string[];
  materiaisOutros: string | null;
  placa: string | null;
  motorista: string | null;
  observacoes: string | null;
}

export interface PermissoesAcoes {
  confirmar: boolean;
  recusar: boolean;
  reagendar: boolean;
  cancelar: boolean;
  editar: boolean;
  finalizar: boolean;
  /** CONFIRMADO, mas ainda antes da data (RN-18). */
  finalizarAguardando: boolean;
}

/** Botão do bloco "Mensagens": tipo e quando foi enviada no estado atual (RN-12). */
export interface BotaoMensagem {
  tipo: TipoMensagem;
  enviadaEm: string | null;
}

interface Props {
  ag: DadosAgendamento;
  mensagens: BotaoMensagem[];
  /** Abre o painel "Avisar o cliente" ao carregar (?avisar=TIPO). */
  abrirAvisar?: TipoMensagem;
  permissoes: PermissoesAcoes;
  hoje: string;
  portes: { codigo: string; nome: string; pesoVagas: number }[];
  materiais: { codigo: string; nome: string }[];
}

type Acao = "confirmar" | "recusar" | "reagendar" | "cancelar" | "editar" | "concluir" | "naoCompareceu";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/30";
const btn = "rounded-lg px-4 py-2 font-semibold disabled:opacity-50";
const btnPrimario = `${btn} bg-primaria text-white`;
const btnNeutro = `${btn} border border-slate-300 bg-white text-slate-700`;
const btnPerigo = `${btn} bg-red-700 text-white`;
const btnAviso = `${btn} bg-orange-600 text-white`;

function Linha({ rotulo, erro, children }: { rotulo: string; erro?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{rotulo}</span>
      {children}
      {erro && <span className="text-sm text-red-700">{erro}</span>}
    </label>
  );
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-2xl leading-none text-slate-500">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Erro({ r }: { r: ResultadoAcao | null }) {
  if (!r || r.ok) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
      {r.erro}
    </p>
  );
}

export function AcoesAgendamento({ ag, mensagens, abrirAvisar, permissoes, hoje, portes, materiais }: Props) {
  const router = useRouter();
  const [aberta, setAberta] = useState<Acao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao | null>(null);
  const [avisar, setAvisar] = useState<TipoMensagem | null>(abrirAvisar ?? null);

  function abrir(a: Acao) {
    setResultado(null);
    setAberta(a);
  }

  /** Roda a ação; se der certo e houver template (SPEC §10), abre o painel "Avisar o cliente". */
  async function rodar(chamada: () => Promise<ResultadoAcao>, avisarDepois?: TipoMensagem) {
    setEnviando(true);
    setResultado(null);
    const r = await chamada();
    setEnviando(false);
    if (r.ok) {
      setAberta(null);
      if (avisarDepois) setAvisar(avisarDepois);
      router.refresh();
    } else {
      setResultado(r);
    }
  }

  const portesDefinidos = portes.filter((p) => p.codigo !== "NAO_SEI");

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {permissoes.confirmar && (
          <button type="button" className={btnPrimario} onClick={() => abrir("confirmar")}>
            Confirmar
          </button>
        )}
        {permissoes.recusar && (
          <button type="button" className={btnNeutro} onClick={() => abrir("recusar")}>
            Recusar
          </button>
        )}
        {permissoes.reagendar && (
          <button type="button" className={btnNeutro} onClick={() => abrir("reagendar")}>
            Reagendar
          </button>
        )}
        {permissoes.editar && (
          <button type="button" className={btnNeutro} onClick={() => abrir("editar")}>
            Editar dados
          </button>
        )}
        {permissoes.finalizar && (
          <>
            <button type="button" className={btnPrimario} onClick={() => abrir("concluir")}>
              Concluir
            </button>
            <button type="button" className={btnAviso} onClick={() => abrir("naoCompareceu")}>
              Não compareceu
            </button>
          </>
        )}
        {permissoes.cancelar && (
          <button type="button" className={`${btnNeutro} text-red-700`} onClick={() => abrir("cancelar")}>
            Cancelar agendamento
          </button>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-600">Mensagens ao cliente</h3>
        <div className="flex flex-wrap gap-2">
          {mensagens.map((m) => (
            <button key={m.tipo} type="button" className={`${btnNeutro} text-left`} onClick={() => setAvisar(m.tipo)}>
              <span className="block">{ROTULO_TIPO[m.tipo]}</span>
              {m.enviadaEm && (
                <span className="block text-xs font-normal text-green-800">
                  Enviada em {formatarDiaMesHora(new Date(m.enviadaEm))} · Reenviar
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {permissoes.finalizarAguardando && (
        <p className="text-sm text-slate-500">Concluir e &quot;Não compareceu&quot; ficam disponíveis a partir da data do agendamento.</p>
      )}

      {aberta === "confirmar" && (
        <ModalConfirmar ag={ag} portes={portesDefinidos} enviando={enviando} resultado={resultado} onFechar={() => setAberta(null)} rodar={rodar} />
      )}
      {(aberta === "recusar" || aberta === "cancelar") && (
        <ModalMotivo tipo={aberta} id={ag.id} enviando={enviando} resultado={resultado} onFechar={() => setAberta(null)} rodar={rodar} />
      )}
      {aberta === "reagendar" && (
        <ModalReagendar ag={ag} hoje={hoje} enviando={enviando} resultado={resultado} onFechar={() => setAberta(null)} rodar={rodar} />
      )}
      {aberta === "editar" && (
        <ModalEditar ag={ag} portes={portes} materiais={materiais} enviando={enviando} resultado={resultado} onFechar={() => setAberta(null)} rodar={rodar} />
      )}
      {(aberta === "concluir" || aberta === "naoCompareceu") && (
        <Modal titulo={aberta === "concluir" ? "Marcar como concluído?" : "Marcar como não compareceu?"} onFechar={() => setAberta(null)}>
          <Erro r={resultado} />
          <div className="flex justify-end gap-2">
            <button type="button" className={btnNeutro} onClick={() => setAberta(null)}>
              Voltar
            </button>
            <button
              type="button"
              className={aberta === "concluir" ? btnPrimario : btnAviso}
              disabled={enviando}
              onClick={() => rodar(() => (aberta === "concluir" ? concluirAgendamento({ id: ag.id }) : marcarNaoCompareceu({ id: ag.id })))}
            >
              {enviando ? "Salvando..." : "Confirmar"}
            </button>
          </div>
        </Modal>
      )}
      {avisar && (
        <AvisarCliente
          id={ag.id}
          tipo={avisar}
          onFechar={() => {
            setAvisar(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

interface ModalProps {
  enviando: boolean;
  resultado: ResultadoAcao | null;
  onFechar: () => void;
  rodar: (chamada: () => Promise<ResultadoAcao>, avisarDepois?: TipoMensagem) => Promise<void>;
}

function ModalConfirmar({ ag, portes, enviando, resultado, onFechar, rodar }: ModalProps & { ag: DadosAgendamento; portes: Props["portes"] }) {
  const [porteCodigo, setPorteCodigo] = useState(ag.porteCodigo === "NAO_SEI" ? "" : ag.porteCodigo);
  const [volume, setVolume] = useState<Volume | "">(ag.volume === "NAO_SEI" ? "" : ag.volume);
  const pronto = porteCodigo !== "" && volume !== "";
  const enviar = (forcar: boolean) =>
    rodar(() => confirmarAgendamento({ id: ag.id, porteCodigo, volume, forcar }), "CONFIRMACAO");

  return (
    <Modal titulo="Confirmar agendamento" onFechar={onFechar}>
      <p className="text-sm text-slate-600">Defina o porte e o volume reais da carga. A vaga é revalidada com o peso do porte.</p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Porte do caminhão *</span>
        <select className={campo} value={porteCodigo} onChange={(e) => setPorteCodigo(e.target.value)}>
          <option value="">Selecione</option>
          {portes.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nome} (ocupa {p.pesoVagas} vaga{p.pesoVagas > 1 ? "s" : ""})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Volume *</span>
        <select className={campo} value={volume} onChange={(e) => setVolume(e.target.value as Volume)}>
          <option value="">Selecione</option>
          {VOLUMES.filter((v) => v.valor !== "NAO_SEI").map((v) => (
            <option key={v.valor} value={v.valor}>
              {v.rotulo}
            </option>
          ))}
        </select>
      </label>
      <Erro r={resultado} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={btnNeutro} onClick={onFechar}>
          Voltar
        </button>
        {resultado && !resultado.ok && resultado.podeForcar && (
          <button type="button" className={btnAviso} disabled={enviando || !pronto} onClick={() => enviar(true)}>
            Confirmar mesmo assim
          </button>
        )}
        <button type="button" className={btnPrimario} disabled={enviando || !pronto} onClick={() => enviar(false)}>
          {enviando ? "Confirmando..." : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}

function ModalMotivo({ tipo, id, enviando, resultado, onFechar, rodar }: ModalProps & { tipo: "recusar" | "cancelar"; id: string }) {
  const [motivo, setMotivo] = useState("");
  const recusar = tipo === "recusar";
  return (
    <Modal titulo={recusar ? "Recusar solicitação" : "Cancelar agendamento"} onFechar={onFechar}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Motivo *</span>
        <textarea className={campo} rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <Erro r={resultado} />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnNeutro} onClick={onFechar}>
          Voltar
        </button>
        <button
          type="button"
          className={btnPerigo}
          disabled={enviando || motivo.trim() === ""}
          onClick={() =>
            rodar(
              () => (recusar ? recusarAgendamento({ id, motivo }) : cancelarAgendamento({ id, motivo })),
              recusar ? "RECUSA" : "CANCELAMENTO_EMPRESA",
            )
          }
        >
          {enviando ? "Salvando..." : recusar ? "Recusar" : "Cancelar agendamento"}
        </button>
      </div>
    </Modal>
  );
}

function ModalReagendar({ ag, hoje, enviando, resultado, onFechar, rodar }: ModalProps & { ag: DadosAgendamento; hoje: string }) {
  const [data, setData] = useState("");
  const [lista, setLista] = useState<{ data: string; janelas: JanelaDisponivel[] } | null>(null);
  const [janelaId, setJanelaId] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    let ativo = true;
    janelasDoDia({ data, peso: ag.pesoVagas }).then((janelas) => {
      if (ativo) setLista({ data, janelas });
    });
    return () => {
      ativo = false;
    };
  }, [data, ag.pesoVagas]);

  const janelas = lista?.data === data ? lista.janelas : null;
  const enviar = (forcar: boolean) => {
    if (janelaId) return rodar(() => reagendarAgendamento({ id: ag.id, data, janelaId, forcar }), "REAGENDAMENTO");
  };

  return (
    <Modal titulo="Reagendar" onFechar={onFechar}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Nova data *</span>
        <input
          type="date"
          className={campo}
          min={hoje}
          value={data}
          onChange={(e) => {
            setData(e.target.value);
            setJanelaId(null);
          }}
        />
      </label>
      {data && !janelas && <p className="text-sm text-slate-500">Carregando janelas...</p>}
      {janelas && janelas.length === 0 && <p className="text-sm text-slate-600">Não há janelas nesse dia.</p>}
      {janelas && janelas.length > 0 && (
        <div className="space-y-2">
          <span className="block text-sm font-medium">Janela * (ocupação atual)</span>
          {janelas.map((j) => (
            <label
              key={j.janelaId}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                janelaId === j.janelaId ? "border-primaria bg-primaria/10" : "border-slate-300"
              }`}
            >
              <input type="radio" name="janela" checked={janelaId === j.janelaId} onChange={() => setJanelaId(j.janelaId)} />
              <span className="flex-1 font-medium">
                {formatarHora(j.horaInicio)} às {formatarHora(j.horaFim)}
              </span>
              <span className={`text-sm ${j.vagas < ag.pesoVagas ? "text-red-700" : "text-slate-600"}`}>
                {j.ocupado}/{j.capacidade}
                {j.bloqueada ? " · bloqueada" : ""}
              </span>
            </label>
          ))}
        </div>
      )}
      <Erro r={resultado} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={btnNeutro} onClick={onFechar}>
          Voltar
        </button>
        {resultado && !resultado.ok && resultado.podeForcar && (
          <button type="button" className={btnAviso} disabled={enviando || !janelaId} onClick={() => enviar(true)}>
            Reagendar mesmo assim
          </button>
        )}
        <button type="button" className={btnPrimario} disabled={enviando || !janelaId} onClick={() => enviar(false)}>
          {enviando ? "Salvando..." : "Reagendar"}
        </button>
      </div>
    </Modal>
  );
}

function ModalEditar({
  ag,
  portes,
  materiais,
  enviando,
  resultado,
  onFechar,
  rodar,
}: ModalProps & { ag: DadosAgendamento; portes: Props["portes"]; materiais: Props["materiais"] }) {
  const [nome, setNome] = useState(ag.nome);
  const [empresa, setEmpresa] = useState(ag.empresa);
  const [whatsapp, setWhatsapp] = useState(mascararEntrada(ag.whatsapp));
  const [contrato, setContrato] = useState(ag.contrato);
  const [mats, setMats] = useState(ag.materiais);
  const [outros, setOutros] = useState(ag.materiaisOutros ?? "");
  const [volume, setVolume] = useState<Volume>(ag.volume);
  const [porteCodigo, setPorteCodigo] = useState(ag.porteCodigo);
  const [placa, setPlaca] = useState(ag.placa ?? "");
  const [motorista, setMotorista] = useState(ag.motorista ?? "");
  const [observacoes, setObservacoes] = useState(ag.observacoes ?? "");

  const campos = resultado && !resultado.ok ? (resultado.campos ?? {}) : {};
  const enviar = (forcar: boolean) =>
    rodar(() =>
      editarAgendamento({
        id: ag.id,
        nome,
        empresa,
        whatsapp,
        contrato,
        materiais: mats,
        materiaisOutros: mats.includes("OUTROS") ? outros : "",
        volume,
        porteCodigo,
        placa,
        motorista,
        observacoes,
        forcar,
      }),
    );


  return (
    <Modal titulo="Editar dados" onFechar={onFechar}>
      <Linha rotulo="Nome" erro={campos.nome}>
        <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} />
      </Linha>
      <Linha rotulo="Empresa" erro={campos.empresa}>
        <input className={campo} value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
      </Linha>
      <Linha rotulo="WhatsApp" erro={campos.whatsapp}>
        <input className={campo} value={whatsapp} onChange={(e) => setWhatsapp(mascararEntrada(e.target.value))} inputMode="tel" />
      </Linha>
      <Linha rotulo="Contrato / obra" erro={campos.contrato}>
        <input className={campo} value={contrato} onChange={(e) => setContrato(e.target.value)} />
      </Linha>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Materiais</legend>
        <div className="grid grid-cols-2 gap-1">
          {materiais.map((m) => (
            <label key={m.codigo} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mats.includes(m.codigo)}
                onChange={() => setMats((a) => (a.includes(m.codigo) ? a.filter((c) => c !== m.codigo) : [...a, m.codigo]))}
              />
              {m.nome}
            </label>
          ))}
        </div>
        {campos.materiais && <span className="text-sm text-red-700">{campos.materiais}</span>}
      </fieldset>
      {mats.includes("OUTROS") && (
        <Linha rotulo="Outros materiais">
          <input className={campo} value={outros} onChange={(e) => setOutros(e.target.value)} />
        </Linha>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Linha rotulo="Volume">
          <select className={campo} value={volume} onChange={(e) => setVolume(e.target.value as Volume)}>
            {VOLUMES.map((v) => (
              <option key={v.valor} value={v.valor}>
                {v.rotulo}
              </option>
            ))}
          </select>
        </Linha>
        <Linha rotulo="Porte">
          <select className={campo} value={porteCodigo} onChange={(e) => setPorteCodigo(e.target.value)}>
            {portes.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nome}
              </option>
            ))}
          </select>
        </Linha>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Linha rotulo="Placa">
          <input className={campo} value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
        </Linha>
        <Linha rotulo="Motorista">
          <input className={campo} value={motorista} onChange={(e) => setMotorista(e.target.value)} />
        </Linha>
      </div>
      <Linha rotulo="Observações">
        <textarea className={campo} rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </Linha>
      <Erro r={resultado} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={btnNeutro} onClick={onFechar}>
          Voltar
        </button>
        {resultado && !resultado.ok && resultado.podeForcar && (
          <button type="button" className={btnAviso} disabled={enviando} onClick={() => enviar(true)}>
            Salvar mesmo assim
          </button>
        )}
        <button type="button" className={btnPrimario} disabled={enviando} onClick={() => enviar(false)}>
          {enviando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}
