import type { ApiErrorPayload } from "@/entities/auth/model/types";
import type {
  HistoryDetailResponse,
  HistoryResponse,
} from "@/entities/telemetry/model/types";
import { API_BASE } from "@/shared/config/api";

async function parseJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function getApiErrorDetail(payload: ApiErrorPayload | null): string | null {
  return payload?.detail && typeof payload.detail === "string"
    ? payload.detail
    : null;
}

export async function fetchHistoryList(
  accessToken: string,
  limit = 50,
): Promise<HistoryResponse> {
  const response = await fetch(`${API_BASE}/api/history?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await parseJson<HistoryResponse | ApiErrorPayload>(response);

  if (!response.ok) {
    throw new Error(
      getApiErrorDetail(data as ApiErrorPayload | null) ??
        `Помилка завантаження історії: ${response.status}`,
    );
  }

  return data as HistoryResponse;
}

export async function fetchHistoryDetail(
  accessToken: string,
  itemId: string,
): Promise<HistoryDetailResponse> {
  const response = await fetch(`${API_BASE}/api/history/${itemId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await parseJson<HistoryDetailResponse | ApiErrorPayload>(
    response,
  );

  if (!response.ok) {
    throw new Error(
      getApiErrorDetail(data as ApiErrorPayload | null) ??
        `Не вдалося відкрити запис: ${response.status}`,
    );
  }

  return data as HistoryDetailResponse;
}
