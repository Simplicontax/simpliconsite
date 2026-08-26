-- Private tax-organizer metadata and storage policies.
create table if not exists public.tax_organizer_templates (
  id text primary key default 'current' check (id = 'current'),
  storage_path text not null default 'current/Simplicon-Tax-Organizer.xlsx',
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.tax_organizer_templates enable row level security;

drop policy if exists "Authenticated users read the current tax organizer" on public.tax_organizer_templates;
create policy "Authenticated users read the current tax organizer"
on public.tax_organizer_templates for select to authenticated using (true);

drop policy if exists "Admin manages the current tax organizer" on public.tax_organizer_templates;
create policy "Admin manages the current tax organizer"
on public.tax_organizer_templates for all to authenticated
using (public.is_admin()) with check (public.is_admin());

revoke all privileges on public.tax_organizer_templates from anon, authenticated;
grant select, insert, update on public.tax_organizer_templates to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tax-organizers',
  'tax-organizers',
  false,
  20971520,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users download the current tax organizer" on storage.objects;
create policy "Authenticated users download the current tax organizer"
on storage.objects for select to authenticated
using (bucket_id = 'tax-organizers' and name = 'current/Simplicon-Tax-Organizer.xlsx');

drop policy if exists "Admin uploads the current tax organizer" on storage.objects;
create policy "Admin uploads the current tax organizer"
on storage.objects for insert to authenticated
with check (bucket_id = 'tax-organizers' and name = 'current/Simplicon-Tax-Organizer.xlsx' and public.is_admin());

drop policy if exists "Admin replaces the current tax organizer" on storage.objects;
create policy "Admin replaces the current tax organizer"
on storage.objects for update to authenticated
using (bucket_id = 'tax-organizers' and name = 'current/Simplicon-Tax-Organizer.xlsx' and public.is_admin())
with check (bucket_id = 'tax-organizers' and name = 'current/Simplicon-Tax-Organizer.xlsx' and public.is_admin());

create table if not exists public.document_purge_audit (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  storage_path text not null,
  file_name text not null,
  ticket_completed_at timestamptz not null,
  purged_at timestamptz not null default now()
);

alter table public.document_purge_audit enable row level security;
drop policy if exists "Admin reads document purge audit" on public.document_purge_audit;
create policy "Admin reads document purge audit" on public.document_purge_audit
for select to authenticated using (public.is_admin());
revoke all privileges on public.document_purge_audit from anon, authenticated;
grant select on public.document_purge_audit to authenticated;
