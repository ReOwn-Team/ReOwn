import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AuthProvider } from "../provider";
import { cookieName, initialSession } from "./session";

export async function ServerAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const jar = await cookies();
  const initial = await initialSession(jar.get(cookieName())?.value);
  return <AuthProvider initial={initial}>{children}</AuthProvider>;
}
