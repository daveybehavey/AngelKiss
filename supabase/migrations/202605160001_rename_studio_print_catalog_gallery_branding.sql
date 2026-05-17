-- Normalize legacy catalog titles to current branding (homepage studio print gallery captions).
UPDATE public.sublimation_studio_prints
SET
  title = replace(title, 'AngiKiss gallery · ', 'AnglKiss Gallery · '),
  alt_text = CASE
    WHEN alt_text IS NOT NULL AND alt_text LIKE 'AngiKiss gallery · %' THEN
      replace(alt_text, 'AngiKiss gallery · ', 'AnglKiss Gallery · ')
    ELSE alt_text
  END
WHERE title LIKE 'AngiKiss gallery · %'
   OR (alt_text IS NOT NULL AND alt_text LIKE 'AngiKiss gallery · %');
