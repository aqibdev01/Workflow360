"use client";

export default function DashboardError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] gap-6 text-center px-6">
      <div className="relative">
        <div className="absolute -z-10 w-40 h-40 bg-rose-500/10 rounded-full blur-3xl" />
        <span className="text-7xl font-extrabold text-rose-500/30 select-none">!</span>
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-semibold tracking-tight">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. You can reload the page or return to the dashboard.
        </p>
        {error?.digest && (
          <p className="text-xs text-muted-foreground font-mono">Error ID: {error.digest}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Reload Page
        </button>
        <a
          href="/dashboard"
          className="px-6 py-2.5 bg-muted text-foreground rounded-lg text-sm font-semibold hover:bg-muted/80 transition-colors"
        >
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}
