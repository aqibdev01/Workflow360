"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  KeyRound,
  Lock,
  Check,
  X,
  Eye,
  EyeOff,
  Mail,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

type Step = "email" | "otp" | "password" | "success";

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {met ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <X className="h-3.5 w-3.5 text-slate-400" />
      )}
      <span className={`text-xs ${met ? "text-emerald-600" : "text-slate-400"}`}>{text}</span>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Password checks
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const isValidPassword = hasMinLength && hasUppercase && hasLowercase && hasNumber;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  // Auto-focus first OTP input when step changes to otp
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }, [step]);

  // Redirect on success
  useEffect(() => {
    if (step === "success") {
      const t = setTimeout(() => { window.location.href = "/auth/login"; }, 2500);
      return () => clearTimeout(t);
    }
  }, [step]);

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: undefined as any }
      );

      if (resetError) {
        const msg = resetError.message?.toLowerCase() ?? "";
        if (msg.includes("not found") || msg.includes("user") || msg.includes("email")) {
          setError("No account found with this email address.");
        } else {
          setError(resetError.message);
        }
        return;
      }

      setResendCooldown(60);
      setStep("otp");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    setError("");
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: undefined as any,
      });
      setResendCooldown(60);
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  // ── OTP input handlers ───────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (value && !/^\d+$/.test(value)) return;
    const next = [...otp];
    if (value.length > 1) {
      const pasted = value.slice(0, 6).split("");
      pasted.forEach((ch, i) => { if (i < 6) next[i] = ch; });
      setOtp(next);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
      return;
    }
    next[index] = value;
    setOtp(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // ── Step 2: Verify OTP ───────────────────────────────────────────────────
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "recovery",
      });

      if (verifyError) {
        setError("Invalid or expired code. Please try again.");
        return;
      }

      setStep("password");
    } catch (err: any) {
      setError(err?.message || "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Set new password ─────────────────────────────────────────────
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isValidPassword) {
      setError("Please meet all password requirements");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      await supabase.auth.signOut();
      setStep("success");
    } catch (err: any) {
      setError(err?.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step config ──────────────────────────────────────────────────────────
  const stepOrder: Step[] = ["email", "otp", "password"];
  const currentStepIndex = stepOrder.indexOf(step);
  const stepLabels = ["1", "2", "3"];

  // ── Success ──────────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Password Updated!</h1>
          <p className="text-slate-500">Your password has been changed successfully.</p>
          <p className="text-sm text-slate-400">Redirecting to login...</p>
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600 mx-auto" />
          <Link
            href="/auth/login"
            className="inline-block mt-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/" className="flex items-center gap-3">
          <div className="bg-white p-1.5 rounded-lg">
            <Logo className="h-7 w-7" />
          </div>
          <span className="text-white font-bold text-lg">
            Workflow<span className="font-extrabold">360</span>
          </span>
        </Link>
        <Link
          href="/auth/login"
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-medium transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Login
        </Link>
      </nav>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8">

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    currentStepIndex === i
                      ? "bg-indigo-600 text-white"
                      : currentStepIndex > i
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                  }`}
                >
                  {currentStepIndex > i ? <Check className="h-4 w-4" /> : label}
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`w-12 h-1 mx-1 rounded-full transition-colors ${currentStepIndex > i ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />
                )}
              </div>
            ))}
          </div>

          {/* ── Step 1: Email ── */}
          {step === "email" && (
            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <div className="text-center space-y-1 mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 mb-3">
                  <KeyRound className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-600">Reset Password</span>
                </div>
                <h1 className="text-2xl font-bold text-foreground">Find Your Account</h1>
                <p className="text-sm text-slate-500">We'll send a 6-digit code to your email</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code...</> : "Send Code"}
              </button>

              <p className="text-center text-sm text-slate-500">
                Remember your password?{" "}
                <Link href="/auth/login" className="font-semibold text-indigo-600 hover:text-violet-600 transition-colors">
                  Sign in
                </Link>
              </p>
            </form>
          )}

          {/* ── Step 2: OTP ── */}
          {step === "otp" && (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="text-center space-y-1 mb-6">
                <div className="mx-auto w-14 h-14 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-3">
                  <Mail className="h-7 w-7 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">Check Your Email</h1>
                <p className="text-sm text-slate-500">
                  We sent a 6-digit code to
                </p>
                <p className="text-sm font-semibold text-indigo-600">{email}</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>
                </div>
              )}

              {/* OTP boxes */}
              <div className="flex justify-center gap-2">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    disabled={loading}
                    className="w-11 h-13 text-center text-xl font-bold bg-slate-50 dark:bg-slate-700 border-2 border-transparent rounded-xl focus:border-indigo-500 focus:ring-0 focus:outline-none transition-all disabled:opacity-50"
                    style={{ height: "52px" }}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || otp.join("").length !== 6}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</> : "Verify Code"}
              </button>

              <div className="text-center space-y-2">
                <p className="text-sm text-slate-500">Didn't receive the code?</p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || resendCooldown > 0}
                  className="flex items-center gap-2 mx-auto text-sm font-semibold text-indigo-600 hover:text-violet-600 transition-colors disabled:opacity-50"
                >
                  {resending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                  ) : resendCooldown > 0 ? (
                    <><RefreshCw className="h-4 w-4" /> Resend in {resendCooldown}s</>
                  ) : (
                    <><RefreshCw className="h-4 w-4" /> Resend Code</>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => { setStep("email"); setError(""); setOtp(["", "", "", "", "", ""]); }}
                className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Use a different email
              </button>
            </form>
          )}

          {/* ── Step 3: New Password ── */}
          {step === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="text-center space-y-1 mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 mb-3">
                  <Lock className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-600">New Password</span>
                </div>
                <h1 className="text-2xl font-bold text-foreground">Create New Password</h1>
                <p className="text-sm text-slate-500">Choose a strong password for your account</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    disabled={loading}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {password.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 space-y-1.5">
                  <p className="text-xs font-bold text-foreground mb-2">Password must have:</p>
                  <PasswordRequirement met={hasMinLength} text="At least 8 characters" />
                  <PasswordRequirement met={hasUppercase} text="One uppercase letter" />
                  <PasswordRequirement met={hasLowercase} text="One lowercase letter" />
                  <PasswordRequirement met={hasNumber} text="One number" />
                  <PasswordRequirement met={hasSpecial} text="One special character" />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    disabled={loading}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-foreground"
                  />
                  {confirmPassword.length > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {passwordsMatch
                        ? <Check className="h-4 w-4 text-emerald-500" />
                        : <X className="h-4 w-4 text-rose-500" />}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !isValidPassword || !passwordsMatch}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating...</> : "Reset Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
