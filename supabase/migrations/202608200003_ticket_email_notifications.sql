create table if not exists public.ticket_email_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  activity_id uuid not null unique references public.ticket_comments(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in ('ticket_created','comment_added','document_uploaded','assignment_changed','workflow_changed')),
  detail text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

create table if not exists public.ticket_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticket_email_events(id) on delete cascade,
  recipient_email text not null,
  attempts integer not null default 0,
  sent_at timestamptz,
  last_error text,
  unique(event_id, recipient_email)
);

create index if not exists ticket_email_events_pending_idx
  on public.ticket_email_events(ticket_id, actor_id, created_at)
  where processed_at is null;

create or replace function public.enqueue_ticket_email_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_event_type text;
begin
  v_event_type := case
    when new.is_system and new.body ilike 'Request routed to %' then 'ticket_created'
    when new.is_system and new.body ilike '% uploaded %' then 'document_uploaded'
    when new.is_system and new.body ilike 'Ticket % has been assigned to %' then 'assignment_changed'
    when new.is_system and new.body ilike '% changed status from %' then 'workflow_changed'
    else 'comment_added'
  end;

  insert into public.ticket_email_events(ticket_id, activity_id, actor_id, event_type, detail, created_at)
  values(new.ticket_id, new.id, new.author_id, v_event_type, new.body, new.created_at)
  on conflict (activity_id) do nothing;
  return new;
end;
$$;

drop trigger if exists enqueue_ticket_email_event_on_activity on public.ticket_comments;
create trigger enqueue_ticket_email_event_on_activity
after insert on public.ticket_comments
for each row execute procedure public.enqueue_ticket_email_event();

alter table public.ticket_email_events enable row level security;
alter table public.ticket_email_deliveries enable row level security;

revoke all privileges on public.ticket_email_events, public.ticket_email_deliveries from anon, authenticated;
revoke execute on function public.enqueue_ticket_email_event() from public;

