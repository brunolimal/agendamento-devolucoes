# SPEC — Agendamento de Devoluções no Pátio

> Fonte da verdade do projeto. Qualquer mudança de regra deve ser feita aqui antes do código.
> Status: aprovado para implementação (MVP) · Fuso: America/Sao_Paulo · Idioma da UI: pt-BR

---

## 1. Objetivo

O cliente agenda sozinho a devolução de material no pátio, por um link. A empresa **aprova ou recusa** a solicitação num painel. Toda a comunicação com o cliente é feita por mensagens WhatsApp pré-preenchidas (links `wa.me`), enviadas pelo colaborador a partir do WhatsApp da empresa. O cliente responde na mesma conversa para tirar dúvidas ou pedir alterações.

Custo zero. Sem API oficial do WhatsApp. Sem e-mail.

## 2. Escopo

**MVP:**
- Agendamento público com controle de vagas.
- Tela de protocolo.
- Página do cliente (ver/cancelar).
- Painel com aprovação, recusa, cancelamento, reagendamento, lembretes, agendamento manual e configurações.
- Mensagens wa.me com histórico.
- Sincronização com Google Calendar (não bloqueante).
- Marca configurável.
- Modo demo.

**Fora do MVP:**
- Upload de fotos (o cliente envia pelo WhatsApp).
- Multiempresa.
- Validação do contrato contra o ERP.
- Múltiplos usuários no painel.
- Envio automático de WhatsApp.
- Push e e-mail.

## 3. Stack

| Camada | Escolha |
|---|---|
| App | Next.js (estável atual, App Router, Server Actions) + TypeScript strict |
| UI | Tailwind CSS; componentes próprios simples (sem libs pesadas) |
| Banco | Neon Postgres; branches `dev` e `main` (prod) |
| ORM | Drizzle ORM + drizzle-kit + `@neondatabase/serverless` (driver HTTP, `db.batch` para transações) |
| Validação | zod (todas as entradas de formulário e todos os JSONs de config) |
| Datas | date-fns + `@date-fns/tz` (tudo calculado em America/Sao_Paulo) |
| Auth | Senha única do admin (hash bcrypt em env) + cookie de sessão assinado com `jose` |
| Agenda | Google Calendar API via service account (`googleapis` ou `google-auth-library` + fetch) |
| Testes | Vitest (regras de negócio + teste de concorrência) |
| Deploy | Vercel, conta pessoal. O plano Hobby é aceitável para portfólio; uso comercial exige Pro ou outro host |

## 4. Fluxo geral

```
CLIENTE                                   COLABORADOR (painel)
  │ abre link (vindo da saudação do WhatsApp Business)
  │ escolhe data/janela → dados → carga → revisa → aceita
  ▼
[SOLICITADO] ── tela de protocolo (só isso) 
                                          ▼
                              Caixa de entrada mostra a solicitação
                              ├─ requer alinhamento? → botão wa.me "Alinhar"
                              ├─ Confirmar (porte/volume obrigatórios) → [CONFIRMADO]
                              │     └─ botão wa.me "Enviar confirmação" (com link do cliente)
                              └─ Recusar (motivo) → [RECUSADO] → wa.me "Enviar recusa"
CONFIRMADO:
  ├─ D-1: tela Lembretes → wa.me "Enviar lembrete"
  ├─ Reagendar (colaborador) → wa.me "Enviar reagendamento"
  ├─ Cancelar (colaborador) → [CANCELADO_EMPRESA] → wa.me "Enviar cancelamento"
  ├─ Cliente cancela pelo link (até o prazo) → [CANCELADO_CLIENTE] → alerta na caixa de entrada
  └─ Após a data: [CONCLUIDO] ou [NAO_COMPARECEU]
```

Todas as mensagens terminam com o convite para responder na própria conversa (ver §11).

## 5. Máquina de estados

| Status | Ocupa vaga? | Transições permitidas |
|---|---|---|
| `SOLICITADO` | Sim | → CONFIRMADO, RECUSADO, CANCELADO_CLIENTE, CANCELADO_EMPRESA |
| `CONFIRMADO` | Sim | → CANCELADO_CLIENTE, CANCELADO_EMPRESA, CONCLUIDO, NAO_COMPARECEU; reagendar (continua CONFIRMADO) |
| `RECUSADO` | Não | final |
| `CANCELADO_CLIENTE` | Não | final |
| `CANCELADO_EMPRESA` | Não | final |
| `CONCLUIDO` | Não | final |
| `NAO_COMPARECEU` | Não | final |

**Flag independente:** `requer_alinhamento` (boolean). Fica `true` quando o porte ou o volume é `NAO_SEI` e volta a `false` quando os dois são definidos.

Na UI cada status tem uma cor fixa:

| Status | Cor |
|---|---|
| SOLICITADO | amarelo |
| CONFIRMADO | verde |
| RECUSADO e cancelados | cinza/vermelho |
| CONCLUIDO | azul |
| NAO_COMPARECEU | laranja |

## 6. Regras de negócio

Todos os números ficam em `configuracao.regras` e são editáveis no painel.

| ID | Regra |
|---|---|
| RN-01 | **Datas disponíveis ao cliente:** de `hoje + antecedencia_min_dias` (padrão **7**) até `hoje + antecedencia_max_dias` (padrão **60**). Só dias com janela ativa, sem bloqueio e com capacidade restante ≥ peso do porte escolhido. "Hoje" é sempre calculado em America/Sao_Paulo. |
| RN-02 | **Ocupação de uma janela:** soma de `peso_vagas` dos agendamentos `SOLICITADO` + `CONFIRMADO` naquela data e janela. A capacidade é `janelas.capacidade`, ou `capacidade_excecoes.capacidade` se existir exceção para a data. |
| RN-03 | **Toda operação que ocupa vaga** (criar, confirmar com mudança de porte, reagendar) roda em transação: `assert_vaga(...)` e, na sequência, `INSERT`/`UPDATE` no mesmo `db.batch`. Nunca checar vaga só no app. |
| RN-04 | **Peso do porte** vem de `portes_caminhao.peso_vagas`. Padrões: VUC 1, 3/4 1, Toco 1, Truck 2, Carreta 2, NAO_SEI 1 (provisório). |
| RN-05 | **Criação pelo cliente:** status `SOLICITADO`, `origem = CLIENTE`, `requer_alinhamento` calculado conforme §5. |
| RN-06 | **Prazo de decisão:** um SOLICITADO deve ser confirmado ou recusado até `data - sla_decisao_dias` (padrão **3**). O painel classifica: no prazo / vence em ≤ 1 dia / vencido. Não há ação automática. |
| RN-07 | **Confirmar** exige porte ≠ NAO_SEI e volume ≠ NAO_SEI (o modal obriga preencher). O peso é recalculado e a vaga revalidada. Se faltar vaga, o modal oferece "Confirmar mesmo assim" (`forcar = true`), que fica registrado no histórico. |
| RN-08 | **Cancelamento pelo cliente** (página do token): permitido se o status for SOLICITADO ou CONFIRMADO **e** `hoje ≤ data - prazo_cancel_dias` (padrão **2**). Fora do prazo, a página mostra o botão "Falar com a logística" (wa.me para a empresa). Exige confirmação em 2 cliques. |
| RN-09 | **Colaborador** pode cancelar ou reagendar a qualquer momento. O reagendamento ignora a antecedência mínima, respeita a capacidade (com opção de forçar), mantém protocolo e token e registra data/janela anterior no histórico. |
| RN-10 | **Agendamento manual** pelo painel (`origem = PAINEL`) ignora as antecedências mínima e máxima. Por padrão já nasce CONFIRMADO (checkbox editável). |
| RN-11 | **Histórico:** toda mudança de status, data, janela, porte, volume ou dados grava uma linha em `historico` (autor: CLIENTE, ADMIN ou SISTEMA). |
| RN-12 | **Mensagem wa.me:** ao clicar em "Enviar no WhatsApp", grava `mensagens_enviadas` (tipo + texto final) **antes** de abrir o link. Depois o botão mostra "Enviada em DD/MM HH:MM · Reenviar". |
| RN-13 | **Lembretes:** a tela lista os CONFIRMADOS com data entre `hoje + dias_lembrete` (padrão **1**) e o primeiro dia a partir dele com janela ativa (na sexta aparece a segunda), sem mensagem do tipo `LEMBRETE` enviada depois do último reagendamento, além de um atalho para os SOLICITADOS com prazo vencido. |
| RN-14 | **Calendar:** cria o evento ao CONFIRMAR, atualiza ao REAGENDAR ou editar e remove ao cancelar, recusar ou marcar não comparecimento. **Falha nunca bloqueia a operação:** grava `calendar_sync = 'ERRO'` e `calendar_erro`, e o painel mostra o alerta com botão "Sincronizar". Ao abrir o painel, tenta ressincronizar até 5 pendentes. Se as variáveis do Google não estiverem definidas, `calendar_sync = 'DESATIVADO'`. |
| RN-15 | **Cancelamentos feitos pelo cliente** aparecem na caixa de entrada até o colaborador clicar em "Visto" (`visto_em`). |
| RN-16 | **Protocolo:** `DEV-AAMM-NNNN` (ano/mês da criação + sequência global com zero à esquerda). Token: 32 caracteres aleatórios URL-safe, único. |
| RN-17 | **Telefone:** guardado só com dígitos, com DDI. Se a pessoa digitar 10 ou 11 dígitos, prefixa `55`. Valida entre 12 e 13 dígitos. |
| RN-18 | **CONCLUIDO e NAO_COMPARECEU** só ficam disponíveis a partir da data do agendamento. |

## 7. Modelo de dados

Drizzle schema em `src/db/schema.ts`. Funções SQL ficam em migration custom. Os nomes abaixo são obrigatórios.

```sql
-- Configuração única (1 linha, id = 1). JSONs validados por zod no app.
create table configuracao (
  id int primary key default 1 check (id = 1),
  marca jsonb not null,      -- {nome, logo_url, cor_primaria, whatsapp_empresa, endereco_patio, link_maps, texto_boas_vindas, regras_aceite}
  regras jsonb not null,     -- {antecedencia_min_dias:7, antecedencia_max_dias:60, prazo_cancel_dias:2, sla_decisao_dias:3, dias_lembrete:1}
  templates jsonb not null,  -- {confirmacao, recusa, alinhamento, lembrete, reagendamento, cancelamento_empresa, cancelamento_cliente_ok}
  atualizado_em timestamptz not null default now()
);

create table janelas (
  id serial primary key,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0 = domingo (igual ao extract(dow))
  hora_inicio time not null,
  hora_fim time not null check (hora_fim > hora_inicio),
  capacidade smallint not null check (capacidade >= 0),
  ativo boolean not null default true
);

create table capacidade_excecoes (
  data date not null,
  janela_id int not null references janelas(id),
  capacidade smallint not null check (capacidade >= 0),
  primary key (data, janela_id)
);

create table bloqueios (
  id serial primary key,
  data date not null,
  janela_id int references janelas(id), -- null = dia inteiro
  motivo text not null
);

create table portes_caminhao (
  codigo text primary key,   -- VUC, TRES_QUARTOS, TOCO, TRUCK, CARRETA, NAO_SEI
  nome text not null,
  descricao text,            -- texto curto de ajuda ("até X m de carroceria") → [preencher pela empresa]
  imagem_url text,           -- ilustração própria/genérica
  peso_vagas smallint not null default 1,
  ordem smallint not null,
  ativo boolean not null default true
);

create table materiais (
  codigo text primary key,   -- ESCORAS, FORMAS, ANDAIMES, PERFIS_VIGAS, TORRES, ACESSORIOS, OUTROS
  nome text not null,
  ordem smallint not null,
  ativo boolean not null default true
);

create type status_agendamento as enum
  ('SOLICITADO','CONFIRMADO','RECUSADO','CANCELADO_CLIENTE','CANCELADO_EMPRESA','CONCLUIDO','NAO_COMPARECEU');
create type volume_carga as enum ('PEQUENO','MEDIO','GRANDE','NAO_SEI');
create type origem_agendamento as enum ('CLIENTE','PAINEL');
create type calendar_sync as enum ('NAO_APLICA','PENDENTE','OK','ERRO','DESATIVADO');

create sequence protocolo_seq;

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique,
  token text not null unique,
  data date not null,
  janela_id int not null references janelas(id),
  status status_agendamento not null default 'SOLICITADO',
  requer_alinhamento boolean not null default false,
  origem origem_agendamento not null default 'CLIENTE',
  nome text not null,
  empresa text not null,
  whatsapp text not null,
  contrato text not null,
  materiais text[] not null,          -- códigos de materiais
  materiais_outros text,
  volume volume_carga not null,
  porte_codigo text not null references portes_caminhao(codigo),
  peso_vagas smallint not null,
  placa text,
  motorista text,
  observacoes text,
  aceite_em timestamptz,
  motivo text,                        -- recusa/cancelamento
  visto_em timestamptz,               -- RN-15
  calendar_event_id text,
  calendar_sync calendar_sync not null default 'NAO_APLICA',
  calendar_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on agendamentos (data, janela_id) where status in ('SOLICITADO','CONFIRMADO');
create index on agendamentos (status);

create table historico (
  id bigserial primary key,
  agendamento_id uuid not null references agendamentos(id) on delete cascade,
  autor text not null check (autor in ('CLIENTE','ADMIN','SISTEMA')),
  acao text not null,                 -- CRIADO, CONFIRMADO, RECUSADO, REAGENDADO, CANCELADO, EDITADO, CONCLUIDO, NAO_COMPARECEU, FORCOU_VAGA
  detalhes jsonb,                     -- {de:{...}, para:{...}, motivo}
  criado_em timestamptz not null default now()
);

create table mensagens_enviadas (
  id bigserial primary key,
  agendamento_id uuid not null references agendamentos(id) on delete cascade,
  tipo text not null,                 -- CONFIRMACAO, RECUSA, ALINHAMENTO, LEMBRETE, REAGENDAMENTO, CANCELAMENTO_EMPRESA, CANCELAMENTO_CLIENTE_OK, LIVRE
  texto text not null,
  enviado_em timestamptz not null default now()
);

create table tentativas_publicas (   -- rate limit simples
  ip_hash text not null,
  criado_em timestamptz not null default now()
);
create index on tentativas_publicas (ip_hash, criado_em);
```

## 8. Função de vaga (obrigatória)

```sql
create or replace function assert_vaga(
  p_data date, p_janela_id int, p_peso int,
  p_excluir_id uuid default null, p_forcar boolean default false
) returns void language plpgsql as $$
declare v_cap int; v_ocupado int; v_bloqueado boolean;
begin
  -- serializa concorrência por data+janela até o fim da transação
  perform pg_advisory_xact_lock(hashtext(p_data::text || ':' || p_janela_id::text));

  select coalesce(e.capacidade, j.capacidade) into v_cap
  from janelas j
  left join capacidade_excecoes e on e.janela_id = j.id and e.data = p_data
  where j.id = p_janela_id and j.ativo and j.dia_semana = extract(dow from p_data);
  if v_cap is null then raise exception 'JANELA_INVALIDA'; end if;

  select exists (select 1 from bloqueios b
                 where b.data = p_data and (b.janela_id is null or b.janela_id = p_janela_id))
  into v_bloqueado;
  if v_bloqueado and not p_forcar then raise exception 'DATA_BLOQUEADA'; end if;

  select coalesce(sum(a.peso_vagas), 0) into v_ocupado
  from agendamentos a
  where a.data = p_data and a.janela_id = p_janela_id
    and a.status in ('SOLICITADO','CONFIRMADO')
    and (p_excluir_id is null or a.id <> p_excluir_id);

  if v_ocupado + p_peso > v_cap and not p_forcar then raise exception 'SEM_VAGA'; end if;
end $$;
```

**Uso no app:** `db.batch([ select assert_vaga(...), insert/update ... ])`, que roda numa transação única no driver HTTP. As exceções `JANELA_INVALIDA`, `DATA_BLOQUEADA` e `SEM_VAGA` viram mensagens amigáveis na UI. Para o cliente: "Esse horário acabou de ser preenchido, escolha outro."

**Teste obrigatório:** disparar 10 criações simultâneas para uma janela com capacidade 2. Resultado esperado: exatamente 2 sucessos.

## 9. Telas públicas

| Rota | Conteúdo |
|---|---|
| `/` | Marca, texto de boas-vindas e botão "Agendar devolução" |
| `/agendar` | Stepper em 4 passos (abaixo). Mobile-first, botões grandes. O estado fica no cliente até o envio |
| `/agendar/protocolo/[protocolo]` | **Somente:** ícone de sucesso, número do protocolo em destaque, botão "Copiar" e o texto "Recebemos sua solicitação. Nossa equipe vai confirmar pelo WhatsApp." Nada mais |
| `/a/[token]` | Página do cliente: status (com cor), resumo, botão "Cancelar agendamento" (RN-08) ou "Falar com a logística", e botão wa.me "Falar com a logística" sempre visível |

**Passos do `/agendar`:**

1. **Data e horário.** Calendário mensal com dias indisponíveis desabilitados. Ao escolher o dia, a página lista as janelas com o selo "vagas restantes: N". A disponibilidade é buscada por Server Action e considera o peso do porte; se o porte ainda não foi escolhido, considera peso 1 e revalida no envio.
2. **Seus dados.** Nome\*, Empresa\*, WhatsApp\* (máscara BR), Nº do contrato/obra\* (texto livre).
3. **Carga.**
   - Materiais\*: multisseleção em cards com ícone; "Outros" abre um campo de texto.
   - Volume\*: Pequeno / Médio / Grande / **Não sei informar**.
   - Caminhão\*: cards com ilustração e descrição curta, mais o card **"Não sei / A alinhar"**.
   - Placa e motorista: opcionais, com o aviso "pode informar depois".
   - Observações.
4. **Revisão.** Resumo de tudo, checkbox de aceite com `marca.regras_aceite` e botão "Solicitar agendamento".

**Antiabuso:**
- Campo honeypot oculto.
- Tempo mínimo de preenchimento de 5 s.
- Máximo de 10 envios por IP por hora (`tentativas_publicas`, IP com hash SHA-256 + salt).

## 10. Painel (`/painel/*`, protegido por proxy)

| Rota | Função |
|---|---|
| `/painel/login` | Campo de senha. No modo demo, mostra a senha de demonstração |
| `/painel` | **Caixa de entrada**, em 3 blocos: (1) **Aguardando decisão**: SOLICITADOS ordenados pelo prazo da RN-06, com selo de prazo e selo "⚠️ Alinhar" se `requer_alinhamento`; (2) **Cancelados pelo cliente** não vistos; (3) **Falhas de agenda**. Atualiza a cada 60 s e mostra o contador no título da aba, por exemplo "(3) Painel" |
| `/painel/agenda` | Visão por dia/semana: cada janela com ocupação `X/Y` e os agendamentos (cores por status). Clique abre o detalhe |
| `/painel/lembretes` | Lista da RN-13 com o botão "Enviar lembrete" em cada linha |
| `/painel/agendamentos` | Busca e filtro (protocolo, nome, empresa, contrato, status, período) |
| `/painel/agendamentos/[id]` | Detalhe completo, histórico, mensagens enviadas e ações (abaixo) |
| `/painel/novo` | Agendamento manual (RN-10). Mesmo formulário, com todas as datas liberadas e indicação de lotação |
| `/painel/config` | Abas: Marca · Regras · Janelas (editor por dia da semana, com "copiar para outros dias") · Exceções de capacidade · Bloqueios · Portes · Materiais · Mensagens (editor com variáveis e pré-visualização) |

**Ações no detalhe:**
- Confirmar (modal com porte e volume obrigatórios se faltarem)
- Recusar (motivo obrigatório)
- Reagendar (seletor de data e janela com ocupação, mais a opção forçar)
- Cancelar (motivo obrigatório)
- Editar dados
- Concluir / Não compareceu
- Alinhar (só mensagem)
- Mensagem livre

**Padrão pós-ação:** depois de toda ação que muda o agendamento, o painel abre o painel lateral **"Avisar o cliente"** com:
- o template correspondente já renderizado, numa textarea editável;
- o botão **"Enviar no WhatsApp"**, que aplica a RN-12 e abre `wa.me` numa nova aba;
- o link "Não enviar agora".

## 11. Mensagens WhatsApp

**Link gerado:** `https://wa.me/{whatsapp_cliente}?text={encodeURIComponent(texto)}`.

A mensagem sai do WhatsApp (Web ou app) logado no computador do colaborador, que deve ser o número da empresa. O cliente responde na mesma conversa.

O botão "Falar com a logística" na página do cliente usa `wa.me/{marca.whatsapp_empresa}?text=Olá! Sobre o agendamento {protocolo}: `.

**Variáveis disponíveis:**

| Variável | Conteúdo |
|---|---|
| `{nome}` | Nome do cliente |
| `{empresa_cliente}` | Empresa do cliente |
| `{protocolo}` | Protocolo |
| `{data}` | DD/MM/AAAA |
| `{dia_semana}` | Dia da semana |
| `{hora_inicio}` / `{hora_fim}` | Horário da janela |
| `{data_anterior}` / `{janela_anterior}` | Data e janela antes do reagendamento |
| `{porte}` | Porte do caminhão |
| `{materiais}` | Materiais |
| `{endereco_patio}` / `{link_maps}` | Endereço e mapa do pátio |
| `{link}` | `APP_URL/a/{token}` |
| `{limite_cancelamento}` | Data limite para cancelar pelo link |
| `{motivo}` | Motivo de recusa/cancelamento |
| `{nome_empresa}` | Nome da empresa (marca) |

**Templates padrão (seed, editáveis):**

**confirmacao**
```
Olá, {nome}! Aqui é da {nome_empresa}. ✅ Sua devolução está CONFIRMADA.

📋 Protocolo: {protocolo}
📅 {dia_semana}, {data}, das {hora_inicio} às {hora_fim}
🚚 Caminhão: {porte}
📍 {endereco_patio} {link_maps}

Ver ou cancelar (até {limite_cancelamento}): {link}

Qualquer dúvida ou alteração, é só responder esta mensagem. 👍
```

**alinhamento**
```
Olá, {nome}! Aqui é da {nome_empresa}. Recebemos sua solicitação {protocolo} para {data}, das {hora_inicio} às {hora_fim}.

Para confirmar, precisamos saber o tamanho do caminhão e o volume aproximado do material. Se preferir, mande uma foto do material aqui mesmo.

É só responder esta mensagem. 🙂
```

**recusa**
```
Olá, {nome}! Aqui é da {nome_empresa}. Infelizmente não conseguimos confirmar a devolução {protocolo} para {data}, das {hora_inicio} às {hora_fim}.

Motivo: {motivo}

Responda esta mensagem que combinamos outra data com você.
```

**lembrete**
```
Olá, {nome}! Lembrete da {nome_empresa}: sua devolução é {dia_semana}, {data}, das {hora_inicio} às {hora_fim}.

📋 Protocolo: {protocolo}
📍 {endereco_patio} {link_maps}

Se algo mudou, é só responder esta mensagem.
```

**reagendamento**
```
Olá, {nome}! Aqui é da {nome_empresa}. Sua devolução {protocolo} foi REAGENDADA:

De: {data_anterior}, {janela_anterior}
Para: {dia_semana}, {data}, das {hora_inicio} às {hora_fim}

Detalhes: {link}

Qualquer dúvida, é só responder esta mensagem.
```

**cancelamento_empresa**
```
Olá, {nome}! Aqui é da {nome_empresa}. Precisamos cancelar a devolução {protocolo} de {data}.

Motivo: {motivo}

Responda esta mensagem que remarcamos com você.
```

**cancelamento_cliente_ok**
```
Olá, {nome}! Recebemos o cancelamento da devolução {protocolo} de {data}. Quando quiser remarcar, é só responder esta mensagem.
```

## 12. Google Calendar

- Service account com acesso de **edição** a uma agenda compartilhada da conta Gmail ("Devoluções – Pátio"). O ID vai em `GOOGLE_CALENDAR_ID`.
- Evento:
  - Título: `✅ {empresa_cliente} · {porte} · {protocolo}`
  - Início e fim: janela em America/Sao_Paulo
  - Descrição: contato, contrato, materiais, volume, placa, observações e link do painel
  - Cor: `colorId` verde para confirmado
- Operações seguem a RN-14. Toda chamada usa timeout de 8 s e try/catch, e grava `calendar_sync` / `calendar_erro`.
- O módulo `lib/calendar.ts` expõe `syncAgendamento(id)`, que é idempotente: decide criar, atualizar ou remover pelo status atual.

## 13. Marca configurável e modo demo

- Nome, logo, cor primária (CSS variable), WhatsApp da empresa, endereço do pátio, link do mapa, texto de boas-vindas e regras de aceite vêm de `configuracao.marca`. Nada de marca fica hardcoded.
- O seed padrão usa uma **marca neutra** ("Pátio Demo Locações"), com WhatsApp e endereço fictícios.
- `DEMO_MODE=true`:
  - faixa "Ambiente de demonstração" no topo;
  - login exibe a senha demo (`DEMO_ADMIN_PASSWORD`);
  - botão **"Resetar demo"** em `/painel/config`, que trunca as tabelas operacionais e roda o seed com ~25 agendamentos fictícios espalhados em todos os status (incluindo pendentes de alinhamento, prazos vencidos e cancelados pelo cliente);
  - Calendar desativado, a menos que as variáveis estejam definidas.

**Padrões de janelas no seed** (são suposições de demonstração, a empresa define os reais):
- Seg–Sex: 08–09, 09–10, 10–11, 11–12, 13–14, 14–15, 15–16, 16–17.
- Capacidade 2 em cada janela.
- Portes e materiais conforme a §7.

## 14. Segurança

- `proxy.ts` (Next 16, antigo `middleware.ts`) protege `/painel/*`, exceto `/painel/login`.
- Cookie `sessao`: httpOnly, secure, sameSite=lax, validade de 12 h, assinado com `SESSION_SECRET` (HS256).
- Login: até 5 tentativas erradas por IP a cada 15 min.
- Server Actions do painel revalidam a sessão no servidor (não confiar só no proxy).
- Token do cliente: 32 caracteres aleatórios. A página `/a/[token]` não expõe telefone completo (mascarado) nem o id interno.
- Nenhum segredo no repositório. `.env.local` fica no `.gitignore` e `.env.example` só tem os nomes.
- Headers: `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
- Toda entrada passa por zod. As queries são parametrizadas (Drizzle). Sem SQL concatenado, exceto nas migrations.

## 15. Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Neon pooled (app) |
| `DATABASE_URL_UNPOOLED` | Neon direto (migrations) |
| `APP_URL` | URL pública, sem barra final |
| `SESSION_SECRET` | 32+ bytes aleatórios |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt da senha do admin |
| `IP_HASH_SALT` | Salt para hash de IP |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Opcional |
| `GOOGLE_PRIVATE_KEY` | Opcional (com `\n` escapados) |
| `GOOGLE_CALENDAR_ID` | Opcional |
| `DEMO_MODE` | `true` / `false` |
| `DEMO_ADMIN_PASSWORD` | Só usado com `DEMO_MODE=true` |

## 16. Estrutura de pastas

```
src/
  app/
    page.tsx
    agendar/ (page.tsx, protocolo/[protocolo]/page.tsx, actions.ts)
    a/[token]/ (page.tsx, actions.ts)
    painel/
      login/ · page.tsx (caixa de entrada) · agenda/ · lembretes/ · agendamentos/ · agendamentos/[id]/ · novo/ · config/
      actions/ (agendamentos.ts, config.ts, mensagens.ts, demo.ts)
  components/ (ui/, publico/, painel/)
  db/ (schema.ts, index.ts, seed.ts, migrations/)
  lib/ (datas.ts, disponibilidade.ts, regras.ts, protocolo.ts, telefone.ts, templates.ts, whatsapp.ts, calendar.ts, auth.ts, rate-limit.ts, config.ts)
  proxy.ts  (Next 16: substitui middleware.ts)
tests/ (regras.test.ts, disponibilidade.test.ts, templates.test.ts, concorrencia.test.ts)
DOCS.md · .env.example · CLAUDE.md · SPEC.md
```

## 17. Critérios de aceite do MVP

- [ ] O cliente só vê datas a partir de D+7 e até D+60, sem bloqueios e com vaga.
- [ ] Teste de concorrência: 10 reservas simultâneas em capacidade 2 resultam em 2 sucessos.
- [ ] Truck ou Carreta consome 2 vagas; "Não sei" consome 1 e recalcula ao confirmar.
- [ ] A tela de protocolo mostra só o protocolo e o texto padrão.
- [ ] A caixa de entrada ordena por prazo e destaca "Alinhar", vencidos e cancelados pelo cliente.
- [ ] Confirmar com porte/volume "Não sei" exige preenchimento.
- [ ] Toda ação abre "Avisar o cliente" com o template certo, e o envio fica registrado.
- [ ] O cliente cancela pelo link até D-2. Depois disso, só aparece "Falar com a logística".
- [ ] O reagendamento mantém o protocolo e registra o histórico.
- [ ] Com o Calendar desligado ou com erro, tudo continua funcionando, e o alerta e a ressincronização funcionam.
- [ ] Todas as regras e templates são editáveis no painel, sem deploy.
- [ ] Resetar demo recria um cenário completo.
- [ ] Lighthouse mobile ≥ 90 em acessibilidade e performance nas telas públicas.
