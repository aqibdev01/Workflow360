import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Check if credentials are still placeholders
const isPlaceholder =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes("placeholder") ||
  supabaseAnonKey.includes("placeholder");

if (isPlaceholder) {
  console.warn(`
╔════════════════════════════════════════════════════════════════╗
║  ⚠️  SUPABASE NOT CONFIGURED                                   ║
╟────────────────────────────────────────────────────────────────╢
║  Please set up your Supabase credentials:                      ║
║                                                                 ║
║  1. Go to https://supabase.com                                 ║
║  2. Create a new project (takes 2-3 minutes)                   ║
║  3. Get your credentials from Settings → API                   ║
║  4. Update .env.local with:                                    ║
║     NEXT_PUBLIC_SUPABASE_URL=your-url                          ║
║     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key                     ║
║  5. Restart the dev server                                     ║
╚════════════════════════════════════════════════════════════════╝
  `);
}

// Create a typed Supabase client (cookie-based storage so server middleware can read the session)
export const supabase = createBrowserClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key"
);

// Type helper for Supabase client
export type SupabaseClient = typeof supabase;

// Helper to check if Supabase is configured
export const isSupabaseConfigured = () => !isPlaceholder;
