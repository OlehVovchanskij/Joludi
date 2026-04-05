import type {
  AnalyzeResponse,
  ChatMessage,
  SummaryResponse,
} from "@/entities/telemetry/model/types";
import { API_BASE } from "@/shared/config/api";

export async function analyzeLogFile(
  file: File,
  accessToken: string | null,
): Promise<AnalyzeResponse> {
  const body = new FormData();
  body.append("file", file);

  const headers: HeadersInit = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`Помилка API: ${response.status}`);
  }

  return (await response.json()) as AnalyzeResponse;
}

export async function requestPilotSummary(
  analysis: AnalyzeResponse,
): Promise<SummaryResponse> {
  const response = await fetch(`${API_BASE}/api/ai/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis }),
  });

  if (!response.ok) {
    throw new Error(`Помилка отримання AI summary: ${response.status}`);
  }

  return (await response.json()) as SummaryResponse;
}

export async function requestPilotChat(
  analysis: AnalyzeResponse,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis, messages }),
  });

  if (!response.ok) {
    throw new Error(`AI chat request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    provider?: string;
    reply?: string;
  };

  return (
    data.reply ??
    "Не вдалося отримати відповідь від AI. Спробуйте поставити питання ще раз."
  );
}
