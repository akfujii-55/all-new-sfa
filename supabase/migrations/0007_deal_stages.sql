-- 案件ステージの見直し
-- 旧: lead, appointment, proposal, negotiation, won, lost
-- 新: appointment(アポ取得), proposal_draft(提案書作成中), proposal(提案済み), considering(検討中), on_hold(保留), won(成約), lost(失注)
alter table public.deals drop constraint if exists deals_stage_check;

update public.deals set stage = 'appointment' where stage = 'lead';
update public.deals set stage = 'considering' where stage = 'negotiation';

alter table public.deals
  add constraint deals_stage_check
  check (stage in ('appointment','proposal_draft','proposal','considering','on_hold','won','lost'));
