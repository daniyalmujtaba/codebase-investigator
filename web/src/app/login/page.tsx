import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertCircle } from "lucide-react";

function GoogleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.5-1.74 4.4-5.5 4.4-3.3 0-6-2.74-6-6.1s2.7-6.1 6-6.1c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.83 3.7 14.66 2.7 12 2.7 6.92 2.7 2.8 6.82 2.8 12s4.12 9.3 9.2 9.3c5.31 0 8.83-3.73 8.83-8.98 0-.6-.07-1.06-.16-1.52H12z"/>
      <path fill="#4285F4" d="M21.6 12.23c0-.6-.07-1.06-.16-1.52H12v3.9h5.5c-.11.7-.7 1.93-2.04 2.85l3.21 2.49c1.92-1.78 3.03-4.4 3.03-7.72z"/>
      <path fill="#FBBC05" d="M5.97 14.27a5.59 5.59 0 0 1-.31-1.77c0-.62.11-1.22.3-1.77L2.71 8.21A9.27 9.27 0 0 0 1.7 12.5c0 1.5.36 2.92 1.01 4.29l3.26-2.52z"/>
      <path fill="#34A853" d="M12 21.3c2.7 0 4.97-.89 6.62-2.41l-3.21-2.49c-.86.6-2.02 1.02-3.41 1.02-2.62 0-4.84-1.7-5.63-4.05L2.7 16.79C4.34 19.42 7.93 21.3 12 21.3z"/>
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user?.email) redirect(params.from ?? "/");

  return (
    <main className="grid-bg relative min-h-screen flex items-center justify-center p-6">
      <div className="absolute top-6 left-6 flex items-center gap-2 text-[var(--color-fg-muted)]">
        <div className="h-7 w-7 rounded-md bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 flex items-center justify-center">
          <span className="text-[var(--color-accent)] font-mono text-xs font-bold">CI</span>
        </div>
        <span className="text-sm font-medium tracking-tight">Codebase Investigator</span>
      </div>

      <Card className="w-full max-w-md shadow-2xl shadow-black/40">
        <CardHeader className="text-center pt-8">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-[var(--color-accent)]" strokeWidth={1.8} />
          </div>
          <CardTitle className="text-xl">Sign in to continue</CardTitle>
          <CardDescription>
            Access is restricted to allowlisted accounts.
          </CardDescription>
        </CardHeader>

        <CardContent className="pb-8">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: params.from ?? "/" });
            }}
          >
            <Button type="submit" variant="secondary" size="lg" className="w-full">
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </Button>
          </form>

          {params.error === "AccessDenied" && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Access denied</div>
                <div className="text-rose-300/80 text-xs mt-0.5">
                  This Google account is not on the allowlist.
                </div>
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-[var(--color-fg-subtle)]">
            By signing in you agree this is a demo build with read-only repo access.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
