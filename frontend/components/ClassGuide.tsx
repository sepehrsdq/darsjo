"use client";

import { CaretDown, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";

/**
 * A tiny, dependency-free visual walkthrough for the class screen.
 *
 * The three scenes are inline SVG so they render on the national network
 * without any external asset, and all motion is CSS (disabled automatically by
 * the global `prefers-reduced-motion` rule).
 */

const STEPS = [
  {
    title: "کلاس بساز",
    hint: "نام و پایه را بده؛ کلاس همان لحظه در فهرست می‌نشیند.",
    scene: "class" as const,
    tone: "teal",
  },
  {
    title: "دانش‌آموز اضافه کن",
    hint: "تک‌نفره یا با فایل اکسل؛ دانش‌آموز از کلاس قبلی منتقل می‌شود.",
    scene: "student" as const,
    tone: "amber",
  },
  {
    title: "درس را بسپار",
    hint: "درس و معلمش را انتخاب کن؛ شروع کلاس فقط با همان معلم است.",
    scene: "lesson" as const,
    tone: "sky",
  },
];

const TONES: Record<string, { chip: string; ring: string }> = {
  teal: { chip: "bg-brand-50 text-brand-700", ring: "ring-brand-500/15" },
  amber: { chip: "bg-amber-50 text-amber-700", ring: "ring-amber-500/15" },
  sky: { chip: "bg-sky-50 text-sky-700", ring: "ring-sky-500/15" },
};

function Scene({ kind }: { kind: "class" | "student" | "lesson" }) {
  if (kind === "class") {
    return (
      <svg viewBox="0 0 120 64" role="img" aria-label="ساخت کلاس تازه" className="h-16 w-full">
        <rect x="24" y="12" width="72" height="42" rx="11" fill="#ccfbf1" />
        <rect x="33" y="21" width="35" height="5" rx="2.5" fill="#0d9488" opacity=".55" />
        <rect x="33" y="32" width="24" height="4" rx="2" fill="#0d9488" opacity=".28" />
        <g className="guide-pop">
          <circle cx="82" cy="41" r="11" fill="#0d9488" />
          <path d="M82 36.4v9.2M77.4 41h9.2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      </svg>
    );
  }
  if (kind === "student") {
    return (
      <svg viewBox="0 0 120 64" role="img" aria-label="افزودن دانش‌آموز" className="h-16 w-full">
        <rect x="16" y="12" width="88" height="42" rx="11" fill="#fffbeb" />
        <g className="guide-slide">
          <circle cx="39" cy="33" r="7.5" fill="#f59e0b" />
          <rect x="52" y="27" width="34" height="4.5" rx="2.25" fill="#f59e0b" opacity=".42" />
          <rect x="52" y="35.5" width="21" height="3.5" rx="1.75" fill="#f59e0b" opacity=".22" />
        </g>
        <g className="guide-float">
          <circle cx="86" cy="20" r="6.5" fill="#0d9488" />
          <path d="M86 17.1v5.8M83.1 20h5.8" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 64" role="img" aria-label="درس و معلم" className="h-16 w-full">
      <rect x="12" y="18" width="36" height="29" rx="9" fill="#eff6ff" />
      <rect x="19" y="25" width="22" height="3.5" rx="1.75" fill="#2563eb" opacity=".5" />
      <rect x="19" y="33" width="14" height="3" rx="1.5" fill="#2563eb" opacity=".25" />
      <path className="guide-dash" d="M51 32.5h19" stroke="#0d9488" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
      <circle cx="86" cy="32.5" r="13" fill="#0d9488" />
      <circle cx="86" cy="28.5" r="4.5" fill="#fff" />
      <path d="M78 40.5c1.5-4 4.6-6 8-6s6.5 2 8 6" fill="#fff" />
    </svg>
  );
}

export function ClassGuide() {
  const [open, setOpen] = useState(true);

  return (
    <section className="card guide-card relative overflow-hidden" aria-labelledby="class-guide-title">
      <span className="guide-glow" aria-hidden="true" />
      <header className="relative flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-soft">
            <Sparkle size={18} weight="fill" aria-hidden="true" />
          </span>
          <div>
            <h2 id="class-guide-title" className="text-[13.5px] font-semibold text-ink">
              سه قدم تا کلاس آماده
            </h2>
            <p className="text-[11.5px] text-ink-muted">کارهای این صفحه را به همین ترتیب انجام بده</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="class-guide-body"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-ink-muted transition hover:bg-brand-50 hover:text-brand-700"
        >
          {open ? "بستن" : "نمایش"}
          <CaretDown size={14} className={`transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </header>

      <div
        id="class-guide-body"
        className={`relative grid gap-3 px-4 pb-4 pt-3 transition-all duration-300 sm:grid-cols-3 ${
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
                  {["۱", "۲", "۳"][index]}
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
