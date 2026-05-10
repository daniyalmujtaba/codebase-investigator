import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string; error?: string }> }) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user?.email) redirect(params.from ?? "/");

  return (
    <main style={{ maxWidth: 420, margin: "20vh auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Sign in</h1>
      <p className="subtle" style={{ marginBottom: 18 }}>Codebase Investigator is access-controlled.</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: params.from ?? "/" });
        }}
      >
        <button className="btn" type="submit">Continue with Google</button>
      </form>
      {params.error === "AccessDenied" && (
        <div className="badge fail" style={{ marginTop: 16 }}>Email not on allowlist.</div>
      )}
    </main>
  );
}
