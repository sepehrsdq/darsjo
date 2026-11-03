"use client";

import { CaretDown, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";

/**
 * Visual, dependency-free walkthrough of the session → room → recording flow.
 * Every scene is inline SVG and every animation is CSS, so it works on the
 * national network and respects `prefers-reduced-motion`.
 */

const STEPS = [
  {
    title: "لینک ثابت کلاس",
    hint: "یک لینک برای همهٔ جلسه‌ها؛ یک‌بار در گروه کلاس بفرستید.",
    scene: "link" as const,
    tone: "sky",
  },
  {
    title: "جلسه را شماره بزن",
    hint: "فقط شماره و عنوان جلسه؛ برای ضبط و تاریخ همان جلسه.",
    scene: "session" as const,
    tone: "teal",
  },
  {
    title: "کلاس را شروع کن",
    hint: "با «شروع کلاس» همان لینک ثابت برای دانش‌آموزان باز می‌شود.",
    scene: "room" as const,
    tone: "amber",
  },
  {
    title: "ضبط و پایان",
    hint: "ضبط دستی است؛ با پایان جلسه لینک بسته می‌شود تا شروع بعدی.",
    scene: "record" as const,
    tone: "rose",
  },
];

const TONES: Record<string, { chip: string; ring: string }> = {
  teal: { chip: "bg-brand-50 text-brand-700", ring: "ring-brand-500/15" },
  sky: { chip: "bg-sky-50 text-sky-700", ring: "ring-sky-500/15" },
  rose: { chip: "bg-rose-50 text-rose-700", ring: "ring-rose-500/15" },
  amber: { chip: "bg-amber-50 text-amber-700", ring: "ring-amber-500/15" },
};

function Scene({ kind }: { kind: "link" | "session" | "room" | "record" }) {
  if (kind === "link") {
    return (
      <svg viewBox="0 0 120 64" role="img" aria-label="لینک ثابت کلاس" className="h-16 w-full">
        <rect x="16" y="13" width="88" height="40" rx="11" fill="#eff6ff" />
        <g className="guide-float">
          <rect x="25" y="27" width="24" height="11" rx="5.5" fill="none" stroke="#2563eb" strokeWidth="3" />
          <rect x="42" y="27" width="24" height="11" rx="5.5" fill="none" stroke="#0d9488" strokeWidth="3" />
        </g>
        <path
          className="guide-dash"
          d="M74 33h17m0 0-5.5-5.5M91 33l-5.5 5.5"
          stroke="#2563eb"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity=".55"
        />
        <rect x="26" y="44" width="30" height="3.5" rx="1.75" fill="#2563eb" opacity=".22" />
      </svg>
    );
  }
  if (kind === "session") {
    return (
      <svg viewBox="0 0 120 64" role="img" aria-label="ساخت جلسهٔ شماره‌دار" className="h-16 w-full">
        <rect x="17" y="10" width="86" height="44" rx="11" fill="#ccfbf1" />
        <g className="guide-pop">
          <rect x="26" y="19" width="34" height="26" rx="7" fill="#0d9488" />
          <text x="43" y="37" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">
            ۳
          </text>
        </g>
        <rect x="68" y="23" width="26" height="4.5" rx="2.25" fill="#0d9488" opacity=".45" />
        <rect x="68" y="33" width="18" height="3.5" rx="1.75" fill="#0d9488" opacity=".22" />
        <g className="guide-float">
          <circle cx="94" cy="45" r="5.5" fill="#0d9488" />
          <path d="M94 42.6v4.8M91.6 45h4.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      </svg>
    );
  }
  if (kind === "room") {
    return (
      <svg viewBox="0 0 120 64" role="img" aria-label="شروع کلاس همان جلسه" className="h-16 w-full">
        <rect x="16" y="13" width="88" height="40" rx="11" fill="#eff6ff" />
        <rect x="25" y="21" width="30" height="24" rx="7" fill="#2563eb" opacity=".16" />
        <path d="M32 28h16M32 34h11" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" opacity=".55" />
        <g className="guide-pop">
          <circle cx="78" cy="33" r="13" fill="#0d9488" />
          <path d="m74 27 9 6-9 6V27Z" fill="#fff" />
        </g>
      </svg>
    );
  }
  if (kind === "record") {
    return (
      <svg viewBox="0 0 120 64" role="img" aria-label="ضبط دستی جلسه" className="h-16 w-full">
        <rect x="16" y="13" width="88" height="40" rx="11" fill="#fff1f2" />
        <path
          className="guide-dash"
          d="M27 42h64"
          stroke="#e11d48"
          strokeWidth="2.2"
          strokeDasharray="5 5"
          strokeLinecap="round"
          opacity=".5"
        />
        <g className="guide-float">
          <circle cx="42" cy="32" r="8" fill="#e11d48" />
          <circle cx="42" cy="32" r="3.2" fill="#fff" />
        </g>
        <rect x="58" y="25" width="30" height="4.5" rx="2.25" fill="#e11d48" opacity=".35" />
        <rect x="58" y="34" width="20" height="3.5" rx="1.75" fill="#e11d48" opacity=".18" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 64" role="img" aria-label="تماشای ضبط جلسه" className="h-16 w-full">
      <rect x="14" y="12" width="92" height="42" rx="11" fill="#fffbeb" />
      <rect x="24" y="20" width="44" height="26" rx="6" fill="#f59e0b" opacity=".18" />
      <g className="guide-pop">
        <circle cx="46" cy="33" r="9" fill="#f59e0b" />
        <path d="m43 28 7 5-7 5V28Z" fill="#fff" />
      </g>
      <rect x="76" y="23" width="20" height="4" rx="2" fill="#f59e0b" opacity=".45" />
      <rect x="76" y="31" width="14" height="3.5" rx="1.75" fill="#f59e0b" opacity=".25" />
      <path
        className="guide-dash"
        d="M82 44h12"
        stroke="#0d9488"
        strokeWidth="2"
        strokeDasharray="3 3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SessionGuide() {
  const [open, setOpen] = useState(true);

  return (
    <section className="card guide-card relative overflow-hidden" aria-labelledby="session-guide-title">
      <span className="guide-glow" aria-hidden="true" />
      <header className="relative flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-soft">
            <Sparkle size={18} weight="fill" aria-hidden="true" />
          </span>
          <div>
            <h2 id="session-guide-title" className="text-[13.5px] font-semibold text-ink">
              چهار قدم تا کلاس و ضبط
            </h2>
            <p className="text-[11.5px] text-ink-muted">لینک ثابت است؛ شمارهٔ جلسه فقط برای ضبط و تاریخ</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="session-guide-body"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-ink-muted transition hover:bg-brand-50 hover:text-brand-700"
        >
          {open ? "بستن" : "نمایش"}
          <CaretDown size={14} className={`transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </header>

      <div
        id="session-guide-body"
        className={`relative grid gap-3 px-4 pb-4 pt-3 transition-all duration-300 sm:grid-cols-2 xl:grid-cols-4 ${
          open ? "opacity-100" : "pointer-events-none max-h-0 overflow-hidden pb-0 pt-0 opacity-0"
        }`}
      >
        {STEPS.map((step, index) => {
          const tone = TONES[step.tone];
          return (
            <div
              key={step.title}
              className={`guide-step group relative rounded-2xl border border-[color:var(--line)] bg-white/80 p-3 ring-1 ring-transparent transition hover:-translate-y-0.5 hover:shadow-soft ${tone.ring}`}
            >
              <span className="absolute inset-x-3 top-0 h-px bg-gradient-to-l from-transparent via-brand-400/60 to-transparent" aria-hidden="true" />
              <div className="flex items-center justify-between gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${tone.chip}`}>
                  {["۱", "۲", "۳", "۴"][index]}
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400/50 transition group-hover:bg-brand-500" aria-hidden="true" />
              </div>
              <Scene kind={step.scene} />
              <p className="text-[12.5px] font-semibold text-ink">{step.title}</p>
              <p className="mt-0.5 text-[11px] leading-5 text-ink-muted">{step.hint}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
