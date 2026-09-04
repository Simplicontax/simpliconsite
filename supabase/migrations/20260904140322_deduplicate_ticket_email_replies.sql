alter table public.ticket_comments
  add column if not exists email_message_id text;

create unique index if not exists ticket_comments_email_message_id_idx
  on public.ticket_comments (email_message_id)
  where email_message_id is not null;

update public.ticket_comments
set body = btrim(regexp_replace(body, E'\\sOn\\s[^\\n]*\\swrote:\\s.*$', '', 'is'))
where not is_system
  and body ~* E'\\sOn\\s[^\\n]*\\swrote:';

with duplicates as (
  select id, row_number() over (
    partition by ticket_id, author_id, body, date_trunc('hour', created_at)
    order by created_at, id
  ) as duplicate_rank
  from public.ticket_comments
  where not is_system
)
delete from public.ticket_comments as comment
using duplicates
where comment.id = duplicates.id
  and duplicates.duplicate_rank > 1;