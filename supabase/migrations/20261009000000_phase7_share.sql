-- Phase 7: public share pages (R5).
-- Shared recipes live in `recipes` with is_public = true (readable by anyone, Phase 6 policy).
-- Their preview cards (the image WhatsApp and others show for /r/[slug]) are public files.
-- Only the server writes either one (/api/share, with the service key, after validating the
-- recipe), so there are deliberately no insert/update policies for anon or authenticated here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-cards', 'share-cards', true, 524288, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

-- When a shared recipe was first shared (for the page's "Shared on …" line and housekeeping).
alter table public.recipes add column if not exists shared_at timestamptz;
