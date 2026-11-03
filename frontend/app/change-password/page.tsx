"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Key, ShieldCheck } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BrandMark } from "@/components/Brand";
import { CreditFooter } from "@/components/CreditFooter";
import { ToastProvider, useToast } from "@/components/Toast";
import { api, apiGet } from "@/lib/api";
import type { SessionInfo } from "@/lib/types";

function strength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

const strengthLabels = ["خیلی ضعیف", "ضعیف", "متوسط", "خوب", "قوی"];
const strengthColors = ["bg-red-400", "bg-orange-400", "bg-amber-400", "bg-teal-400", "bg-emerald-500"];

function ChangePasswordForm() {
  const router = useRouter();
  const { push } = useToast();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<SessionInfo>("/auth/me")
      .then((payload) => {
        setSession(payload);
        if (!payload.mustChangePassword) router.replace("/dashboard");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const level = useMemo(() => strength(next), [next]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: current,
          new_password: next,
          confirm_password: confirm,
        }),
      });
      push("رمز با موفقیت تغییر کرد. خوش آمدید!", "success");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تغییر رمز ممکن نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="w-full max-w-[430px]"
      >
        <div className="mb-5 flex items-center justify-center gap-3">
          <BrandMark className="h-11 w-11" />
          <div>
            <p className="font-display text-lg text-brand-900">دبستان مهر</p>
            <p className="text-[11.5px] text-ink-muted">کلاس‌های مجازی</p>
          </div>
        </div>

        <div className="card p-6 sm:p-7">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-sun-700">
              <Key size={24} weight="duotone" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-base font-semibold text-ink">
                {session?.user?.fullName ? `${session.user.fullName} عزیز، ` : ""}یک رمز تازه بساز
              </h1>
              <p className="mt-1 text-[12.5px] leading-6 text-ink-muted">
                برای امنیت حساب، رمز اولیه را تغییر دهید. رمز جدید نباید کد ملی یا نام کاربری باشد.
              </p>
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="current" className="label">رمز فعلی</label>
              <input
                id="current"
                type="password"
                autoComplete="current-password"
                className="input"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="next" className="label">رمز جدید</label>
              <input
                id="next"
                type="password"
                autoComplete="new-password"
                className="input"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                required
                minLength={8}
              />
              <div className="mt-2 flex items-center gap-2">
                <div className="flex flex-1 gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      className={`h-1.5 flex-1 rounded-full transition ${
                        index < level ? strengthColors[level] : "bg-brand-100"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-ink-muted">{next ? strengthLabels[level] : "حداقل ۸ کاراکتر"}</span>
              </div>
            </div>
            <div>
              <label htmlFor="confirm" className="label">تکرار رمز جدید</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                className="input"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
              ) : (
                <ArrowLeft size={19} weight="bold" />
              )}
              {busy ? "در حال ذخیره…" : "ذخیره و ورود به کلاس‌ها"}
            </button>
          </form>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-muted">
            <ShieldCheck size={16} aria-hidden="true" />
            رمز شما به‌صورت رمزنگاری‌شده نگه‌داری می‌شود.
          </p>

          <CreditFooter className="mt-4" />
        </div>
      </motion.div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <ToastProvider>
      <ChangePasswordForm />
    </ToastProvider>
  );
}
