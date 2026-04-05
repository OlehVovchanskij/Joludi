"use client";

import { saveStoredAuth } from "@/entities/auth/model/storage";
import { verifyEmailToken } from "@/features/auth/api/auth-api";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("Підтвердження пошти...");
  const hasRun = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (hasRun.current) return;
      hasRun.current = true;
      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) {
        setStatus("error");
        setMessage("Відсутній токен підтвердження.");
        return;
      }

      setStatus("loading");
      try {
        const authResponse = await verifyEmailToken(token);
        if (typeof window !== "undefined") {
          saveStoredAuth(authResponse);
        }
        setStatus("success");
        setMessage("Пошту підтверджено. Можна повертатися на головну.");
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Сталася помилка.");
      }
    };

    void run();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="max-w-lg rounded-3xl border border-line/70 bg-surface/90 p-8 text-center shadow-[0_20px_60px_rgba(27,35,33,0.12)]">
        <p className="text-xs uppercase tracking-[0.2em] text-foreground/50">
          Email verification
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-brand-ink">
          {status === "success"
            ? "Пошту підтверджено"
            : status === "error"
              ? "Помилка підтвердження"
              : "Підтвердження..."}
        </h1>
        <p className="mt-4 text-sm leading-6 text-foreground/70">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            На головну
          </Link>
          <Link
            href="/auth"
            className="rounded-full border border-line/70 bg-surface px-4 py-2 text-sm font-medium text-foreground/70"
          >
            До входу
          </Link>
        </div>
      </div>
    </main>
  );
}
