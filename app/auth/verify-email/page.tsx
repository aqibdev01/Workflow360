"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getOrCreateUserProfile } from "@/lib/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Loader2, AlertCircle, CheckCircle2, Mail, RefreshCw } from "lucide-react";

async function finalizeAccount(user: { id: string; email?: string | null; user_metadata?: any }) {
  // Create the user profile now that the email is confirmed
  const fullName = user.user_metadata?.full_name;
  await getOrCreateUserProfile(user.id, user.email ?? "", fullName).catch(
    (err) => console.error("Profile creation error:", err)
  );

  // Save security question that was stored during signup
  if (typeof window === "undefined") return;
  const entries = Object.entries(sessionStorage).filter(([k]) => k.startsWith("secq_"));
  if (!entries.length) return;
  const [key, securityQuestion] = entries[0];
  const emailKey = key.replace("secq_", "");
  const securityAnswer = sessionStorage.getItem(`seca_${emailKey}`);
  if (!securityQuestion || !securityAnswer) return;
  try {
    await supabase
      .from("users")
      .update({ security_question: securityQuestion, security_answer: securityAnswer })
      .eq("id", user.id);
  } catch (err) {
    console.error("Failed to save security question:", err);
  }
  sessionStorage.removeItem(`secq_${emailKey}`);
  sessionStorage.removeItem(`seca_${emailKey}`);
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleOtpChange = (index: number, value: string) => {
    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return;

    const newOtp = [...otp];

    // Handle paste
    if (value.length > 1) {
      const pastedCode = value.slice(0, 6).split("");
      pastedCode.forEach((char, i) => {
        if (i < 6) newOtp[i] = char;
      });
      setOtp(newOtp);
      inputRefs.current[Math.min(pastedCode.length, 5)]?.focus();
      return;
    }

    newOtp[index] = value;
    setOtp(newOtp);

    // Move to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = otp.join("");

    if (otpCode.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    setError("");
    setLoading(true);

    const withTimeout = <T,>(promise: Promise<T>, ms = 30000): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Verification timed out. Please try again.")), ms)
        ),
      ]);

    try {
      // Try verifying as signup OTP first
      const { data, error: verifyError } = await withTimeout(
        supabase.auth.verifyOtp({ email, token: otpCode, type: "signup" })
      );

      if (verifyError) {
        // If signup verification fails, try email type
        const { data: emailData, error: emailError } = await withTimeout(
          supabase.auth.verifyOtp({ email, token: otpCode, type: "email" })
        );

        if (emailError) {
          setError(emailError.message || "Invalid verification code. Please try again.");
          return;
        }

        if (emailData.user) {
          await finalizeAccount(emailData.user);
          setSuccess(true);
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 2000);
        }
        return;
      }

      if (data.user) {
        await finalizeAccount(data.user);
        setSuccess(true);
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
      }
    } catch (err: any) {
      const msg: string = err?.message || "";
      if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("email rate")) {
        setError(
          "Email rate limit reached. Supabase free tier allows only ~2 emails/hour. " +
          "Please wait an hour and try again, or ask your admin to configure a custom SMTP provider."
        );
      } else {
        setError(msg || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setResending(true);
    setError("");
    setResendSuccess(false);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (resendError) {
        setError(resendError.message || "Failed to resend code. Please try again.");
      } else {
        setResendCooldown(60); // 60 second cooldown
        setResendSuccess(true);
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError("Failed to resend verification code");
    } finally {
      setResending(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-gray-100 dark:border-slate-800">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="flex items-center space-x-3">
                <Logo className="h-9 w-9" />
                <span className="text-xl font-bold text-gray-900">
                  Workflow<span className="text-blue-600">360</span>
                </span>
              </Link>
            </div>
          </div>
        </nav>

        <div className="flex items-center justify-center min-h-screen pt-16">
          <Card className="w-full max-w-md bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 shadow-lg p-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-50 rounded-full flex items-center justify-center border border-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Email Verified!</h3>
                <p className="text-gray-600 mt-2">
                  Your account has been verified. Redirecting to dashboard...
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-gray-100 dark:border-slate-800">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="flex items-center space-x-3">
                <Logo className="h-9 w-9" />
                <span className="text-xl font-bold text-gray-900">
                  Workflow<span className="text-blue-600">360</span>
                </span>
              </Link>
            </div>
          </div>
        </nav>

        <div className="flex items-center justify-center min-h-screen pt-16">
          <Card className="w-full max-w-md bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 shadow-lg p-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center border border-red-100">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Invalid Link</h3>
                <p className="text-gray-600 mt-2">
                  This verification link is invalid or has expired.
                </p>
              </div>
              <Link href="/auth/signup">
                <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                  Sign Up Again
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-gray-100 dark:border-slate-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-3">
              <Logo className="h-9 w-9" />
              <span className="text-xl font-bold text-gray-900">
                Workflow<span className="text-blue-600">360</span>
              </span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Verification Form */}
      <div className="flex items-center justify-center min-h-screen pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 shadow-lg p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100 mb-4">
              <Mail className="h-8 w-8 text-blue-600" />
            </div>

            <h1 className="text-3xl font-bold text-gray-900">
              Verify Your Email
            </h1>
            <p className="text-gray-600">
              We sent a 6-digit verification code to
            </p>
            <p className="text-blue-600 font-medium">{email}</p>
          </div>

          <div className="space-y-6">
            {error && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-100 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {resendSuccess && (
              <div className="p-4 rounded-lg bg-green-50 border border-green-100 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-green-700">
                  New verification code sent! Please check your email.
                </div>
              </div>
            )}

            {/* OTP Input */}
            <div className="flex justify-center gap-2">
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => {inputRefs.current[index] = el}}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={loading}
                  className="w-12 h-14 text-center text-2xl font-bold border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                />
              ))}
            </div>

            <Button
              onClick={handleVerify}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={loading || otp.join("").length !== 6}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify Email"
              )}
            </Button>

            <div className="text-center space-y-2">
              <p className="text-sm text-gray-500">
                Didn't receive the code?
              </p>
              <Button
                variant="ghost"
                onClick={handleResendOtp}
                disabled={resending || resendCooldown > 0}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                {resending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : resendCooldown > 0 ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Resend in {resendCooldown}s
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Resend Code
                  </>
                )}
              </Button>
            </div>

            <div className="text-center pt-4 border-t border-gray-100">
              <Link
                href="/auth/signup"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Wrong email? Sign up again
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function VerifyEmailLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-gray-100 dark:border-slate-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-3">
              <Logo className="h-9 w-9" />
              <span className="text-xl font-bold text-gray-900">
                Workflow<span className="text-blue-600">360</span>
              </span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex items-center justify-center min-h-screen pt-16">
        <Card className="w-full max-w-md bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 shadow-lg p-8">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Loading...</h3>
              <p className="text-gray-600 mt-2">
                Please wait while we load the verification page.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailLoading />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
