import { createClient } from "@supabase/supabase-js";
import { backendConfigured, backendEnvironment } from "./env";

export const supabase = backendConfigured
  ? createClient(backendEnvironment.url, backendEnvironment.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      realtime: {
        params: { eventsPerSecond: 5 },
      },
    })
  : null;

export type SupabaseClient = NonNullable<typeof supabase>;