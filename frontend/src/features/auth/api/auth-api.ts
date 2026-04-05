import type {
  ApiErrorPayload,
  AuthMode,
  AuthResponse,
} from "@/entities/auth/model/types";
import { API_BASE } from "@/shared/config/api";

async function parseJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function getApiErrorDetail(payload: ApiErrorPayload | null): string | null {
  return payload?.detail && typeof payload.detail === "string"
    ? payload.detail
    : null;
}

export async function authenticate(
  mode: AuthMode,
  payload: { email: string; password: string; display_name?: string | null },
): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await parseJson<AuthResponse | ApiErrorPayload>(response);

  if (!response.ok) {
    throw new Error(
      getApiErrorDetail(data as ApiErrorPayload | null) ??
        `Помилка авторизації: ${response.status}`,
    );
  }

  return data as AuthResponse;
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await parseJson<ApiErrorPayload>(response);

  if (!response.ok) {
    throw new Error(
      getApiErrorDetail(data) ??
        `Помилка повторної відправки: ${response.status}`,
    );
  }
}

export async function verifyEmailToken(token: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  const data = await parseJson<AuthResponse | ApiErrorPayload>(response);

  if (!response.ok) {
    throw new Error(
      getApiErrorDetail(data as ApiErrorPayload | null) ??
        "Не вдалося підтвердити пошту.",
    );
  }

  return data as AuthResponse;
}

export async function logoutByRefreshToken(
  refreshToken: string,
): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}
