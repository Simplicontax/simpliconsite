create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin', 'team', 'client');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status as enum ('new', 'open', 'work_in_progress', 'pending', 'pending_for_review', 'waiting_for_client', 'completed', 'waiting_on_client', 'in_review', 'ready_for_review', 'complete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_type as enum ('Tax Draft', 'Revised Draft', 'Final Tax Draft', 'Client Copy');
exception when duplicate_object then null; end $$;

create sequence if not exists public.ticket_number_seq start 2000;

create or replace function public.next_ticket_number()
returns text language sql volatile set search_path = ''
as $$ select 'ST-' || lpad(nextval('public.ticket_number_seq')::text, 6, '0') $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  phone text,
  job_title text,
  role public.app_role not null default 'client',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default public.next_ticket_number(),
  requester_id uuid not null references public.profiles(id),
  subject text not null check (char_length(subject) between 3 and 180),
  description text not null,
  country text not null check (country in ('United States','United Kingdom','Canada','India')),
  tax_year integer not null check (tax_year between 2000 and 2100),
  status public.ticket_status not null default 'new',
  priority text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 5000),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_documents (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  document_type public.document_type,
  created_at timestamptz not null default now()
);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  phone text not null,
  job_title text not null,
  invited_by uuid not null references public.profiles(id),
  auth_user_id uuid references auth.users(id),
  status text not null default 'invited',
  created_at timestamptz not null default now()
);

create index if not exists tickets_requester_idx on public.tickets(requester_id);
create index if not exists tickets_assigned_idx on public.tickets(assigned_to);
create index if not exists comments_ticket_idx on public.ticket_comments(ticket_id, created_at desc);
create index if not exists documents_ticket_idx on public.ticket_documents(ticket_id, created_at desc);

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
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.route_new_ticket_to_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select id into new.assigned_to from public.profiles where lower(email) = 'info@simplicontax.com' and role = 'admin' and active limit 1;
  if new.assigned_to is null then raise exception 'The Simplicon admin account is not configured'; end if;
  return new;
end;
$$;

drop trigger if exists route_ticket_to_admin on public.tickets;
create trigger route_ticket_to_admin before insert on public.tickets for each row execute procedure public.route_new_ticket_to_admin();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles for each row execute procedure public.touch_updated_at();
drop trigger if exists touch_tickets on public.tickets;
create trigger touch_tickets before update on public.tickets for each row execute procedure public.touch_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and active and lower(email) = 'info@simplicontax.com') $$;

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function public.assign_ticket(p_ticket_id uuid, p_assignee_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_number text;
  v_assignee_name text;
begin
  if not public.is_admin() then raise exception 'Only the Simplicon administrator can assign tickets'; end if;
  select full_name into v_assignee_name from public.profiles where id = p_assignee_id and role = 'team' and active;
  if v_assignee_name is null then raise exception 'Choose an active team member'; end if;
  update public.tickets set assigned_to = p_assignee_id, status = 'open' where id = p_ticket_id returning ticket_number into v_number;
  if v_number is null then raise exception 'Ticket not found'; end if;
  insert into public.ticket_comments(ticket_id,author_id,body,is_system) values(p_ticket_id,auth.uid(),'Ticket ' || v_number || ' has been assigned to ' || v_assignee_name || '.',true);
end;
$$;

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
  update public.tickets set status=p_status,priority=p_priority,closed_at=case when p_status::text in ('completed','complete') then coalesce(closed_at,now()) else null end where id=p_ticket_id;
  select full_name into v_actor from public.profiles where id=auth.uid();
  insert into public.ticket_comments(ticket_id,author_id,body,is_system) values(p_ticket_id,auth.uid(),coalesce(v_actor,'A team member') || ' changed status from ' || replace(initcap(v_old_status::text),'_',' ') || ' to ' || replace(initcap(p_status::text),'_',' ') || ' and set priority to ' || p_priority || '.',true);
end;
$$;

create or replace function public.log_new_ticket()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  insert into public.ticket_comments(ticket_id,author_id,body,is_system) values(new.id,new.requester_id,'Request routed to info@simplicontax.com.',true);
  return new;
end; $$;
drop trigger if exists log_new_ticket_activity on public.tickets;
create trigger log_new_ticket_activity after insert on public.tickets for each row execute procedure public.log_new_ticket();

create or replace function public.log_document_upload()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_uploader text;
begin
  select full_name into v_uploader from public.profiles where id=new.uploaded_by;
  insert into public.ticket_comments(ticket_id,author_id,body,is_system) values(new.ticket_id,new.uploaded_by,coalesce(v_uploader,'A user') || ' uploaded ' || new.file_name || case when new.document_type is null then '.' else ' as ' || new.document_type::text || '.' end,true);
  return new;
end;
$$;
drop trigger if exists log_document_upload_activity on public.ticket_documents;
create trigger log_document_upload_activity after insert on public.ticket_documents for each row execute procedure public.log_document_upload();

alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_documents enable row level security;
alter table public.team_invites enable row level security;

drop policy if exists "Profiles readable by authenticated users" on public.profiles;
create policy "Profiles readable by authenticated users" on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin() or exists(
    select 1 from public.tickets t where
      (t.requester_id = auth.uid() and t.assigned_to = profiles.id) or
      (t.assigned_to = auth.uid() and t.requester_id = profiles.id)
  )
);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = public.current_app_role());
drop policy if exists "Admin manages profiles" on public.profiles;
create policy "Admin manages profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Clients create own requests" on public.tickets;
create policy "Clients create own requests" on public.tickets for insert to authenticated with check (requester_id = auth.uid() and public.current_app_role() = 'client');
drop policy if exists "Clients read own requests" on public.tickets;
create policy "Clients read own requests" on public.tickets for select to authenticated using (requester_id = auth.uid());
drop policy if exists "Team read assigned requests" on public.tickets;
create policy "Team read assigned requests" on public.tickets for select to authenticated using (assigned_to = auth.uid() and public.current_app_role() = 'team');
drop policy if exists "Team update assigned requests" on public.tickets;
create policy "Team update assigned requests" on public.tickets for update to authenticated using (assigned_to = auth.uid() and public.current_app_role() = 'team') with check (assigned_to = auth.uid());
drop policy if exists "Admin manages all requests" on public.tickets;
create policy "Admin manages all requests" on public.tickets for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Ticket participants read comments" on public.ticket_comments;
create policy "Ticket participants read comments" on public.ticket_comments for select to authenticated using (exists(select 1 from public.tickets t where t.id = ticket_id));
drop policy if exists "Ticket participants add comments" on public.ticket_comments;
create policy "Ticket participants add comments" on public.ticket_comments for insert to authenticated with check (author_id = auth.uid() and not is_system and exists(select 1 from public.tickets t where t.id = ticket_id));

drop policy if exists "Ticket participants read document metadata" on public.ticket_documents;
create policy "Ticket participants read document metadata" on public.ticket_documents for select to authenticated using (exists(select 1 from public.tickets t where t.id = ticket_id));
drop policy if exists "Ticket participants add document metadata" on public.ticket_documents;
create policy "Ticket participants add document metadata" on public.ticket_documents for insert to authenticated with check (uploaded_by = auth.uid() and exists(select 1 from public.tickets t where t.id = ticket_id) and ((public.current_app_role() = 'client' and document_type is null) or (public.current_app_role() in ('admin','team') and document_type is not null)));

drop policy if exists "Admin reads team invites" on public.team_invites;
create policy "Admin reads team invites" on public.team_invites for select to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-documents','ticket-documents',false,52428800,null)
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Ticket participants upload files" on storage.objects;
create policy "Ticket participants upload files" on storage.objects for insert to authenticated with check (
  bucket_id='ticket-documents'
  and exists(select 1 from public.tickets t where t.id::text=(storage.foldername(name))[1])
  and not (lower(coalesce(storage.extension(name),'')) = any(array['bat','cmd','com','exe','msi','msp','scr','ps1','psm1','vbs','vbe','js','jse','jar','sh','bash','zsh','ksh','csh','apk','app','dmg','iso','reg','dll','sys','lnk','url','php','phtml','py','pyc','rb','pl','cgi','wasm','html','htm','svg','env','htaccess','docm','xlsm','pptm','mp4','mov','avi','mkv','webm','wmv','m4v','mpeg','mpg','3gp','flv','ogv']::text[]))
  and coalesce(metadata->>'mimetype','') not ilike 'video/%'
  and lower(coalesce(metadata->>'mimetype','')) <> all(array['application/x-msdownload','application/x-dosexec','application/x-executable','application/x-sh','application/x-bat','application/java-archive','application/vnd.microsoft.portable-executable','text/html','image/svg+xml','application/wasm']::text[])
);
drop policy if exists "Ticket participants read files" on storage.objects;
create policy "Ticket participants read files" on storage.objects for select to authenticated using (bucket_id='ticket-documents' and exists(select 1 from public.tickets t where t.id::text=(storage.foldername(name))[1]));

revoke all privileges on public.profiles,public.tickets,public.ticket_comments,public.ticket_documents,public.team_invites from anon,authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,phone) on public.profiles to authenticated;
grant select,insert on public.tickets to authenticated;
grant select,insert on public.ticket_comments,public.ticket_documents to authenticated;
grant select on public.team_invites to authenticated;
grant usage,select on sequence public.ticket_number_seq to authenticated;
revoke execute on function public.assign_ticket(uuid,uuid) from public;
revoke execute on function public.update_ticket_workflow(uuid,public.ticket_status,text) from public;
grant execute on function public.assign_ticket(uuid,uuid) to authenticated;
grant execute on function public.update_ticket_workflow(uuid,public.ticket_status,text) to authenticated;
