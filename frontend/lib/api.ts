"use client";

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    code?: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function ensureCsrf(): Promise<string> {
  let token = getCookie("csrftoken");
  if (!token) {
    await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" });
    token = getCookie("csrftoken");
  }
  return token || "";
}

function isUnsafe(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (isUnsafe(method)) {
    const token = await ensureCsrf();
    if (token) headers.set("X-CSRFToken", token);
    headers.set("X-Requested-With", "XMLHttpRequest");
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 204) return undefined as T;

  let payload: any = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      const onLogin = window.location.pathname.startsWith("/login");
      if (!onLogin) window.location.href = "/login";
    }
    throw new ApiError(
      payload?.error || "خطایی رخ داد. دوباره تلاش کنید.",
      response.status,
      payload?.code,
      payload?.fields,
    );
  }

  return payload as T;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => api<T>(path, { method: "DELETE" });
export const apiUpload = <T>(path: string, form: FormData) =>
  api<T>(path, { method: "POST", body: form });
