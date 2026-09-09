-- メールの添付ファイル。実体は Supabase Storage の email-attachments バケット、メタ情報をこの表に持つ。
create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails(id) on delete cascade,
  filename text not null,
  content_type text not null default 'application/octet-stream',
  size bigint not null default 0,
  storage_path text not null,
  content_id text,
  is_inline boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists email_attachments_email_idx on public.email_attachments(email_id);

alter table public.email_attachments enable row level security;
drop policy if exists "authenticated_all" on public.email_attachments;
create policy "authenticated_all" on public.email_attachments for all to authenticated using (true) with check (true);

-- Storage バケット(非公開。ダウンロードはアプリの /api/attachments/[id] 経由で署名付き URL を発行する)
insert into storage.buckets (id, name, public, file_size_limit)
values ('email-attachments', 'email-attachments', false, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "email_attachments_read" on storage.objects;
create policy "email_attachments_read" on storage.objects
  for select to authenticated using (bucket_id = 'email-attachments');
