alter table public.tickets
  add column if not exists requester_email text,
  add column if not exists requester_name text;

update public.tickets as ticket
set requester_email = profile.email,
    requester_name = profile.full_name
from public.profiles as profile
where ticket.requester_id = profile.id
  and ticket.requester_email is null;

create index if not exists tickets_requester_email_idx
  on public.tickets (lower(requester_email));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''), split_part(new.email,'@',1)),
    'client'::public.app_role
  )
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;

  update public.tickets
  set requester_id = new.id,
      requester_name = coalesce(nullif(requester_name, ''), coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''), split_part(new.email,'@',1)))
  where lower(requester_email) = lower(new.email)
    and requester_id is distinct from new.id;

  return new;
end;
$$;

create or replace function public.log_new_ticket()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  insert into public.ticket_comments(ticket_id,author_id,body,is_system)
  values(new.id,coalesce(auth.uid(), new.requester_id),'Request routed to info@simplicontax.com.',true);
  return new;
end; $$;

drop policy if exists "Ticket participants read comments" on public.ticket_comments;
create policy "Ticket participants read comments" on public.ticket_comments for select to authenticated using (
  exists(
    select 1 from public.tickets ticket where ticket.id = ticket_id and (
      public.is_admin() or ticket.requester_id = auth.uid() or ticket.assigned_to = auth.uid()
    )
  )
);

drop policy if exists "Ticket participants add comments" on public.ticket_comments;
create policy "Ticket participants add comments" on public.ticket_comments for insert to authenticated with check (
  author_id = auth.uid() and not is_system and exists(
    select 1 from public.tickets ticket where ticket.id = ticket_id and (
      public.is_admin() or ticket.requester_id = auth.uid() or ticket.assigned_to = auth.uid()
    )
  )
);

alter table public.ticket_comments replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.ticket_comments;
exception when duplicate_object then null;
end $$;