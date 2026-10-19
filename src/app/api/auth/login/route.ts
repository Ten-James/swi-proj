import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { beginLoginAttempt, clearLoginFailures } from "@/lib/login-throttle";
import { verifyAgainstDummy, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { optionalString, readJsonObject } from "@/lib/request-body";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = optionalString(body, "email")?.trim().toLowerCase();
  const password = optionalString(body, "password") ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const retryAfter = beginLoginAttempt(email);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: "Too many failed login attempts, try again later" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : await verifyAgainstDummy(password);
  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  clearLoginFailures(email);
  await createSession(user.id);
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
