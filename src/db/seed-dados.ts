// Dados-padrão do seed (SPEC §7, §11 e §13). Tudo aqui é editável depois no painel.

export const marcaPadrao = {
  nome: "Pátio Demo Locações",
  logo_url: null,
  cor_primaria: "#0f766e",
  whatsapp_empresa: "5511900000000",
  endereco_patio: "Rua Exemplo, 1000 - Distrito Industrial, São Paulo/SP",
  link_maps: "https://maps.google.com/?q=Rua+Exemplo+1000+São+Paulo",
  texto_boas_vindas:
    "Agende a devolução do seu material no nosso pátio. Escolha a data, o horário e o tipo de caminhão.",
  regras_aceite:
    "Declaro que as informações são verdadeiras e que cheguei dentro do horário agendado. O descarregamento depende da conferência do material pela equipe do pátio.",
};

export const regrasPadrao = {
  antecedencia_min_dias: 7,
  antecedencia_max_dias: 60,
  prazo_cancel_dias: 2,
  sla_decisao_dias: 3,
  dias_lembrete: 1,
};

export const templatesPadrao = {
  confirmacao: `Olá, {nome}! Aqui é da {nome_empresa}. ✅ Sua devolução está CONFIRMADA.

📋 Protocolo: {protocolo}
📅 {dia_semana}, {data}, das {hora_inicio} às {hora_fim}
🚚 Caminhão: {porte}
📍 {endereco_patio} {link_maps}

Ver ou cancelar (até {limite_cancelamento}): {link}

Qualquer dúvida ou alteração, é só responder esta mensagem. 👍`,
  alinhamento: `Olá, {nome}! Aqui é da {nome_empresa}. Recebemos sua solicitação {protocolo} para {data}, das {hora_inicio} às {hora_fim}.

Para confirmar, precisamos saber o tamanho do caminhão e o volume aproximado do material. Se preferir, mande uma foto do material aqui mesmo.

É só responder esta mensagem. 🙂`,
  recusa: `Olá, {nome}! Aqui é da {nome_empresa}. Infelizmente não conseguimos confirmar a devolução {protocolo} para {data}, das {hora_inicio} às {hora_fim}.

Motivo: {motivo}

Responda esta mensagem que combinamos outra data com você.`,
  lembrete: `Olá, {nome}! Lembrete da {nome_empresa}: sua devolução é {dia_semana}, {data}, das {hora_inicio} às {hora_fim}.

📋 Protocolo: {protocolo}
📍 {endereco_patio} {link_maps}

Se algo mudou, é só responder esta mensagem.`,
  reagendamento: `Olá, {nome}! Aqui é da {nome_empresa}. Sua devolução {protocolo} foi REAGENDADA:

De: {data_anterior}, {janela_anterior}
Para: {dia_semana}, {data}, das {hora_inicio} às {hora_fim}

Detalhes: {link}

Qualquer dúvida, é só responder esta mensagem.`,
  cancelamento_empresa: `Olá, {nome}! Aqui é da {nome_empresa}. Precisamos cancelar a devolução {protocolo} de {data}.

Motivo: {motivo}

Responda esta mensagem que remarcamos com você.`,
  cancelamento_cliente_ok: `Olá, {nome}! Recebemos o cancelamento da devolução {protocolo} de {data}. Quando quiser remarcar, é só responder esta mensagem.`,
};

const PREENCHER = "[preencher pela empresa]";

export const portesPadrao = [
  { codigo: "VUC", nome: "VUC", descricao: PREENCHER, pesoVagas: 1, ordem: 1 },
  { codigo: "TRES_QUARTOS", nome: "3/4", descricao: PREENCHER, pesoVagas: 1, ordem: 2 },
  { codigo: "TOCO", nome: "Toco", descricao: PREENCHER, pesoVagas: 1, ordem: 3 },
  { codigo: "TRUCK", nome: "Truck", descricao: PREENCHER, pesoVagas: 2, ordem: 4 },
  { codigo: "CARRETA", nome: "Carreta", descricao: PREENCHER, pesoVagas: 2, ordem: 5 },
  { codigo: "NAO_SEI", nome: "Não sei", descricao: "Alinhamos com você pelo WhatsApp", pesoVagas: 1, ordem: 6 },
];

export const materiaisPadrao = [
  { codigo: "ESCORAS", nome: "Escoras", ordem: 1 },
  { codigo: "FORMAS", nome: "Formas", ordem: 2 },
  { codigo: "ANDAIMES", nome: "Andaimes", ordem: 3 },
  { codigo: "PERFIS_VIGAS", nome: "Perfis e vigas", ordem: 4 },
  { codigo: "TORRES", nome: "Torres", ordem: 5 },
  { codigo: "ACESSORIOS", nome: "Acessórios", ordem: 6 },
  { codigo: "OUTROS", nome: "Outros", ordem: 7 },
];

// Seg–Sex, capacidade 2 (SPEC §13).
export const horariosJanelas: [string, string][] = [
  ["08:00", "09:00"],
  ["09:00", "10:00"],
  ["10:00", "11:00"],
  ["11:00", "12:00"],
  ["13:00", "14:00"],
  ["14:00", "15:00"],
  ["15:00", "16:00"],
  ["16:00", "17:00"],
];
export const capacidadePadrao = 2;
