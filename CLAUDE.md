# CLAUDE.md — Agendamento de Devoluções

## Contexto
Sistema de agendamento de devoluções de material no pátio, com aprovação no painel e comunicação por links wa.me. É um projeto de portfólio: marca neutra e configurável, custo zero.

**`SPEC.md` é a fonte da verdade.** Em caso de dúvida ou conflito, pergunte; nunca invente regra.

## Stack (não trocar sem aprovação)
Next.js (App Router, Server Actions) · TypeScript strict · Tailwind · Neon Postgres · Drizzle ORM + `@neondatabase/serverless` · zod · date-fns + `@date-fns/tz` · jose + bcryptjs · Google Calendar via service account · Vitest.

Não adicionar dependências fora desta lista sem perguntar.

## Ambiente
- Windows, VSCode, npm.
- Comandos: `npm run dev` · `npm run test` · `npm run db:generate` · `npm run db:migrate` · `npm run db:seed` · `npm run lint` · `npm run typecheck`.
- Banco: branch `dev` do Neon no `.env.local`. **Nunca rodar migration ou seed na branch `main` (prod) sem eu pedir explicitamente.**

## Forma de trabalhar (obrigatório)
1. Cada etapa do `PROMPTS.md` começa com **plano sem código**: arquivos a criar ou alterar, decisões e riscos. Faça todas as perguntas de uma vez e **aguarde o meu "ok"**.
2. Implemente só o escopo da etapa.
3. Ao terminar, rode `typecheck`, `lint` e `test`, depois responda com: o que foi feito, como testar manualmente (passo a passo curto) e pendências. **Pare e aguarde aprovação** antes da próxima etapa.
4. Respostas curtas e objetivas. Não repita código que não mudou.

## Regras de código
- **Vaga:** toda operação que ocupa vaga usa `assert_vaga()` dentro de `db.batch` (SPEC §8). Proibido checar capacidade só em TypeScript.
- **Datas:** "hoje" e todas as comparações são feitas em `America/Sao_Paulo` via `lib/datas.ts`. Nunca usar `new Date()` cru para regra de negócio.
- **Validação:** toda entrada externa passa por zod, e toda Server Action do painel chama `exigirSessao()`.
- **Configuração:** nenhuma regra, texto de mensagem ou marca hardcoded. Ler de `configuracao` via `lib/config.ts` (com cache por request).
- **Calendar:** nunca pode quebrar o fluxo principal. Sempre usar try/catch, timeout e gravação de `calendar_sync`.
- **Histórico:** toda mudança grava em `historico`.
- **Nomes:** UI e textos em pt-BR; identificadores de domínio em português (`agendamento`, `janela`, `porte`).
- **Segurança:** nada de segredo em código, log ou commit. `.env.example` só com nomes.

## Antes de deploy (se as skills estiverem disponíveis)
Rodar a auditoria de segurança (`seguranca-sistemas`), gerar ou atualizar o `DOCS.md` no padrão `padrao-documentacao` e, por fim, fazer o deploy.
