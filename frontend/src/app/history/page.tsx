"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AuthSession = {
    access_token: string;
    refresh_token: string;
};

type AuthResponse = {
    session?: AuthSession | null;
};

type HistoryItem = {
    id: string;
    user_id?: string | null;
    created_at: string;
    filename?: string | null;
    message_count?: number | null;
    duration_s?: number | null;
    total_distance_m?: number | null;
    max_horizontal_speed_mps?: number | null;
    max_vertical_speed_mps?: number | null;
    max_acceleration_mps2?: number | null;
    max_altitude_gain_m?: number | null;
    has_snapshot?: boolean;
};

type HistoryResponse = {
    items: HistoryItem[];
};

type AnalyzeResponse = {
    filename?: string;
    message_count?: number;
    metrics?: Record<string, unknown> & { error?: string };
    trajectory_enu?: Array<Record<string, unknown>>;
    plotly_figure?: Record<string, unknown>;
    parsed?: Record<string, unknown>;
};

type HistoryDetailResponse = HistoryItem & {
    analysis_snapshot?: AnalyzeResponse | null;
};

type ApiErrorPayload = {
    detail?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8501";

function formatNumber(value: number | null | undefined, digits = 2): string {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "—";
    }

    return new Intl.NumberFormat("uk-UA", {
        maximumFractionDigits: digits,
    }).format(value);
}

function labelValue(value: string | number | null | undefined): string {
    if (value === undefined || value === null || value === "") {
        return "—";
    }
    return String(value);
}

function readAuth(): AuthResponse | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const raw = window.localStorage.getItem("joludi_auth");
        return raw ? (JSON.parse(raw) as AuthResponse) : null;
    } catch {
        return null;
    }
}

export default function HistoryPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<HistoryItem[]>([]);
    const [email, setEmail] = useState<string | null>(null);

    useEffect(() => {
        const auth = readAuth();
        const token = auth?.session?.access_token;
        if (!token) {
            router.replace("/auth");
            return;
        }

        const loadHistory = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`${API_BASE}/api/history?limit=50`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const data = (await response.json().catch(() => null)) as
                    | HistoryResponse
                    | ApiErrorPayload
                    | null;

                if (!response.ok) {
                    const errorDetail =
                        data &&
                            typeof data === "object" &&
                            "detail" in data &&
                            typeof data.detail === "string"
                            ? data.detail
                            : null;

                    throw new Error(
                        errorDetail ?? `Помилка завантаження історії: ${response.status}`,
                    );
                }

                setItems((data as HistoryResponse).items ?? []);
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
        const auth = readAuth();
        const token = auth?.session?.access_token;
        const refreshToken = auth?.session?.refresh_token;

        try {
            if (refreshToken) {
                await fetch(`${API_BASE}/api/auth/logout`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                });
            }
        } finally {
            if (token) {
                window.localStorage.removeItem("joludi_auth");
                window.localStorage.removeItem("joludi_history_view");
            }
            router.replace("/");
        }
    }

    async function handleViewHistory(itemId: string) {
        const auth = readAuth();
        const token = auth?.session?.access_token;
        if (!token) {
            router.replace("/auth");
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/history/${itemId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = (await response.json().catch(() => null)) as
                | HistoryDetailResponse
                | ApiErrorPayload
                | null;

            if (!response.ok) {
                const errorDetail =
                    data &&
                        typeof data === "object" &&
                        "detail" in data &&
                        typeof data.detail === "string"
                        ? data.detail
                        : null;

                throw new Error(
                    errorDetail ?? `Не вдалося відкрити запис: ${response.status}`,
                );
            }

            const snapshot = (data as HistoryDetailResponse).analysis_snapshot;
            if (!snapshot) {
                throw new Error("Для цього запису немає збереженого польоту.");
            }

            window.localStorage.setItem("joludi_history_view", JSON.stringify(snapshot));
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
            <section className="rounded-[2.5rem] border border-line/60 bg-[linear-gradient(145deg,rgba(255,253,248,0.94)_0%,rgba(242,235,226,0.9)_100%)] p-6 shadow-[0_24px_64px_rgba(27,35,33,0.12)] md:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-foreground/50">
                            Parse history
                        </p>
                        <h1 className="mt-2 text-3xl font-semibold text-brand-ink">
                            Історія парсингу
                        </h1>
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
                            Logout
                        </button>
                    </div>
                </div>

                <p className="mt-4 max-w-2xl text-sm leading-6 text-foreground/70">
                    Тут показуються тільки твої записи. Бекенд уже фільтрує історію по поточному користувачу.
                </p>

                {loading ? (
                    <div className="mt-6 rounded-3xl border border-line/70 bg-surface/80 p-6 text-sm text-foreground/60">
                        Завантаження історії...
                    </div>
                ) : error ? (
                    <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                        {error}
                    </div>
                ) : items.length === 0 ? (
                    <div className="mt-6 rounded-3xl border border-line/70 bg-surface/80 p-6 text-sm text-foreground/60">
                        Історія порожня. Запусти аналіз логу, щоб тут з’явився перший запис.
                    </div>
                ) : (
                    <div className="mt-6 grid gap-4">
                        {items.map((item) => (
                            <article
                                key={item.id}
                                className="rounded-3xl border border-line/70 bg-surface/90 p-5 shadow-[0_12px_30px_rgba(27,35,33,0.08)]"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-semibold text-brand-ink">
                                            {labelValue(item.filename)}
                                        </h2>
                                        <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">
                                            {new Date(item.created_at).toLocaleString("uk-UA")}
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-ink">
                                        {labelValue(item.message_count)} messages
                                    </span>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <span className="rounded-full border border-line/60 bg-surface-soft px-3 py-1 text-xs font-medium text-foreground/60">
                                        {item.has_snapshot ? "Flight snapshot available" : "Preview only"}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => void handleViewHistory(item.id)}
                                        disabled={!item.has_snapshot}
                                        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Переглянути
                                    </button>
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                                        <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Duration</p>
                                        <p className="mt-2 text-lg font-semibold text-foreground">
                                            {formatNumber(item.duration_s, 1)} s
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                                        <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Distance</p>
                                        <p className="mt-2 text-lg font-semibold text-foreground">
                                            {formatNumber(item.total_distance_m, 1)} m
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                                        <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Peak speed</p>
                                        <p className="mt-2 text-lg font-semibold text-foreground">
                                            {formatNumber(item.max_horizontal_speed_mps, 1)} m/s
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                                        <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Vertical speed</p>
                                        <p className="mt-2 text-lg font-semibold text-foreground">
                                            {formatNumber(item.max_vertical_speed_mps, 1)} m/s
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                                        <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Acceleration</p>
                                        <p className="mt-2 text-lg font-semibold text-foreground">
                                            {formatNumber(item.max_acceleration_mps2, 1)} m/s²
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-line/60 bg-surface-soft p-4">
                                        <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Altitude gain</p>
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