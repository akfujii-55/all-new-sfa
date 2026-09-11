-- 送信メールの添付ファイル。
-- ブラウザから email-attachments バケットの outbox/<batch>/ に直接アップロードし、
-- 送信後にサーバー側(service role)で <email_id>/ に移動して email_attachments に登録する。
drop policy if exists "email_attachments_outbox_insert" on storage.objects;
create policy "email_attachments_outbox_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'email-attachments' and name like 'outbox/%');

drop policy if exists "email_attachments_outbox_delete" on storage.objects;
create policy "email_attachments_outbox_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'email-attachments' and name like 'outbox/%');
