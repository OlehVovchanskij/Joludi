"use client";

import {
  clearHistoryView,
  clearStoredAuth,
  getAccessToken,
  getRefreshToken,
  saveHistoryView,
} from "@/entities/auth/model/storage";
import type {
  HistoryDetailResponse,
  HistoryItem,
} from "@/entities/telemetry/model/types";
import { logoutByRefreshToken } from "@/features/auth/api/auth-api";
import {
  fetchHistoryDetail,
  fetchHistoryList,
} from "@/features/history/api/history-api";
import { formatNumber, labelValue } from "@/shared/lib/formatters";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function HistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [email] = useState<string | null>(null);

  const historyStats = useMemo(() => {
    const snapshotCount = items.filter((item) => item.has_snapshot).length;
    const totalDuration = items.reduce(
      (sum, item) => sum + (item.duration_s ?? 0),
      0,
    );

    return [
      {
        label: "Записів",
        value: formatNumber(items.length, 0),
        description: "збережених у вашому профілі",
      },
      {
        label: "З snapshot",
        value: formatNumber(snapshotCount, 0),
        description: "можна швидко відкрити на дашборді",
      },
      {
        label: "Сумарна тривалість",
        value: `${formatNumber(totalDuration, 1)} s`,
        description: "усіх польотів у списку",
      },
    ];
  }, [items]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/auth");
      return;
    }

    const loadHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchHistoryList(token);
        setItems(data.items ?? []);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити історію.",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadHistory();
  }, [router]);

  async function handleLogout() {
    const token = getAccessToken();
    const refreshToken = getRefreshToken();

    try {
      if (refreshToken) {
        await logoutByRefreshToken(refreshToken);
      }
    } finally {
      if (token) {
        clearStoredAuth();
        clearHistoryView();
      }
      router.replace("/");
    }
  }

  async function handleViewHistory(itemId: string) {
    const token = getAccessToken();
    if (!token) {
      router.replace("/auth");
      return;
    }

    try {
      const data = await fetchHistoryDetail(token, itemId);
      const snapshot = (data as HistoryDetailResponse).analysis_snapshot;
      if (!snapshot) {
        throw new Error("Для цього запису немає збереженого польоту.");
      }

      saveHistoryView(snapshot);
      router.push("/");
    } catch (viewError) {
      setError(
        viewError instanceof Error
          ? viewError.message
          : "Не вдалося відкрити запис історії.",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8">
      <section className="rounded-[2.5rem] border border-line/60 bg-[linear-gradient(145deg,rgba(255,253,248,0.96)_0%,rgba(242,235,226,0.92)_100%)] p-6 shadow-[0_24px_64px_rgba(27,35,33,0.12)] md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-ink">
                Історія аналізів
              </p>
              {email && (
                <span className="rounded-full border border-line/70 bg-surface/85 px-3 py-1 text-xs text-foreground/60">
                  {email}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-brand-ink md:text-4xl">
                Усі твої логи в одному місці.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/70 md:text-base">
                Тут видно, які записи вже мають snapshot, скільки даних було
                проаналізовано і які результати можна відкрити назад у дашборді.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-full border border-line/70 bg-surface px-4 py-2 text-sm font-medium text-foreground/70 transition hover:border-brand/40 hover:text-brand-ink"
            >
              На головну
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-ink"
            >
              Вийти
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {historyStats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_10px_24px_rgba(27,35,33,0.08)]"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-foreground/60">
                {stat.description}
              </p>
            </article>
          ))}
        </div>

        {loading ? (
          <div className="mt-6 rounded-3xl border border-line/70 bg-surface/80 p-6 text-sm text-foreground/60">
            Завантажуємо історію записів...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-line/70 bg-surface/80 p-6 text-sm text-foreground/60">
            Тут ще немає записів. Запусти перший аналіз, і він одразу зʼявиться
            в цій історії.
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-[1.75rem] border border-line/70 bg-surface/92 p-5 shadow-[0_12px_30px_rgba(27,35,33,0.08)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-brand-ink">
                      {labelValue(item.filename)}
                    </h2>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-foreground/45">
                      {new Date(item.created_at).toLocaleString("uk-UA")}
                    </p>
                  </div>
                  <span className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-ink">
                    {labelValue(item.message_count)} messages
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full border border-line/60 bg-surface-soft px-3 py-1 text-xs font-medium text-foreground/60">
                    {item.has_snapshot
                      ? "Snapshot доступний"
                      : "Лише попередній перегляд"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleViewHistory(item.id)}
                    disabled={!item.has_snapshot}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Відкрити
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">
                      Тривалість
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatNumber(item.duration_s, 1)} s
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">
                      Дистанція
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatNumber(item.total_distance_m, 1)} m
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">
                      Пікова швидкість
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatNumber(item.max_horizontal_speed_mps, 1)} m/s
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">
                      Вертикальна швидкість
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatNumber(item.max_vertical_speed_mps, 1)} m/s
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">
                      Прискорення
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatNumber(item.max_acceleration_mps2, 1)} m/s²
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">
                      Набір висоти
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatNumber(item.max_altitude_gain_m, 1)} m
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
