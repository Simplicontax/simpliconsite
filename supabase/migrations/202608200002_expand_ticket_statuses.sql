alter type public.ticket_status add value if not exists 'work_in_progress';
alter type public.ticket_status add value if not exists 'pending';
alter type public.ticket_status add value if not exists 'pending_for_review';
alter type public.ticket_status add value if not exists 'waiting_for_client';
alter type public.ticket_status add value if not exists 'completed';

create or replace function public.update_ticket_workflow(p_ticket_id uuid, p_status public.ticket_status, p_priority text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.app_role;
  v_assigned_to uuid;
  v_number text;
  v_old_status public.ticket_status;
  v_actor text;
begin
  v_role := public.current_app_role();
  if v_role is null or v_role not in ('admin','team') then raise exception 'Clients cannot update ticket workflow'; end if;
  if p_priority not in ('Low','Normal','High','Urgent') then raise exception 'Invalid priority'; end if;
  select assigned_to,ticket_number,status into v_assigned_to,v_number,v_old_status from public.tickets where id = p_ticket_id;
  if v_number is null then raise exception 'Ticket not found'; end if;
  if v_role = 'team' and v_assigned_to is distinct from auth.uid() then raise exception 'This ticket is not assigned to you'; end if;
  update public.tickets
  set status=p_status,
      priority=p_priority,
      closed_at=case when p_status::text in ('completed','complete') then coalesce(closed_at,now()) else null end
  where id=p_ticket_id;
  select full_name into v_actor from public.profiles where id=auth.uid();
  insert into public.ticket_comments(ticket_id,author_id,body,is_system)
  values(p_ticket_id,auth.uid(),coalesce(v_actor,'A team member') || ' changed status from ' || replace(initcap(v_old_status::text),'_',' ') || ' to ' || replace(initcap(p_status::text),'_',' ') || ' and set priority to ' || p_priority || '.',true);
end;
$$;

revoke execute on function public.update_ticket_workflow(uuid,public.ticket_status,text) from public;
grant execute on function public.update_ticket_workflow(uuid,public.ticket_status,text) to authenticated;
