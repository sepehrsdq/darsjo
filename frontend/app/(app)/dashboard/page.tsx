"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDots,
  ChalkboardTeacher,
  FilmSlate,
  GraduationCap,
  Plus,
  Sparkle,
  UploadSimple,
  UsersThree,
  VideoCamera,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect } from "react";

import { EmptyState } from "@/components/EmptyState";
import { OfferingCard } from "@/components/OfferingCard";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonGrid, SkeletonRows } from "@/components/Skeleton";
import { StatCard } from "@/components/StatCard";
import { apiGet } from "@/lib/api";
import { formatTime, greeting, num, todayWeekday } from "@/lib/format";
import type { AdminStats, Offering, Profile } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

function HeroCard({
  name,
  role,
  className,
  runningCount,
}: {
  name: string;
  role: string;
  className?: string | null;
  runningCount: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="relative overflow-hidden rounded-xl3 bg-gradient-to-l from-brand-800 via-brand-700 to-brand-600 px-6 py-7 text-white shadow-lift sm:px-8"
    >
      <div
        className="pointer-events-none absolute -left-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-20 right-10 h-52 w-52 rounded-full bg-amber-300/20 blur-2xl"
        aria-hidden="true"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div>
          <span className="chip mb-3 border border-white/20 bg-white/10 text-white/85">
            <Sparkle size={14} weight="fill" className="text-amber-300" aria-hidden="true" />
            {greeting()}
          </span>
          <h1 className="font-display text-[28px] leading-tight sm:text-[34px]">{name} جان</h1>
          <p className="mt-2 max-w-md text-[13px] leading-7 text-white/80">
            {role === "student"
              ? "امروز چه درس‌هایی داری؟ اگر معلم کلاس را شروع کرده باشد، دکمهٔ «ورود به کلاس» فعال می‌شود."
              : role === "teacher"
                ? "کلاس‌های امروزت را ببین و با یک کلیک اتاق مجازی را باز کن."
                : "یک نگاه کلی به مدرسه: کاربران، کلاس‌های فعال و ضبط‌ها."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {className && (
            <span className="chip bg-white/15 text-white">
              <GraduationCap size={15} aria-hidden="true" />
              {className}
            </span>
          )}
          <span className={`chip ${runningCount ? "bg-emerald-400/20 text-emerald-50" : "bg-white/10 text-white/70"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${runningCount ? "animate-pulse bg-emerald-300" : "bg-white/40"}`} />
            {runningCount ? `${num(runningCount)} کلاس در حال برگزاری` : "کلاس فعالی نیست"}
          </span>
        </div>
      </div>
    </motion.section>
  );
}

function TodayTimeline({ offerings }: { offerings: Offering[] }) {
  const today = todayWeekday();
  const slots = offerings
    .flatMap((offering) =>
      (offering.schedule || [])
        .filter((slot) => slot.weekday === today)
        .map((slot) => ({ slot, offering })),
    )
    .sort((a, b) => a.slot.start_time.localeCompare(b.slot.start_time));

  return (
    <section className="card p-5" aria-labelledby="today-title">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="today-title" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <CalendarDots size={20} className="text-brand-600" aria-hidden="true" />
          برنامهٔ امروز
        </h2>
        <span className="text-[11.5px] text-ink-muted">
          {slots.length ? `${num(slots.length)} کلاس` : "امروز کلاسی نیست"}
        </span>
      </div>

      {slots.length === 0 ? (
        <p className="rounded-xl bg-brand-50/60 px-4 py-5 text-center text-[12.5px] text-ink-muted">
          امروز کلاسی در برنامه نیست. وقت استراحت است!
        </p>
      ) : (
        <ol className="relative space-y-3 border-r-2 border-dashed border-brand-200 pr-4">
          {slots.map(({ slot, offering }) => (
            <li key={`${offering.id}-${slot.id}`} className="relative">
              <span
                className="absolute -right-[22px] top-2 h-3 w-3 rounded-full border-2 border-white"
                style={{ background: offering.subject.color }}
                aria-hidden="true"
              />
              <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-50/50 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{offering.subject.title}</p>
                  <p className="truncate text-[11.5px] text-ink-muted">
                    {offering.classRoom.name} · {offering.teacher.fullName}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] font-medium text-brand-800" dir="ltr">
                  {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { data: profile, loading: profileLoading } = useAsync<Profile>(() => apiGet("/profile"));
  const admin = profile?.role === "admin";
  const { data: stats, loading: statsLoading } = useAsync<AdminStats>(
    () => (admin ? apiGet("/admin/stats") : Promise.resolve(null as unknown as AdminStats)),
    [admin],
  );
  const { data: allOfferings, reload: reloadOfferings } = useAsync<Offering[]>(
    () => apiGet("/offerings"),
    [],
  );

  const offerings = allOfferings || [];
  const running = offerings.filter((offering) => offering.isRunning).length;

  useEffect(() => {
    const timer = window.setInterval(reloadOfferings, 25000);
    return () => window.clearInterval(timer);
  }, [reloadOfferings]);

  return (
    <div className="space-y-6">
      {profileLoading || !profile ? (
        <div className="skeleton h-44 rounded-xl3" aria-hidden="true" />
      ) : (
        <HeroCard
          name={profile.first_name || profile.fullName}
          role={profile.role}
          className={profile.classRoom?.name}
          runningCount={running}
        />
      )}

      {admin ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {statsLoading || !stats ? (
              Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-24 rounded-xl2" />)
            ) : (
              <>
                <StatCard icon={UsersThree} label="دانش‌آموزان" value={num(stats.users.students)} hint={`${num(stats.users.teachers)} معلم`} tone="brand" />
                <StatCard icon={VideoCamera} label="جلسه‌های فعال" value={num(stats.sessions.active)} hint={`امروز ${num(stats.sessions.today)} جلسه`} tone="leaf" />
                <StatCard icon={FilmSlate} label="ضبط‌ها" value={num(stats.recordings.total)} hint={`${num(stats.classes)} کلاس · ${num(stats.offerings)} ارائه`} tone="sky" />
                <StatCard icon={ChalkboardTeacher} label="کاربران" value={num(stats.users.total)} hint={`${num(stats.users.inactive)} غیرفعال`} tone="sun" />
              </>
            )}
          </div>

          <section className="grid gap-4 lg:grid-cols-3">
            <Link href="/admin/import" className="card card-hover flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-sun-700">
                <UploadSimple size={24} weight="duotone" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">افزودن گروهی دانش‌آموزان</span>
                <span className="block text-[11.5px] text-ink-muted">از فایل اکسل، با پیش‌نمایش</span>
              </span>
            </Link>
            <Link href="/admin/users" className="card card-hover flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <Plus size={24} weight="duotone" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">کاربر جدید</span>
                <span className="block text-[11.5px] text-ink-muted">معلم، دانش‌آموز یا مدیر</span>
              </span>
            </Link>
            <Link href="/admin/classes" className="card card-hover flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky/10 text-sky">
                <ChalkboardTeacher size={24} weight="duotone" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">کلاس‌ها و درس‌ها</span>
                <span className="block text-[11.5px] text-ink-muted">ساخت کلاس و افزودن درس</span>
              </span>
            </Link>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">همهٔ ارائه‌های درس</h2>
              <Link href="/admin/classes" className="inline-flex items-center gap-1 text-[12.5px] text-brand-700">
                مدیریت <ArrowLeft size={15} aria-hidden="true" />
              </Link>
            </div>
            {offerings.length === 0 ? (
              <EmptyState
                icon={<ChalkboardTeacher size={30} />}
                title="هنوز ارائه‌ای ساخته نشده"
                description="ابتدا کلاس بسازید و بعد درس و معلم را به آن اضافه کنید."
                action={<Link href="/admin/classes" className="btn-primary">ساخت کلاس</Link>}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {offerings.slice(0, 6).map((offering, index) => (
                  <OfferingCard key={offering.id} offering={offering} role="admin" index={index} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section aria-labelledby="lessons-title">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="lessons-title" className="text-[15px] font-semibold text-ink">
                  {profile?.role === "teacher" ? "درس‌هایی که تدریس می‌کنی" : "درس‌های من"}
                </h2>
                <span className="text-[11.5px] text-ink-muted">{num(offerings.length)} درس</span>
              </div>

              {profileLoading ? (
                <SkeletonGrid count={4} />
              ) : offerings.length === 0 ? (
                <EmptyState
                  icon={<GraduationCap size={30} />}
                  title={profile?.role === "teacher" ? "هنوز درسی به تو سپرده نشده" : "هنوز درسی نداری"}
                  description={
                    profile?.role === "teacher"
                      ? "مدیر مدرسه درس‌ها و کلاس‌ها را به تو اختصاص می‌دهد."
                      : "اگر فکر می‌کنی اشتباهی رخ داده، با معلم یا دفتر مدرسه تماس بگیر."
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {offerings.map((offering, index) => (
                    <OfferingCard key={offering.id} offering={offering} role={profile!.role} index={index} />
                  ))}
                </div>
              )}
            </section>

            <div className="space-y-4">
              {profileLoading ? <SkeletonRows rows={3} /> : <TodayTimeline offerings={offerings} />}
              <section className="card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
                  <Sparkle size={19} className="text-sun-600" aria-hidden="true" />
                  نکتهٔ امروز
                </h2>
                <p className="text-[12.5px] leading-7 text-ink-muted">
                  {profile?.role === "teacher"
                    ? "قبل از شروع، داخل صفحهٔ درس یک جلسه با شماره و عنوان بساز. ضبط را خودت داخل کلاس شروع می‌کنی؛ هر جلسه فقط یک ضبط دارد."
                    : "گوشی یا تبلت را در حالت افقی بگیر و از هدفون استفاده کن تا صدای کلاس واضح‌تر باشد."}
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
