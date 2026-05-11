"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/Logo";
import { signIn, signInWithOAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Loader2, AlertCircle, Eye, EyeOff, Check, X, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const emailValid = useMemo(() => EMAIL_REGEX.test(email), [email]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured. Please check setup instructions.");
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);
    const { error: oauthError } = await signInWithOAuth("google");
    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
    // On success Supabase redirects the browser — no further action needed
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!emailValid) {
      setError("Please enter a valid email address");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await signIn({ email, password });

      if (authError) {
        if (
          authError.message.toLowerCase().includes("email not confirmed") ||
          authError.code === "email_not_confirmed"
        ) {
          router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
          return;
        }
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data) {
        window.location.href = redirectTo;
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <main className="flex h-screen overflow-hidden">
      <ThemeToggle className="fixed top-4 right-4 z-50" />
      {/* LEFT PANEL: Brand & Testimonial */}
      <section className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600">
        {/* Decorative shapes */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[-5%] right-[-5%] w-80 h-80 bg-violet-500/20 rounded-full blur-2xl" />
        <div className="absolute top-1/4 right-10 w-24 h-24 bg-white/10 backdrop-blur-xl rotate-12 rounded-xl" />

        {/* Brand logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-white p-2 rounded-xl shadow-sm">
            <Logo className="h-8 w-8" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">
            Workflow<span className="font-extrabold">360</span>
          </span>
        </div>

        {/* Testimonial */}
        <div className="relative z-10 max-w-lg mb-12">
          <div className="mb-8 text-white/40 text-6xl leading-none">&ldquo;</div>
          <h2 className="text-3xl font-medium text-white leading-tight mb-8">
            If everyone is moving forward together, success takes care of itself.
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg">
              HF
            </div>
            <div>
              <p className="font-bold text-white">Henry Ford</p>
              <p className="text-white/70 text-sm">Founder, Ford Motor Company</p>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT PANEL: Login Form */}
      <section className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-10 lg:p-14 bg-white dark:bg-slate-900">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile brand (hidden on desktop) */}
          <div className="lg:hidden mb-2">
            <Image
              src="/workflowlogo.jpeg"
              alt="Workflow360"
              width={0}
              height={0}
              sizes="180px"
              style={{ height: "44px", width: "auto" }}
              priority
            />
          </div>

          {/* Header */}
          <div className="text-left space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              Sign in to your account
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" />
                <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              </div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400"
              >
                Email Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground"
                />
                {email.length > 0 && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {emailValid ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <X className="h-4 w-4 text-rose-500" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="password"
                  className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400"
                >
                  Password <span className="text-rose-500">*</span>
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* GOOGLE_OAUTH_HIDDEN — see GOOGLE_OAUTH_SETUP.md to re-enable
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
            <span className="flex-shrink mx-4 text-[0.6875rem] font-bold uppercase tracking-widest text-slate-400">
              or continue with
            </span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
              </svg>
            )}
            <span className="text-sm font-semibold text-foreground">
              {googleLoading ? "Redirecting..." : "Continue with Google"}
            </span>
          </button>
          */}

          {/* Footer link */}
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors ml-1"
            >
              Sign up
            </Link>
          </p>
        </div>
      </section>

    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-slate-900" />
      }
    >
      <LoginContent />
    </Suspense>
  );
}
