import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminAuthContext = {
  userId: string;
};

export async function assertAdminFromRequest(request: Request): Promise<AdminAuthContext> {
  const authorizationHeader = request.headers.get("authorization") ?? "";

  if (!authorizationHeader.startsWith("Bearer ")) {
    throw new Error("Missing Bearer token");
  }

  const accessToken = authorizationHeader.slice("Bearer ".length).trim();
  if (!accessToken) {
    throw new Error("Missing Bearer token");
  }

  const supabase = getSupabaseAdminClient();

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    throw new Error("Invalid auth token");
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile || profile.role !== "admin") {
    throw new Error("Admin role required");
  }

  return {
    userId: userData.user.id
  };
}
