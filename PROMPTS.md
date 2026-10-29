# PROMPTS — execução por etapa no Claude Code

> Cole um prompt por vez. Cada etapa segue o fluxo do CLAUDE.md: plano → seu "ok" → código → checagens → parada.
> 🧑 = passo manual seu.

---

## Etapa 0 — Preparação (🧑 manual, ~20 min)

1. 🧑 **Neon:** crie o projeto `agendamento-devolucoes` (região mais próxima disponível) e a branch `dev`. Copie as connection strings da branch `dev` (pooled e unpooled).
2. 🧑 **GitHub:** crie o repositório `agendamento-devolucoes` na sua conta pessoal e coloque nele `SPEC.md`, `CLAUDE.md` e `PROMPTS.md`.
3. 🧑 **Hash da senha do admin:** gere com `npx bcryptjs-cli hash "SUA_SENHA"`, ou peça para o Claude Code gerar um script local.
4. 🧑 **Segredos:** gere `SESSION_SECRET` e `IP_HASH_SALT` com `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

---

## Etapa 1 — Setup do projeto
```
Leia CLAUDE.md e SPEC.md (§3, §15, §16). Etapa 1: criar o projeto Next.js com TypeScript strict, Tailwind, ESLint, Vitest, Drizzle e o driver Neon; scripts npm do CLAUDE.md; .env.example; .gitignore; estrutura de pastas da §16 (arquivos vazios ou placeholder); lib/datas.ts com helper "hojeSP()" e formatação pt-BR. Comece pelo plano.
```
**Aceite:** `npm run dev` sobe e `typecheck`, `lint` e `test` passam.

## Etapa 2 — Banco, função de vaga e seed
```
Etapa 2: implemente o schema da SPEC §7 em src/db/schema.ts, a migration custom com assert_vaga (§8) e o seed da §13 (marca neutra, regras padrão, templates da §11, janelas, portes, materiais, ~25 agendamentos em todos os status). Rode só na branch dev. Inclua tests/concorrencia.test.ts (10 reservas simultâneas, capacidade 2 → 2 sucessos) rodando contra o banco dev. Comece pelo plano.
```
**Aceite:** tabelas criadas no Neon `dev`, seed ok e teste de concorrência verde.

## Etapa 3 — Regras de negócio (lib)
```
Etapa 3: implemente lib/config.ts, lib/disponibilidade.ts (RN-01, RN-02, RN-04), lib/regras.ts (transições da §5, RN-06, RN-07, RN-08, RN-18), lib/protocolo.ts (RN-16), lib/telefone.ts (RN-17), lib/templates.ts (render das variáveis da §11) e lib/whatsapp.ts (montagem do link). Testes unitários para cada regra, incluindo virada de dia em America/Sao_Paulo. Sem UI ainda. Comece pelo plano.
```
**Aceite:** testes cobrindo todas as RNs listadas.

## Etapa 4 — Fluxo público
```
Etapa 4: telas da SPEC §9 (/, /agendar com stepper de 4 passos, /agendar/protocolo/[protocolo], /a/[token]) com Server Actions, criação via db.batch + assert_vaga, antiabuso (honeypot, tempo mínimo, rate limit) e cancelamento pelo cliente (RN-08, RN-15). Mobile-first, cor primária vinda da marca. Ilustrações de caminhão e material: SVG simples e genérico criado no projeto. Comece pelo plano.
```
**Aceite (teste manual):**
- Agendar como cliente: o protocolo aparece e não há nada além disso na tela.
- Abrir `/a/[token]`, que você pega no banco: cancelar dentro do prazo funciona e fora do prazo aparece "Falar com a logística".
- Tentar a última vaga em duas abas ao mesmo tempo: a segunda recebe a mensagem amigável.

## Etapa 5 — Painel: login, caixa de entrada e detalhe
```
Etapa 5: auth (SPEC §14: middleware, cookie jose, exigirSessao, limite de tentativas), /painel/login, /painel (caixa de entrada com os 3 blocos, polling de 60s e contador no título), /painel/agendamentos (busca/filtro) e /painel/agendamentos/[id] com todas as ações da §10 (confirmar com modal obrigatório, recusar, reagendar com ocupação e opção forçar, cancelar, editar, concluir, não compareceu), histórico e transações via assert_vaga. Sem envio de mensagem ainda. Comece pelo plano.
```
**Aceite:** todas as transições da §5 funcionam e as inválidas ficam bloqueadas; o histórico é gravado.

## Etapa 6 — Mensagens wa.me e lembretes
```
Etapa 6: painel lateral "Avisar o cliente" (SPEC §10, padrão pós-ação) com template renderizado e editável, botão "Enviar no WhatsApp" (RN-12: grava mensagens_enviadas e depois abre wa.me em nova aba), estado "Enviada em… · Reenviar", ação "Alinhar" e "Mensagem livre", e a tela /painel/lembretes (RN-13). Na página do cliente, o botão "Falar com a logística". Comece pelo plano.
```
**Aceite:** cada ação abre o template certo; o link abre o WhatsApp Web com o texto correto (acentos e emojis ok); o registro aparece no detalhe.

## Etapa 7 — Agenda, agendamento manual e configurações
```
Etapa 7: /painel/agenda (dia/semana com ocupação X/Y), /painel/novo (RN-10) e /painel/config com todas as abas da §10 (incluindo editor de janelas com "copiar para outros dias", exceções de capacidade, bloqueios, e editor de templates com lista de variáveis e pré-visualização). Validação zod de todos os JSONs. Comece pelo plano.
```
**Aceite:** mudar a capacidade, uma regra ou um template no painel reflete na hora, sem deploy.

## Etapa 8 — Google Calendar
1. 🧑 **Antes desta etapa:**
   - No Google Cloud (grátis), crie um projeto, ative a Calendar API, crie a service account e gere a chave JSON.
   - No Google Agenda da sua conta Gmail, crie a agenda "Devoluções – Pátio" e compartilhe com o e-mail da service account com a permissão "Fazer alterações nos eventos".
   - Copie o ID da agenda.
```
Etapa 8: lib/calendar.ts conforme SPEC §12 e RN-14 (syncAgendamento idempotente, timeout de 8s, nunca bloqueia), chamadas após confirmar, reagendar, editar, cancelar, recusar e não compareceu; bloco "Falhas de agenda" com botão Sincronizar; ressincronização de até 5 pendentes ao abrir o painel; modo DESATIVADO sem variáveis de ambiente. Comece pelo plano.
```
**Aceite:**
- Confirmar cria o evento; reagendar move o evento; cancelar remove o evento.
- Com a chave errada, a operação conclui normalmente e o alerta aparece.

## Etapa 9 — Modo demo e acabamento
```
Etapa 9: DEMO_MODE da SPEC §13 (faixa no topo, senha demo no login, botão "Resetar demo"), estados vazios e de carregamento, mensagens de erro amigáveis, acessibilidade (labels, foco, contraste) e revisão mobile das telas públicas. Comece pelo plano.
```
**Aceite:** Lighthouse mobile ≥ 90 (acessibilidade e performance) e o reset recria o cenário completo.

## Etapa 10 — Segurança, documentação e deploy
1. 🧑 **No Neon:** crie a branch `main` (prod) limpa. **Na Vercel** (conta pessoal): importe o repositório e configure as variáveis da §15 com a branch prod e `DEMO_MODE=true`.
```
Etapa 10: rode a auditoria de segurança (skill seguranca-sistemas, se disponível) e corrija o que for apontado; gere o DOCS.md no padrão padrao-documentacao (campos sem informação ficam [a preencher]); revise o checklist de aceite da SPEC §17 item a item. Depois me passe os comandos de migration e seed para prod e aguarde o meu ok antes de rodar. Comece pelo plano.
```
**Aceite:** checklist da §17 100% e demo pública no ar.

---

## Depois do MVP (🧑 configuração no WhatsApp Business da empresa)
- **Mensagem de saudação** com o link de agendamento. Ela só dispara em conversa nova ou após 14 dias sem mensagens.
- **Resposta rápida** `/agendar` com o mesmo link, para os demais casos.
- **Link** no perfil e no catálogo.
- **Computador da logística** logado no WhatsApp Web da empresa, porque é dali que os botões wa.me enviam as mensagens.
