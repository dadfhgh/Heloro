-- Add the Purple Crown collectible gift while preserving existing gift records.
begin;

alter table public.profile_gifts
  drop constraint if exists profile_gifts_gift_type_check;

alter table public.profile_gifts
  add constraint profile_gifts_gift_type_check
  check (gift_type in ('fat_epic_sans', 'purple_crown'));

commit;
