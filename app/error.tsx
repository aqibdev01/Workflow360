"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-16 flex items-center px-6 bg-slate-50 dark:bg-slate-950">
        <span className="text-xl font-semibold tracking-tight text-indigo-700 dark:text-indigo-300">
          Workflow360
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="relative w-full max-w-3xl mx-auto flex flex-col items-center text-center">
          {/* Geometric illustration */}
          <div className="relative mb-12 flex justify-center items-center">
            <div className="absolute -z-10 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl opacity-60" />
            <div className="relative w-48 h-48 flex items-center justify-center">
              <div className="absolute w-full h-full bg-rose-500/10 rounded-2xl rotate-12" />
              <div className="absolute w-3/4 h-3/4 bg-rose-500/15 rounded-2xl -rotate-6" />
              <span className="relative text-7xl font-extrabold text-rose-500/30 select-none">!</span>
            </div>
          </div>

          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-rose-500 block mb-4">
                Server Error
              </span>
              <h1 className="text-8xl md:text-9xl font-extrabold tracking-tighter text-foreground leading-none">
                500
              </h1>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
                Something went wrong
              </h2>
            </div>

            <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-md mx-auto">
              An unexpected error has occurred. Our team has been notified and
              is looking into it.
            </p>

            <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => window.location.reload()}
                className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg font-bold tracking-tight shadow-xl shadow-indigo-500/20 active:scale-95 transition-all"
              >
                Reload Page
              </button>
              <a
                href="/dashboard"
                className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-foreground rounded-lg font-bold tracking-tight hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
              >
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      </main>

      <div
        className="fixed inset-0 -z-20 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(#F43F5E 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  );
}
