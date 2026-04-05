import type { ChatMessage } from "@/entities/telemetry/model/types";
import { motion } from "framer-motion";
import { FormEvent } from "react";

type DashboardAiChatSectionProps = {
  sectionAnimation: {
    hidden: { opacity: number; y: number };
    visible: { opacity: number; y: number };
  };
  summaryProvider?: string;
  hasResult: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
  chatLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChangeInput: (value: string) => void;
};

export function DashboardAiChatSection({
  sectionAnimation,
  summaryProvider,
  hasResult,
  chatMessages,
  chatInput,
  chatLoading,
  onSubmit,
  onChangeInput,
}: DashboardAiChatSectionProps) {
  return (
    <motion.section
      className="grid gap-4 rounded-3xl border border-line/70 bg-surface/90 p-5 shadow-[0_16px_48px_rgba(27,35,33,0.1)] backdrop-blur-sm lg:grid-cols-[1.1fr_0.9fr] md:p-6"
      initial="hidden"
      animate="visible"
      variants={sectionAnimation}
      transition={{ duration: 0.45, delay: 0.19 }}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand/75">
              AI analyst
            </p>
            <h2 className="mt-2 text-lg font-semibold text-foreground md:text-xl">
              Поговори з AI-аналітиком
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Питай про помилки, ризики, тренування або конкретні маневри.
              Асистент бачить поточний аналіз місії.
            </p>
          </div>
          <div className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink">
            {summaryProvider ?? "standby"}
          </div>
        </div>

        <div className="max-h-[22rem] space-y-3 overflow-y-auto rounded-2xl border border-line/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(248,242,234,0.92)_100%)] p-4">
          {chatMessages.length > 0 ? (
            chatMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    message.role === "user"
                      ? "bg-brand text-white"
                      : "border border-line/60 bg-surface text-foreground"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))
          ) : (
            <div className="flex h-full min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-line/60 bg-white/50 p-4 text-center text-sm text-foreground/60">
              Напиши перше питання, наприклад: як зменшити ривки по вертикалі
              або як тренувати плавні розгони.
            </div>
          )}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-line/60 bg-surface px-4 py-3 text-sm text-foreground/60">
                AI формує відповідь...
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-line/70 bg-surface/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">
              Твоє питання
            </span>
            <textarea
              value={chatInput}
              onChange={(event) => onChangeInput(event.target.value)}
              rows={5}
              placeholder="Наприклад: що мені змінити, щоб політ був плавніший?"
              className="w-full resize-none rounded-2xl border border-line/70 bg-surface px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand/50"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!hasResult || chatLoading || !chatInput.trim()}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {chatLoading ? "Відправляю..." : "Запитати AI"}
            </button>
            <button
              type="button"
              onClick={() => onChangeInput("")}
              className="rounded-full border border-line/70 bg-surface px-4 py-2 text-sm font-medium text-foreground/70 transition hover:border-brand/40"
            >
              Очистити
            </button>
          </div>
        </form>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">
            Швидкі запити
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              "Як зменшити вертикальні ривки?",
              "Що змінити, щоб політ був плавнішим?",
              "Склади 3 тренування для кращого контролю.",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onChangeInput(prompt)}
                className="rounded-full border border-accent/30 bg-accent/10 px-3 py-2 text-left text-xs font-medium text-accent-ink transition hover:bg-accent/15"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-brand/15 bg-brand/5 p-4 text-sm leading-6 text-foreground/70">
          AI-аналітик використовує поточний аналіз місії як контекст. Якщо
          хочеш, я можу ще додати режим збереження діалогу в history або окремі
          тренувальні сценарії для пілота.
        </div>
      </div>
    </motion.section>
  );
}
