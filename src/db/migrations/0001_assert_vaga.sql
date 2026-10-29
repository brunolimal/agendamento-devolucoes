-- SPEC §8: função de vaga. Toda operação que ocupa vaga chama assert_vaga dentro de db.batch.
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
