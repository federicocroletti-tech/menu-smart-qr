import { createClient } from "@supabase/supabase-js";

export interface AuthenticatedUser {
  id: string;
}

export interface AccessTokenVerifier {
  verify(accessToken: string): Promise<AuthenticatedUser | null>;
}

export function createSupabaseTokenVerifier(
  environment: NodeJS.ProcessEnv = process.env,
): AccessTokenVerifier {
  const supabaseUrl = environment["SUPABASE_URL"];
  const publishableKey = environment["SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured",
    );
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return {
    async verify(accessToken: string): Promise<AuthenticatedUser | null> {
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (error) {
        if (
          error.status === 400 ||
          error.status === 401 ||
          error.status === 403
        ) {
          return null;
        }
        throw new Error("Supabase Auth could not verify the access token", {
          cause: error,
        });
      }

      return data.user ? { id: data.user.id } : null;
    },
  };
}
