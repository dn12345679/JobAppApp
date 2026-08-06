import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True once the .env values are present. The app is fully usable offline
 * without this — Supabase only powers cloud sync + sharing (DESIGN.md §3.3).
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true, // caches the session so sign-in survives restarts
        autoRefreshToken: true,
        detectSessionInUrl: false, // desktop uses a deep-link callback, not URL parsing
      },
    })
  : null;

// Dev-only: lets us poke at auth/session from the browser console.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { supabase: SupabaseClient | null }).supabase = supabase;
}
