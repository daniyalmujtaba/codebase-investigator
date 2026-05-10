import { auth } from "@/auth";
import { signEmail } from "@/lib/sign";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ email: null }, { status: 401 });
  try {
    const { ts, token } = signEmail(email);
    return NextResponse.json({ email, ts, token });
  } catch {
    return NextResponse.json({ email: null, error: "AUTH_SHARED_SECRET not set" }, { status: 500 });
  }
}
