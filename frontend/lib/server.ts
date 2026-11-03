import { cookies } from "next/headers";

const INTERNAL = process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";

export interface SessionPayload {
  user: {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    fullName: string;
    role: "admin" | "teacher" | "student";
    avatarUrl?: string | null;
    nationalIdMasked?: string;
  };
  mustChangePassword: boolean;
  role: "admin" | "teacher" | "student";
}

export async function serverApi<T>(path: string): Promise<T | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;
  try {
    const response = await fetch(`${INTERNAL}/api${path}`, {
      headers: { cookie: cookieHeader, "X-Requested-With": "XMLHttpRequest" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  return serverApi<SessionPayload>("/auth/me");
}
