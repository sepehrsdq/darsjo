"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  Eye,
  EyeSlash,
  FilmSlate,
  LockKey,
  Notebook,
  ShieldCheck,
  Star,
  User,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/Brand";
import { CreditFooter } from "@/components/CreditFooter";
import { PuzzleCaptcha, type CaptchaSolution } from "@/components/PuzzleCaptcha";
import { ApiError, api, apiGet } from "@/lib/api";
import type { SessionInfo } from "@/lib/types";

const floats = [
  {
    icon: Notebook,
    title: "تکالیف ریاضی",
    hint: "امروز تحویل بده",
    className: "right-[6%] top-[16%]",
    delay: 0.35,
    tint: "from-amber-300/30 to-amber-500/10",
  },
  {
    icon: FilmSlate,
    title: "ویدیوی درس",
    hint: "۲۴ دقیقه",
    className: "right-[30%] top-[42%]",
    delay: 0.5,
    tint: "from-teal-300/30 to-teal-500/10",
  },
  {
    icon: Star,
    title: "آفرین!",
    hint: "۳ ستاره گرفتی",
    className: "right-[12%] top-[68%]",
    delay: 0.65,
    tint: "from-pink-300/30 to-pink-500/10",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaSolution | null>(null);
  const [captchaRefresh, setCaptchaRefresh] = useState(0);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaErrorSignal, setCaptchaErrorSignal] = useState(0);

  useEffect(() => {
    apiGet<SessionInfo>("/auth/me")
      .then((session) => {
        router.replace(session.mustChangePassword ? "/change-password" : "/dashboard");
      })
      .catch(() => {});
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setCaptchaError(null);

    if (!captcha || captcha.x === null) {
      setCaptchaError("اول قطعهٔ پازل را رها کنید تا بررسی شود.");
      setError("برای ادامه، پازل امنیتی را کامل کنید.");
      setCaptchaErrorSignal((value) => value + 1);
      return;
    }

    setBusy(true);
    try {
      const session = await api<SessionInfo>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          captcha_token: captcha.token,
          captcha_x: captcha.x,
        }),
      });
      router.replace(session.mustChangePassword ? "/change-password" : "/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "captcha") {
        setCaptchaError(err.message);
        setCaptchaErrorSignal((value) => value + 1);
      } else {
        setError(err instanceof Error ? err.message : "ورود ناموفق بود");
      }
      // Every puzzle is good for exactly one login request, so always hand out
      // a fresh one; the visitor never has to guess whether the old one is dead.
      setCaptcha(null);
      setCaptchaRefresh((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_440px]">
      {/* hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 px-6 pb-10 pt-8 text-white sm:px-10 lg:order-1 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(38rem 24rem at 78% 12%, rgba(45,212,191,.35), transparent 62%), radial-gradient(30rem 20rem at 8% 88%, rgba(251,191,36,.22), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(70% 70% at 50% 40%, #000 30%, transparent 80%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-center gap-3">
          <BrandMark className="h-12 w-12" />
          <div>
            <p className="font-display text-xl leading-none text-white">دبستان مهر</p>
            <p className="mt-1 text-[11.5px] text-white/70">کلاس‌های مجازی و فایل‌های درس</p>
          </div>
        </div>

        <div className="relative z-10 mt-10 max-w-md lg:mt-0">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="chip border border-white/15 bg-white/10 text-white/85"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            سال تحصیلی جدید
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.5 }}
            className="mt-4 font-display text-[34px] leading-[1.3] text-white sm:text-[42px]"
          >
            کلاس از همین‌جا
            <br />
            <span className="bg-gradient-to-l from-amber-200 via-amber-300 to-amber-400 bg-clip-text text-transparent">
              شروع می‌شود
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mt-3 max-w-sm text-[13.5px] leading-7 text-white/75"
          >
            درس‌ها، برنامهٔ هفتگی، تکالیف و ضبط جلسه‌ها — همه در یک جا، امن و ساده برای دانش‌آموزان.
          </motion.p>
        </div>

        {/* floating cards */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden="true">
          {floats.map((item) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 22, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: item.delay, type: "spring", stiffness: 220, damping: 22 }}
                className={`absolute ${item.className}`}
              >
                <motion.div
                  animate={{ y: [0, -9, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: item.delay }}
                  className={`flex items-center gap-2.5 rounded-2xl border border-white/15 bg-gradient-to-br ${item.tint} px-3.5 py-2.5 backdrop-blur-md`}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white">
                    <Icon size={19} weight="duotone" />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[12px] font-medium text-white">{item.title}</span>
                    <span className="block text-[10px] text-white/65">{item.hint}</span>
                  </span>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        <p className="relative z-10 mt-10 hidden text-[11.5px] text-white/50 lg:block">
          © دبستان مهر — دسترسی فقط برای دانش‌آموزان و کارکنان مجاز
        </p>
      </section>

      {/* form */}
      <main className="flex items-center justify-center px-4 py-8 sm:px-8 lg:order-2">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 26 }}
          className="w-full max-w-[400px]"
        >
          <div className="card p-6 sm:p-7">
            <div className="mb-6 text-center">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <ShieldCheck size={28} weight="duotone" aria-hidden="true" />
              </span>
              <h2 className="font-display text-[24px] text-ink">ورود به کلاس من</h2>
              <p className="mt-1 text-[12.5px] text-ink-muted">با نام کاربری و رمز خود وارد شوید</p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] leading-6 text-red-800"
              >
                {error}
              </motion.div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="username" className="label">
                  نام کاربری
                </label>
                <div className="relative">
                  <User
                    size={18}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted/70"
                    aria-hidden="true"
                  />
                  <input
                    id="username"
                    name="username"
                    autoComplete="username"
                    className="input pr-11"
                    placeholder="نام کاربری خود را وارد کنید"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    dir="ltr"
                    style={{ textAlign: "left" }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="label">
                  رمز عبور
                </label>
                <div className="relative">
                  <LockKey
                    size={18}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted/70"
                    aria-hidden="true"
                  />
                  <input
                    id="password"
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    className="input px-11"
                    placeholder="رمز عبور"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((value) => !value)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-muted transition hover:bg-brand-50"
                    aria-label={show ? "پنهان‌کردن رمز" : "نمایش رمز"}
                  >
                    {show ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="label mb-0">پازل امنیتی</label>
                  {captchaError && <span className="text-[11px] text-danger">{captchaError}</span>}
                </div>
                <PuzzleCaptcha
                  onChange={setCaptcha}
                  refreshSignal={captchaRefresh}
                  errorSignal={captchaErrorSignal}
                />
                <p className="mt-1 text-center text-[10.5px] text-ink-muted">
                  قطعه را بکشید و رها کنید؛ همان لحظه بررسی می‌شود. هر پازل فقط یک شانس دارد.
                </p>
              </div>

              <button type="submit" disabled={busy} className="btn-primary mt-2 w-full py-3">
                {busy ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                ) : (
                  <ArrowLeft size={19} weight="bold" />
                )}
                {busy ? "در حال ورود…" : "ورود به سامانه"}
              </button>
            </form>

            <p className="mt-5 rounded-xl bg-brand-50/70 px-3.5 py-2.5 text-[11.5px] leading-6 text-brand-900/80">
              دانش‌آموزان عزیز، بار اول با <b>کد ملی</b> وارد شوید؛ بعد از آن رمز جدید خودتان را می‌سازید.
            </p>
          </div>

          <p className="mt-4 text-center text-[11.5px] text-ink-muted">
            رمز را فراموش کردید؟ با معلم یا دفتر مدرسه تماس بگیرید.
          </p>

          <CreditFooter className="mt-5" />
        </motion.div>
      </main>
    </div>
  );
}
