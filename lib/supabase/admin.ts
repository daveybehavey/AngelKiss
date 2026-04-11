import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedAdminClient: SupabaseClient | null = null;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getAdminKey(): string {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRoleKey) {
    return serviceRoleKey;
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (secretKey) {
    return secretKey;
  }

  throw new Error(
    "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY"
  );
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const adminKey = getAdminKey();

  cachedAdminClient = createClient(url, adminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return cachedAdminClient;
}
