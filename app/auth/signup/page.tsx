"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/Logo";
import { signUp } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Loader2, AlertCircle, Check, X, ArrowRight, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

interface PasswordStrength {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

function checkPasswordStrength(password: string): PasswordStrength {
  return {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };
}

function getPasswordStrengthScore(strength: PasswordStrength): number {
  return Object.values(strength).filter(Boolean).length;
}

function getPasswordStrengthLabel(score: number): { label: string; color: string } {
  if (score <= 2) return { label: "Weak", color: "text-rose-500" };
  if (score <= 3) return { label: "Fair", color: "text-amber-500" };
  if (score <= 4) return { label: "Good", color: "text-indigo-500" };
  return { label: "Strong", color: "text-emerald-500" };
}

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What is your favorite movie?",
];

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {met ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <X className="h-3.5 w-3.5 text-slate-400" />
      )}
      <span className={`text-xs ${met ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
        {text}
      </span>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);

  const emailValid = useMemo(() => EMAIL_REGEX.test(email), [email]);
  const passwordStrength = useMemo(() => checkPasswordStrength(password), [password]);
  const passwordScore = useMemo(() => getPasswordStrengthScore(passwordStrength), [passwordStrength]);
  const passwordsMatch = useMemo(() => password === confirmPassword && confirmPassword.length > 0, [password, confirmPassword]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured. Please check setup instructions.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) { setError("Please enter your full name"); return; }
    if (fullName.trim().length < 2) { setError("Name must be at least 2 characters"); return; }
    if (!emailValid) { setError("Please enter a valid email address"); return; }
    if (passwordScore < 3) {
      setError("Password is too weak. Please meet at least 3 requirements.");
      setShowPasswordRequirements(true);
      return;
    }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    if (!securityQuestion) { setError("Please select a security question"); return; }
    if (!securityAnswer.trim() || securityAnswer.trim().length < 2) {
      setError("Please enter an answer to your security question");
      return;
    }

    setLoading(true);

    try {
      const res = await signUp({ email, password, fullName });

      if (res.error) {
        setError(res.error.message);
        setLoading(false);
        return;
      }

      // Store security Q&A in sessionStorage — saved to DB after email is verified
      if (typeof window !== "undefined") {
        sessionStorage.setItem(`secq_${email}`, securityQuestion);
        sessionStorage.setItem(`seca_${email}`, securityAnswer.trim().toLowerCase());
      }

      // Redirect to OTP verification page
      router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <main className="flex h-screen overflow-hidden">
      <ThemeToggle className="fixed top-4 right-4 z-50" />
      {/* LEFT PANEL: Brand & Features */}
      <section className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-violet-600 to-indigo-600">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[-5%] right-[-5%] w-80 h-80 bg-indigo-400/20 rounded-full blur-2xl" />
        <div className="absolute bottom-[30%] left-[10%] w-32 h-32 bg-white/5 backdrop-blur-xl -rotate-12 rounded-2xl border border-white/10" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-white p-2 rounded-xl shadow-sm">
            <Logo className="h-8 w-8" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">
            Workflow<span className="font-extrabold">360</span>
          </span>
        </div>

        <div className="relative z-10 max-w-lg mb-12 space-y-8">
          <h2 className="text-3xl font-bold text-white leading-tight tracking-tight">
            Start building better workflows with AI-powered intelligence.
          </h2>
          <div className="space-y-4">
            {[
              "AI Task Decomposition — Break complex tasks into subtasks",
              "Smart Assignee — Match the right person to every task",
              "Bottleneck Prediction — Catch risks before they happen",
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="h-3 w-3 text-white" />
                </div>
                <p className="text-white/90 text-sm font-medium">{feature}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RIGHT PANEL: Signup Form */}
      <section className="w-full lg:w-1/2 overflow-y-auto bg-white dark:bg-slate-900">
        <div className="min-h-full flex items-center justify-center p-6 md:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile brand */}
          <div className="lg:hidden mb-4">
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

          <div className="text-left space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
              <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
                Start Free
              </span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
              Create Account
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              Get started with Workflow360 today
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" />
                <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              </div>
            )}

            {/* Full Name */}
            <div className="space-y-2">
              <label className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                disabled={loading}
                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  disabled={loading}
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground"
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
              <label className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
                Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setShowPasswordRequirements(true)}
                  placeholder="Create a strong password"
                  disabled={loading}
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {password.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Strength:</span>
                    <span className={`text-xs font-medium ${getPasswordStrengthLabel(passwordScore).color}`}>
                      {getPasswordStrengthLabel(passwordScore).label}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        passwordScore <= 2 ? "bg-rose-500" :
                        passwordScore <= 3 ? "bg-amber-500" :
                        passwordScore <= 4 ? "bg-indigo-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${(passwordScore / 5) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {(showPasswordRequirements || password.length > 0) && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1.5">
                  <p className="text-xs font-bold text-foreground mb-2">Password must have:</p>
                  <PasswordRequirement met={passwordStrength.hasMinLength} text="At least 8 characters" />
                  <PasswordRequirement met={passwordStrength.hasUppercase} text="One uppercase letter" />
                  <PasswordRequirement met={passwordStrength.hasLowercase} text="One lowercase letter" />
                  <PasswordRequirement met={passwordStrength.hasNumber} text="One number" />
                  <PasswordRequirement met={passwordStrength.hasSpecialChar} text="One special character" />
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
                Confirm Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  disabled={loading}
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground"
                />
                {confirmPassword.length > 0 && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {passwordsMatch ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <X className="h-4 w-4 text-rose-500" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Security Question */}
            <div className="space-y-2">
              <label className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
                Security Question <span className="text-rose-500">*</span>
              </label>
              <select
                value={securityQuestion}
                onChange={(e) => setSecurityQuestion(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-foreground appearance-none"
              >
                <option value="">Select a security question...</option>
                {SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>

            {securityQuestion && (
              <div className="space-y-2">
                <label className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
                  Security Answer <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="Enter your answer"
                  disabled={loading}
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground"
                />
                <p className="text-xs text-slate-400">
                  Used to verify your identity for password recovery
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="text-xs text-center text-slate-400">
              By creating an account, you agree to our{" "}
              <Link href="#" className="text-indigo-600 dark:text-indigo-400 hover:text-violet-600">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="#" className="text-indigo-600 dark:text-indigo-400 hover:text-violet-600">
                Privacy Policy
              </Link>
            </p>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
              <span className="flex-shrink mx-4 text-[0.6875rem] font-bold uppercase tracking-widest text-slate-400">
                Already have an account?
              </span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
            </div>

            <Link href="/auth/login" className="block">
              <button
                type="button"
                className="w-full py-3.5 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                Sign in instead
              </button>
            </Link>
          </form>
        </div>
        </div>
      </section>
    </main>
  );
}
