import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowed = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const nextAuth = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      if (allowed.length === 0) return true; // open mode if no allowlist set
      return allowed.includes(email);
    },
    async jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email;
      return token;
    },
    async session({ session, token }) {
      if (token.email) session.user = { ...(session.user ?? {}), email: token.email as string };
      return session;
    },
  },
});

export const { auth, signIn, signOut } = nextAuth;
export const { GET, POST } = nextAuth.handlers;
