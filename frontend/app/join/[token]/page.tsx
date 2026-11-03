"use client";

import { motion } from "framer-motion";
import {
  ArrowClockwise,
  ArrowLeft,
  Clock,
  Hourglass,
  LinkBreak,
  SealCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/Brand";
import { CreditFooter } from "@/components/CreditFooter";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { num } from "@/lib/format";
import type { GuestSessionInfo } from "@/lib/types";

const NAME_STORAGE = "darsjo.guest.name";

export default function GuestJoinPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [info, setInfo] = useState<GuestSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  function loadInfo() {
    setLoading(true);
    setLinkError(null);
    return apiGet<GuestSessionInfo>(`/guest/${token}`)
      .then((data) => {
        setInfo(data);
        setFormError(null);
      })
      .catch((error: unknown) => {
        setInfo(null);
        setLinkError(error instanceof Error ? error.message : "این لینک معتبر نیست.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGet<GuestSessionInfo>(`/guest/${token}`)
      .then((data) => {
        if (!alive) return;
        setInfo(data);
        setLinkError(null);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setInfo(null);
        setLinkError(error instanceof Error ? error.message : "این لینک معتبر نیست.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // The link is permanent, so the page can wait as long as the pupil keeps it
  // open; it unlocks itself the moment the teacher starts a session.
  useEffect(() => {
    if (!info || info.running) return;
    const timer = window.setInterval(() => {
      apiGet<GuestSessionInfo>(`/guest/${token}`)
        .then((data) => setInfo(data))
        .catch(() => {
          /* transient network error: keep the page as it is */
        });
    }, 7000);
    return () => window.clearInterval(timer);
  }, [info?.running, token]);

  useEffect(() => {
    if (!info) return;
    document.title = `ورود به ${info.offeringTitle} — ${info.school}`;
  }, [info]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(NAME_STORAGE) || "null");
      if (saved && typeof saved.first === "string") setFirstName(saved.first);
      if (saved && typeof saved.last === "string") setLastName(saved.last);
    } catch {
      /* private mode or corrupted value: start with empty fields */
    }
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (joining || !info) return;
    setFormError(null);
    const first = firstName.trim();
    const last = lastName.trim();
    if (first.length < 2 || last.length < 2) {
      setFormError("نام و نام خانوادگی را کامل بنویسید.");
      return;
    }
    setJoining(true);
    try {
      const result = await apiPost<{ joinUrl: string }>(`/guest/${token}/join`, {
        firstName: first,
        lastName: last,
      });
      try {
        window.localStorage.setItem(NAME_STORAGE, JSON.stringify({ first, last }));
      } catch {
        /* storage is optional */
      }
      window.location.assign(result.joinUrl);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setFormError(error instanceof Error ? error.message : "ورود به کلاس ممکن نشد.");
      setJoining(false);
      if (apiError && ["not_running", "invalid_link"].includes(apiError.code || "")) {
        loadInfo();
      }
    }
  }

  const accent = info?.subjectColor || "#0d9488";
  const running = Boolean(info?.running);

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(30rem 22rem at 82% 8%, rgba(45,212,191,.20), transparent 62%), radial-gradient(26rem 20rem at 8% 92%, rgba(251,191,36,.16), transparent 60%)",
        }}
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 230, damping: 26 }}
        className="w-full max-w-[420px]"
      >
        <header className="mb-4 flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14" />
          <p className="mt-2.5 font-display text-[19px] leading-none text-brand-900">{info?.school || "دبستان مهر"}</p>
          <p className="mt-1.5 text-[11.5px] text-ink-muted">ورود مهمان به کلاس مجازی</p>
        </header>

        <div className="card overflow-hidden">
          <div className="h-1.5" style={{ background: accent }} aria-hidden="true" />

          {loading ? (
            <div className="space-y-3 p-5" aria-busy="true">
              <div className="skeleton h-5 w-28 rounded-lg" />
              <div className="skeleton h-7 w-3/4 rounded-lg" />
              <div className="skeleton h-4 w-1/2 rounded-lg" />
              <div className="skeleton mt-5 h-24 rounded-xl" />
            </div>
          ) : linkError || !info ? (
            <div className="px-5 py-8 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                <LinkBreak size={28} weight="duotone" aria-hidden="true" />
              </span>
              <h1 className="mt-3 font-display text-[19px] text-ink">این لینک معتبر نیست</h1>
              <p className="mx-auto mt-1.5 max-w-[280px] text-[12px] leading-6 text-ink-muted">
                {linkError && !linkError.includes("معتبر نیست")
                  ? linkError
                  : "ممکن است لینک عوض شده باشد یا درس حذف شده باشد. از معلم لینک تازه بخواهید."}
              </p>
              <button type="button" onClick={loadInfo} className="btn-soft mt-5">
                <ArrowClockwise size={16} aria-hidden="true" />
                بررسی دوباره
              </button>
            </div>
          ) : (
            <>
              <div className="px-5 pb-4 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`chip ${
                      running ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      {running && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span
                        className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                          running ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                    </span>
                    {info.statusLabel}
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    {running && info.sessionNumberLabel ? `جلسهٔ ${info.sessionNumberLabel}` : "لینک ثابت کلاس"}
                  </span>
                </div>

                <h1 className="mt-2.5 font-display text-[24px] leading-tight text-ink">{info.offeringTitle}</h1>
                {running && info.title && <p className="mt-1 text-[12.5px] text-ink-soft">{info.title}</p>}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-muted">
                  <span>{info.className}</span>
                  <span className="h-1 w-1 rounded-full bg-ink-muted/30" aria-hidden="true" />
                  <span>{info.teacherName}</span>
                </p>
              </div>

              <div className="border-t border-dashed border-[color:var(--line)]" />

              <div className="px-5 py-4">
                {!running && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] leading-6 text-amber-900">
                    <Clock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      کلاس هنوز شروع نشده. نام خود را بنویسید؛ همین‌که معلم کلاس را شروع کند، دکمه فعال می‌شود و
                      این صفحه خودش خبر می‌دهد. لینک همیشه همین است.
                    </span>
                  </div>
                )}

                <form onSubmit={submit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="guest-first" className="label text-[11.5px]">
                        نام
                      </label>
                      <input
                        id="guest-first"
                        name="firstName"
                        autoComplete="given-name"
                        className="input text-[16px] sm:text-[13.5px]"
                        placeholder="مثلاً علی"
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        maxLength={40}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="guest-last" className="label text-[11.5px]">
                        نام خانوادگی
                      </label>
                      <input
                        id="guest-last"
                        name="lastName"
                        autoComplete="family-name"
                        className="input text-[16px] sm:text-[13.5px]"
                        placeholder="مثلاً رضایی"
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        maxLength={40}
                        required
                      />
                    </div>
                  </div>

                  {formError && (
                    <p
                      role="alert"
                      className="flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] leading-6 text-red-800"
                    >
                      <WarningCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!running || joining}
                    className="btn-primary w-full py-3 text-[13.5px]"
                  >
                    {joining ? (
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                    ) : running ? (
                      <ArrowLeft size={18} weight="bold" aria-hidden="true" />
                    ) : (
                      <Hourglass size={17} aria-hidden="true" />
                    )}
                    {joining ? "در حال ورود به کلاس…" : running ? "ورود به کلاس" : "منتظر شروع کلاس"}
                  </button>

                  <p className="flex items-center justify-center gap-1.5 text-center text-[10.5px] leading-5 text-ink-muted">
                    <SealCheck size={13} className="shrink-0" aria-hidden="true" />
                    نام شما فقط برای حضور و غیاب ثبت می‌شود.
                  </p>
                </form>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[10.5px] leading-5 text-ink-muted">
          {info && !loading ? (
            <>لینک ثابت کلاس · بدون نام کاربری{info.running ? ` · جلسهٔ ${num(info.sessionNumber || 0)}` : ""}</>
          ) : (
            "لینک ورود مهمان · دبستان مهر"
          )}
        </p>
        <CreditFooter className="mt-3" />
      </motion.div>
    </main>
  );
}
