import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./db";

// PROTOTYPE ONLY — "demo authentication".
// The acting user is just a cookie holding a user id that anyone can change
// from the header menu. There are no passwords, sessions, or CSRF protection.
// Production uses Spring Security form login (see docs/architecture).

export const DEMO_USER_COOKIE = "splitsmart_demo_user";

export async function getCurrentUser() {
  const store = await cookies();
  const id = store.get(DEMO_USER_COOKIE)?.value;
  if (id) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (user) return user;
  }
  // Default to the first demo user so the app works without "signing in".
  return prisma.user.findFirst({ orderBy: { seq: "asc" } });
}

/** Like getCurrentUser, but throws when the database has not been seeded. */
export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("No users found. Run `npm run db:seed` to load demo data.");
  return user;
}
