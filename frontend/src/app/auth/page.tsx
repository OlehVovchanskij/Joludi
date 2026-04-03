"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type AuthMode = "login" | "register";

type AuthUser = {
    id: string;
    email: string;
    display_name?: string | null;
    created_at: string;
};

type AuthSession = {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    refresh_expires_in: number;
};

type AuthResponse = {
    user: AuthUser;
    session?: AuthSession | null;
    requires_email_verification?: boolean;
};

type ApiErrorPayload = {
    detail?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8501";

const pageVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.05 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0 },
};

export default function AuthPage() {
    const router = useRouter();
    const [mode, setMode] = useState<AuthMode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [authData, setAuthData] = useState<AuthResponse | null>(null);
    const [pendingVerification, setPendingVerification] = useState(false);

    const title = useMemo(
        () => (mode === "login" ? "Увійти в акаунт" : "Створити акаунт"),
        [mode],
    );

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        try {
            const raw = window.localStorage.getItem("joludi_auth");
            if (!raw) {
                return;
            }

            const stored = JSON.parse(raw) as AuthResponse | null;
            if (stored?.session?.access_token) {
                router.replace("/");
            }
        } catch {
            // Ignore malformed cached auth payload.
        }
    }, [router]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setSuccess(null);
        setPendingVerification(false);

        if (mode === "register" && password !== confirmPassword) {
            setError("Паролі не збігаються.");
            return;
        }

        setLoading(true);
        try {
            const payload =
                mode === "login"
                    ? { email, password }
                    : { email, password, display_name: displayName || null };

            const response = await fetch(`${API_BASE}/api/auth/${mode}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = (await response.json().catch(() => null)) as
                | AuthResponse
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
                    errorDetail ?? `Помилка авторизації: ${response.status}`,
                );
            }

            const authResponse = data as AuthResponse;
            setAuthData(authResponse);
            if (authResponse.session?.access_token && typeof window !== "undefined") {
                window.localStorage.setItem("joludi_auth", JSON.stringify(authResponse));
                router.replace("/");
                return;
            }

            if (authResponse.requires_email_verification) {
                setSuccess("Реєстрацію виконано. Перевір пошту для підтвердження акаунта.");
            } else {
                setSuccess(mode === "login" ? "Вхід виконано успішно." : "Реєстрацію виконано успішно.");
            }
        } catch (submissionError) {
            const message =
                submissionError instanceof Error
                    ? submissionError.message
                    : "Не вдалося виконати запит.";
            if (message.toLowerCase().includes("email is not verified")) {
                setPendingVerification(true);
                setSuccess("Акаунт створено, але пошту ще треба підтвердити.");
            }
            setError(message);
        } finally {
            setLoading(false);
        }
    }

    async function resendVerification() {
        setError(null);
        setSuccess(null);

        if (!email) {
            setError("Вкажи email для повторної відправки листа.");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/auth/resend-verification`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = (await response.json().catch(() => null)) as
                | ApiErrorPayload
                | { status?: string }
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
                    errorDetail ?? `Помилка повторної відправки: ${response.status}`,
                );
            }

            setSuccess("Лист для підтвердження пошти відправлено повторно.");
        } catch (submissionError) {
            const message =
                submissionError instanceof Error
                    ? submissionError.message
                    : "Не вдалося відправити лист повторно.";
            setError(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(11,93,87,0.16),transparent_35%),radial-gradient(circle_at_top_right,rgba(208,138,75,0.16),transparent_28%),radial-gradient(circle_at_bottom,rgba(11,93,87,0.08),transparent_40%)]" />
            <motion.div
                variants={pageVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]"
            >
                <motion.section
                    variants={itemVariants}
                    className="relative overflow-hidden rounded-[2rem] border border-line/70 bg-[linear-gradient(165deg,rgba(255,253,248,0.96)_0%,rgba(242,235,226,0.92)_100%)] p-6 shadow-[0_20px_60px_rgba(27,35,33,0.12)] sm:p-10"
                >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(208,138,75,0.13),transparent_22%),radial-gradient(circle_at_10%_90%,rgba(11,93,87,0.12),transparent_24%)]" />
                    <div className="relative space-y-6">
                        <div className="inline-flex rounded-full border border-line/70 bg-surface/80 px-4 py-2 text-sm text-foreground/75">
                            Auth portal
                        </div>
                        <div className="space-y-4 max-w-xl">
                            <h1 className="text-4xl font-semibold tracking-tight text-brand-ink sm:text-5xl">
                                Доступ до панелі керування без зайвих кроків.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-foreground/75 sm:text-lg">
                                Тут окремо зібрані вхід і реєстрація. Для реєстрації є пароль і
                                повторення пароля, а результат сесії можна зберегти у браузері.
                            </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="rounded-2xl border border-line/70 bg-surface/85 p-4">
                                <div className="text-sm text-foreground/60">Login</div>
                                <div className="mt-2 text-lg font-medium text-brand-ink">
                                    Email + password
                                </div>
                            </div>
                            <div className="rounded-2xl border border-line/70 bg-surface/85 p-4">
                                <div className="text-sm text-foreground/60">Register</div>
                                <div className="mt-2 text-lg font-medium text-brand-ink">
                                    Password confirmation
                                </div>
                            </div>
                            <div className="rounded-2xl border border-line/70 bg-surface/85 p-4">
                                <div className="text-sm text-foreground/60">Session</div>
                                <div className="mt-2 text-lg font-medium text-brand-ink">
                                    JWT pair
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 text-sm text-foreground/70">
                            <Link
                                href="/"
                                className="rounded-full border border-line/70 bg-surface px-4 py-2 transition-colors hover:border-brand/40 hover:text-brand-ink"
                            >
                                Повернутися до дашборда
                            </Link>
                            <button
                                type="button"
                                onClick={() => setMode(mode === "login" ? "register" : "login")}
                                className="rounded-full border border-line/70 bg-brand px-4 py-2 text-surface transition-colors hover:bg-brand-ink"
                            >
                                {mode === "login" ? "Перейти до реєстрації" : "Перейти до входу"}
                            </button>
                        </div>
                    </div>
                </motion.section>

                <motion.section
                    variants={itemVariants}
                    className="rounded-[2rem] border border-line/70 bg-surface/90 p-6 shadow-[0_18px_48px_rgba(27,35,33,0.12)] backdrop-blur-sm sm:p-8"
                >
                    <div className="mb-6 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm uppercase tracking-[0.18em] text-foreground/55">
                                Authentication
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold text-brand-ink">
                                {title}
                            </h2>
                        </div>
                        <div className="rounded-full border border-line/70 bg-surface-soft px-3 py-1 text-sm text-foreground/70">
                            {mode === "login" ? "Вхід" : "Реєстрація"}
                        </div>
                    </div>

                    <div className="mb-6 grid grid-cols-2 rounded-2xl border border-line/70 bg-surface-soft p-1 text-sm font-medium">
                        <button
                            type="button"
                            onClick={() => setMode("login")}
                            className={`rounded-xl px-4 py-3 transition-colors ${mode === "login"
                                    ? "bg-surface text-brand-ink shadow-sm"
                                    : "text-foreground/60"
                                }`}
                        >
                            Вхід
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode("register")}
                            className={`rounded-xl px-4 py-3 transition-colors ${mode === "register"
                                    ? "bg-surface text-brand-ink shadow-sm"
                                    : "text-foreground/60"
                                }`}
                        >
                            Реєстрація
                        </button>
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <label className="block space-y-2">
                            <span className="text-sm font-medium text-foreground/75">Email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                required
                                className="w-full rounded-2xl border border-line/80 bg-surface px-4 py-3 text-foreground outline-none transition focus:border-brand/60"
                                placeholder="you@example.com"
                            />
                        </label>

                        {mode === "register" && (
                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-foreground/75">
                                    Ім&apos;я або нікнейм
                                </span>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    className="w-full rounded-2xl border border-line/80 bg-surface px-4 py-3 text-foreground outline-none transition focus:border-brand/60"
                                    placeholder="Drone pilot"
                                />
                            </label>
                        )}

                        <label className="block space-y-2">
                            <span className="text-sm font-medium text-foreground/75">Password</span>
                            <input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                                minLength={mode === "register" ? 8 : 1}
                                className="w-full rounded-2xl border border-line/80 bg-surface px-4 py-3 text-foreground outline-none transition focus:border-brand/60"
                                placeholder={mode === "register" ? "Min 8 characters" : "Your password"}
                            />
                        </label>

                        {mode === "register" && (
                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-foreground/75">
                                    Repeat password
                                </span>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    required
                                    minLength={8}
                                    className="w-full rounded-2xl border border-line/80 bg-surface px-4 py-3 text-foreground outline-none transition focus:border-brand/60"
                                    placeholder="Repeat your password"
                                />
                            </label>
                        )}

                        {error && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        {pendingVerification && (
                            <button
                                type="button"
                                onClick={resendVerification}
                                disabled={loading}
                                className="w-full rounded-2xl border border-brand/20 bg-brand/10 px-4 py-3 text-sm font-medium text-brand-ink transition-colors hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                Повторно надіслати лист підтвердження
                            </button>
                        )}

                        {success && (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                {success}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-2xl bg-brand px-4 py-3 text-base font-medium text-surface transition-colors hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {loading ? "Обробка..." : mode === "login" ? "Увійти" : "Зареєструватися"}
                        </button>
                    </form>

                    {authData && (
                        <div className="mt-6 rounded-2xl border border-line/70 bg-surface-soft p-4 text-sm text-foreground/75">
                            <div className="font-medium text-brand-ink">Session ready</div>
                            <div className="mt-2 break-all">{authData.user.email}</div>
                            {authData.requires_email_verification ? (
                                <div className="mt-1 text-xs text-foreground/60">
                                    Пошта ще не підтверджена. Після кліку на посилання з листа ти зможеш увійти.
                                </div>
                            ) : (
                                <div className="mt-1 break-all text-xs text-foreground/60">
                                    Access token: {authData.session?.access_token}
                                </div>
                            )}
                        </div>
                    )}
                </motion.section>
            </motion.div>
        </main>
    );
}