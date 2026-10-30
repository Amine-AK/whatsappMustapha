"use client";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("ما كاينش الأنترنيت. تأكد من الاتصال وعاود.", 0);
  }
  if (res.status === 401 && !url.startsWith("/api/login")) {
    window.location.href = "/login";
    throw new ApiError("سجل الدخول من جديد", 401);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `خطأ ${res.status}`, res.status);
  return data as T;
}
