-- Restock / news email list (public signup via API; no direct client table access)
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'footer',
  unsubscribed_at timestamptz NULL,
  CONSTRAINT newsletter_subscribers_email_nonempty CHECK (length(trim(email)) > 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_lower_email_idx
  ON public.newsletter_subscribers (lower(trim(email)));

COMMENT ON TABLE public.newsletter_subscribers IS 'Marketing/restock signups from storefront; managed via service role API only.';

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- No GRANT to anon/authenticated: only service_role (API routes) can read/write.
