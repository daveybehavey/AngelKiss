-- Studio print themes/groups for admin organization and /gallery filtering.

CREATE TABLE IF NOT EXISTS public.studio_print_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_print_groups_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT studio_print_groups_slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_print_groups_slug
  ON public.studio_print_groups (slug);

CREATE INDEX IF NOT EXISTS idx_studio_print_groups_active_sort
  ON public.studio_print_groups (is_active, sort_order DESC, name ASC);

DROP TRIGGER IF EXISTS trg_studio_print_groups_updated_at ON public.studio_print_groups;
CREATE TRIGGER trg_studio_print_groups_updated_at
BEFORE UPDATE ON public.studio_print_groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.studio_print_group_members (
  group_id uuid NOT NULL REFERENCES public.studio_print_groups(id) ON DELETE CASCADE,
  studio_print_id uuid NOT NULL REFERENCES public.sublimation_studio_prints(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, studio_print_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_print_group_members_print
  ON public.studio_print_group_members (studio_print_id);

ALTER TABLE public.studio_print_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_print_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active studio print groups" ON public.studio_print_groups;
CREATE POLICY "Public read active studio print groups"
ON public.studio_print_groups
FOR SELECT
USING (is_active = true);

DROP POLICY IF EXISTS "Public read studio print group members" ON public.studio_print_group_members;
CREATE POLICY "Public read studio print group members"
ON public.studio_print_group_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.studio_print_groups g
    WHERE g.id = group_id
      AND g.is_active = true
  )
);

DROP POLICY IF EXISTS "Admins manage studio print groups" ON public.studio_print_groups;
CREATE POLICY "Admins manage studio print groups"
ON public.studio_print_groups
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage studio print group members" ON public.studio_print_group_members;
CREATE POLICY "Admins manage studio print group members"
ON public.studio_print_group_members
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());
