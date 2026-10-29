-- Guarda de status: trava a linha (FOR UPDATE) e falha se o status atual não for o esperado.
-- Evita ação dupla (duas abas confirmando/cancelando o mesmo agendamento) e histórico duplicado.
create or replace function assert_status(p_id uuid, p_esperados text[])
returns void language plpgsql as $$
declare v_status text;
begin
  select status::text into v_status from agendamentos where id = p_id for update;
  if v_status is null then raise exception 'AGENDAMENTO_NAO_ENCONTRADO'; end if;
  if not (v_status = any(p_esperados)) then raise exception 'STATUS_INVALIDO'; end if;
end $$;
