import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { createSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { optionalString, readJsonObject } from "@/lib/request-body";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = optionalString(body, "name")?.trim();
  const email = optionalString(body, "email")?.trim().toLowerCase();
  const password = optionalString(body, "password") ?? "";

  if (!name || name.length < 2 || name.length > 100) {
    return NextResponse.json(
      { error: "Name must contain between 2 and 100 characters" },
      { status: 400 },
    );
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return NextResponse.json(
      { error: "Password must have at least 8 characters, one letter and one number" },
      { status: 400 },
    );
  }

  // Any existing account, including a legacy one without a password, is never
  // claimed by registration; otherwise anyone could take over its Reservations.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user
    .create({ data: { name, email, passwordHash } })
    .catch((error: unknown) => {
      // Two concurrent registrations of one email: the unique index decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    });
  if (!user) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  await createSession(user.id);
  return NextResponse.json(
    { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    { status: 201 },
  );
}
