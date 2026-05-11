import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type");

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: "", ...options });
          },
        },
      }
    );

    await supabase.auth.exchangeCodeForSession(code);

    // If this is a password recovery flow, redirect to the password reset page
    if (type === "recovery") {
      return NextResponse.redirect(new URL("/auth/forgot-password?step=password", request.url));
    }

    // Ensure a public.users profile row exists for OAuth sign-ins
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("users").upsert(
        {
          id: user.id,
          email: user.email ?? "",
          full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
          avatar_url: user.user_metadata?.avatar_url ?? null,
        },
        { onConflict: "id", ignoreDuplicates: false }
      );
    }
  }

  // Default: redirect to dashboard after sign in
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
