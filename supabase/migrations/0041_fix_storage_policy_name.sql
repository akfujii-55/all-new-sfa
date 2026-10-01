-- 0040 の Storage ポリシーの修正: exists (select ... from public.my_tenants() t where ... storage.foldername(name) ...) の
-- 修飾なしの name が、storage.objects.name ではなく my_tenants() の返す列 name(テナント名)に解決されていた。
-- そのためフォルダの判定が常に不一致になり、添付ファイルのアップロード・ダウンロードが全員できなかった。
-- objects.name と明示する(再適用可)
drop policy if exists "email_attachments_read" on storage.objects;
create policy "email_attachments_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'email-attachments'
    and exists (select 1 from public.my_tenants() t where t.id::text = (storage.foldername(objects.name))[1])
  );

drop policy if exists "email_attachments_outbox_insert" on storage.objects;
create policy "email_attachments_outbox_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'email-attachments'
    and exists (select 1 from public.my_tenants() t where t.id::text = (storage.foldername(objects.name))[1])
    and (storage.foldername(objects.name))[2] = 'outbox'
  );

drop policy if exists "email_attachments_outbox_delete" on storage.objects;
create policy "email_attachments_outbox_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'email-attachments'
    and exists (select 1 from public.my_tenants() t where t.id::text = (storage.foldername(objects.name))[1])
    and (storage.foldername(objects.name))[2] = 'outbox'
  );
