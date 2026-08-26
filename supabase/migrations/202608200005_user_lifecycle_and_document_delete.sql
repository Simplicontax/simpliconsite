alter table public.profiles add column if not exists frozen_at timestamptz;
alter table public.profiles add column if not exists removed_at timestamptz;

create index if not exists profiles_role_access_idx on public.profiles(role, active, removed_at);

create table if not exists public.user_access_audit (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  target_email text not null,
  action text not null check (action in ('freeze','unfreeze','remove')),
  performed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.user_access_audit enable row level security;
drop policy if exists "Admin reads user access audit" on public.user_access_audit;
create policy "Admin reads user access audit" on public.user_access_audit
for select to authenticated using (public.is_admin());
revoke all privileges on public.user_access_audit from anon, authenticated;
grant select on public.user_access_audit to authenticated;

drop policy if exists "Clients delete their own uploaded document metadata" on public.ticket_documents;
create policy "Clients delete their own uploaded document metadata"
on public.ticket_documents for delete to authenticated
using (
  uploaded_by = auth.uid()
  and public.current_app_role() = 'client'
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_id and t.requester_id = auth.uid()
  )
);

drop policy if exists "Admin deletes document metadata" on public.ticket_documents;
create policy "Admin deletes document metadata"
on public.ticket_documents for delete to authenticated
using (public.is_admin());

grant delete on public.ticket_documents to authenticated;

drop policy if exists "Clients and admin delete ticket files" on storage.objects;
create policy "Clients and admin delete ticket files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'ticket-documents'
  and exists (
    select 1
    from public.ticket_documents d
    join public.tickets t on t.id = d.ticket_id
    where d.storage_path = name
      and (
        public.is_admin()
        or (
          public.current_app_role() = 'client'
          and d.uploaded_by = auth.uid()
          and t.requester_id = auth.uid()
        )
      )
  )
);
