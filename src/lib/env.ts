const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export const backendConfigured =
  supabaseUrl.length > 0 &&
  supabasePublishableKey.length > 0 &&
  /^https:\/\//i.test(supabaseUrl);

export const backendEnvironment = {
  url: supabaseUrl,
  publishableKey: supabasePublishableKey,
} as const;