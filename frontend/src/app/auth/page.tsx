"use client";

import { readStoredAuth, saveStoredAuth } from "@/entities/auth/model/storage";
import type { AuthMode, AuthResponse } from "@/entities/auth/model/types";
import {
  authenticate,
  resendVerificationEmail,
} from "@/features/auth/api/auth-api";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
      const stored = readStoredAuth();
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

      const authResponse = await authenticate(mode, payload);
      setAuthData(authResponse);
      if (authResponse.session?.access_token && typeof window !== "undefined") {
        saveStoredAuth(authResponse);
        router.replace("/");
        return;
      }

      if (authResponse.requires_email_verification) {
        setSuccess(
          "Реєстрацію виконано. Перевір пошту для підтвердження акаунта.",
        );
      } else {
        setSuccess(
          mode === "login"
            ? "Вхід виконано успішно."
            : "Реєстрацію виконано успішно.",
        );
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
      await resendVerificationEmail(email);

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
    <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(11,93,87,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(208,138,75,0.18),transparent_28%),radial-gradient(circle_at_bottom,rgba(11,93,87,0.08),transparent_38%)]" />
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <motion.section
          variants={itemVariants}
          className="relative overflow-hidden rounded-[2rem] border border-line/70 bg-[linear-gradient(165deg,rgba(255,253,248,0.98)_0%,rgba(242,235,226,0.94)_100%)] p-6 shadow-[0_22px_64px_rgba(27,35,33,0.12)] sm:p-10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(208,138,75,0.12),transparent_22%),radial-gradient(circle_at_10%_90%,rgba(11,93,87,0.1),transparent_24%)]" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="space-y-6">
              <div className="inline-flex rounded-full border border-line/70 bg-surface/85 px-4 py-2 text-sm text-foreground/75">
                Доступ до Joludi
              </div>
              <div className="max-w-xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-brand-ink sm:text-5xl">
                  Один вхід для аналізу, історії та швидких рішень.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-foreground/75 sm:text-lg">
                  Авторизація потрібна лише для персональної історії та
                  збереження результатів. Інтерфейс зводить до мінімуму зайві
                  кроки та чітко показує, що станеться після натискання кнопки.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_10px_24px_rgba(27,35,33,0.08)]">
                  <div className="text-sm text-foreground/60">Швидкий вхід</div>
                  <div className="mt-2 text-lg font-medium text-brand-ink">
                    Email і пароль
                  </div>
                </div>
                <div className="rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_10px_24px_rgba(27,35,33,0.08)]">
                  <div className="text-sm text-foreground/60">Реєстрація</div>
                  <div className="mt-2 text-lg font-medium text-brand-ink">
                    Підтвердження пошти
                  </div>
                </div>
                <div className="rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_10px_24px_rgba(27,35,33,0.08)]">
                  <div className="text-sm text-foreground/60">Безпека</div>
                  <div className="mt-2 text-lg font-medium text-brand-ink">
                    Токени зберігаються локально
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-3xl border border-line/70 bg-surface/85 p-4 text-sm text-foreground/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">
                  Крок 1
                </p>
                <p className="mt-2 text-foreground/75">
                  Оберіть вхід або реєстрацію.
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">
                  Крок 2
                </p>
                <p className="mt-2 text-foreground/75">
                  Заповніть форму без зайвих полів.
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">
                  Крок 3
                </p>
                <p className="mt-2 text-foreground/75">
                  Після входу відкриється дашборд.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-foreground/70">
              <Link
                href="/"
                className="rounded-full border border-line/70 bg-surface px-4 py-2 transition-colors hover:border-brand/40 hover:text-brand-ink"
              >
                На головну
              </Link>
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="rounded-full border border-line/70 bg-brand px-4 py-2 text-surface transition-colors hover:bg-brand-ink"
              >
                {mode === "login"
                  ? "Перейти до реєстрації"
                  : "Перейти до входу"}
              </button>
            </div>
          </div>
        </motion.section>

        <motion.section
          variants={itemVariants}
          className="rounded-[2rem] border border-line/70 bg-surface/92 p-6 shadow-[0_20px_56px_rgba(27,35,33,0.12)] backdrop-blur-sm sm:p-8"
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-foreground/55">
                Авторизація
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-brand-ink">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-foreground/65">
                Форма адаптується під обраний режим і пояснює, що очікується від
                користувача.
              </p>
            </div>
            <div className="rounded-full border border-line/70 bg-surface-soft px-3 py-1 text-sm text-foreground/70">
              {mode === "login" ? "Вхід" : "Реєстрація"}
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-2xl border border-line/70 bg-surface-soft p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-xl px-4 py-3 transition-colors ${
                mode === "login"
                  ? "bg-surface text-brand-ink shadow-sm"
                  : "text-foreground/60"
              }`}
            >
              Вхід
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-xl px-4 py-3 transition-colors ${
                mode === "register"
                  ? "bg-surface text-brand-ink shadow-sm"
                  : "text-foreground/60"
              }`}
            >
              Реєстрація
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground/75">
                Email
              </span>
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
              <span className="text-sm font-medium text-foreground/75">
                Пароль
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === "register" ? 8 : 1}
                className="w-full rounded-2xl border border-line/80 bg-surface px-4 py-3 text-foreground outline-none transition focus:border-brand/60"
                placeholder={
                  mode === "register" ? "Мінімум 8 символів" : "Ваш пароль"
                }
              />
            </label>

            {mode === "register" && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground/75">
                  Підтвердження пароля
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-2xl border border-line/80 bg-surface px-4 py-3 text-foreground outline-none transition focus:border-brand/60"
                  placeholder="Повторіть пароль"
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
              {loading
                ? "Обробка..."
                : mode === "login"
                  ? "Увійти"
                  : "Зареєструватися"}
            </button>
          </form>

          {authData && (
            <div className="mt-6 rounded-2xl border border-line/70 bg-surface-soft p-4 text-sm text-foreground/75">
              <div className="font-medium text-brand-ink">Стан сесії</div>
              <div className="mt-2 break-all">{authData.user.email}</div>
              {authData.requires_email_verification ? (
                <div className="mt-1 text-xs text-foreground/60">
                  Пошту ще треба підтвердити. Після цього можна буде увійти.
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
