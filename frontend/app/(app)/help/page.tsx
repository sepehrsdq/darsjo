"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChalkboardTeacher,
  CheckCircle,
  CloudArrowDown,
  FilmSlate,
  FolderOpen,
  Key,
  LockKey,
  PlayCircle,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { SkeletonRows } from "@/components/Skeleton";
import { apiGet } from "@/lib/api";
import { num, toPersianDigits } from "@/lib/format";
import type { Role, SessionInfo } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

type SceneKind =
  | "teacher"
  | "student"
  | "import"
  | "class"
  | "record"
  | "password"
  | "backup"
  | "audit"
  | "files";

interface Task {
  title: string;
  hint: string;
  steps: string[];
  scene: SceneKind;
  href?: string;
  cta?: string;
  tone: string;
}

const tasksByRole: Record<Role, Task[]> = {
  admin: [
    {
      title: "ساخت حساب معلم",
      hint: "یک حساب برای کلاس و سامانهٔ فایل",
      steps: [
        "از منو «کاربرها» را باز کنید.",
        "دکمهٔ «کاربر جدید» را بزنید و نقش «معلم» را انتخاب کنید.",
        "نام کاربری و رمز را بسازید؛ همین حساب در سامانهٔ فایل هم ساخته می‌شود.",
      ],
      scene: "teacher",
      href: "/admin/users",
      cta: "رفتن به کاربرها",
      tone: "from-brand-600 to-brand-800",
    },
    {
      title: "افزودن گروهی دانش‌آموزان",
      hint: "از فایل اکسل، بدون ساختن تک‌تک",
      steps: [
        "فایل نمونه را دانلود کنید و ردیف‌ها را پر کنید.",
        "فایل را در صفحهٔ «افزودن گروهی» رها کنید.",
        "پیش‌نمایش را ببینید؛ اگر خطایی نبود «ثبت نهایی» را بزنید.",
      ],
      scene: "import",
      href: "/admin/import",
      cta: "افزودن گروهی",
      tone: "from-amber-500 to-sun-700",
    },
    {
      title: "ساخت کلاس و درس",
      hint: "کلاس، درس و معلم را به هم وصل کنید",
      steps: [
        "در «کلاس‌ها و درس‌ها» یک کلاس بسازید.",
        "داخل کلاس، درس و معلم آن را اضافه کنید.",
        "دانش‌آموزان را به کلاس اضافه کنید؛ درس‌ها خودکار به آن‌ها می‌رسد.",
      ],
      scene: "class",
      href: "/admin/classes",
      cta: "کلاس‌ها و درس‌ها",
      tone: "from-sky to-blue-700",
    },
    {
      title: "دیدن کلاس در حال برگزاری",
      hint: "لینک ثابت هر درس و ورود برای بررسی",
      steps: [
        "در «کلاس‌ها و درس‌ها» درس را پیدا کنید؛ «لینک کلاس» همان لینک ثابت و همیشگی درس است.",
        "وقتی معلم کلاس را شروع کرد، برچسب «در حال برگزاری» و دکمهٔ «ورود به کلاس» ظاهر می‌شود.",
        "با «ورود به کلاس» به‌عنوان بیننده وارد می‌شوید و صدا، تصویر و اشتراک صفحه را بررسی می‌کنید.",
      ],
      scene: "class",
      href: "/admin/classes",
      cta: "کلاس‌ها و درس‌ها",
      tone: "from-emerald-600 to-teal-800",
    },
    {
      title: "پیدا کردن مشکل از گزارش",
      hint: "هر ورود و خطا با شناسهٔ دقیق",
      steps: [
        "در «گزارش فعالیت» فیلتر «فقط خطاها» را بزنید.",
        "روی هر ردیف بزنید تا جزئیات فنی و شناسهٔ درخواست را ببینید.",
        "شناسهٔ درخواست را برای پیگیری نگه دارید.",
      ],
      scene: "audit",
      href: "/admin/audit",
      cta: "گزارش فعالیت",
      tone: "from-grape to-violet-800",
    },
    {
      title: "پشتیبان‌گیری دستی",
      hint: "فعلاً دستی؛ هر وقت لازم شد",
      steps: [
        "وارد «سامانهٔ فایل» شوید و «پشتیبان‌گیری» را باز کنید.",
        "«بکاپ دیتابیس» یا «بکاپ فایل‌ها» را بزنید.",
        "بعد از پایان، نسخه را دانلود کنید و بیرون از سرور نگه دارید.",
      ],
      scene: "backup",
      href: "https://files.example.ir/",
      cta: "سامانهٔ فایل",
      tone: "from-emerald-600 to-teal-800",
    },
  ],
  teacher: [
    {
      title: "لینک ثابت و شروع کلاس",
      hint: "یک لینک برای همهٔ جلسه‌ها؛ شماره فقط برای ضبط",
      steps: [
        "در صفحهٔ درس، «لینک کلاس» را بزنید؛ این لینک ثابت است و یک‌بار برای همیشه در گروه فرستاده می‌شود.",
        "برای هر جلسه فقط شماره و عنوان را می‌زنید؛ شماره برای ضبط و تاریخ همان جلسه است.",
        "«شروع کلاس» را بزنید؛ با پایان جلسه لینک بسته می‌شود و با شروع جلسهٔ بعد دوباره باز می‌شود.",
      ],
      scene: "teacher",
      href: "/dashboard",
      cta: "درس‌های من",
      tone: "from-brand-600 to-brand-800",
    },
    {
      title: "ورود دانش‌آموزان با لینک",
      hint: "بدون حساب؛ فقط نام و نام خانوادگی",
      steps: [
        "لینک ثابت کلاس را در گروه بفرستید.",
        "دانش‌آموز فقط نام خودش را می‌نویسد و وارد می‌شود؛ نیازی به نام کاربری و رمز نیست.",
        "لینک فقط وقتی کلاس در حال برگزاری است باز است؛ با پایان جلسه بسته می‌شود.",
      ],
      scene: "student",
      tone: "from-sky to-blue-700",
    },
    {
      title: "ضبط دستی و پایان جلسه",
      hint: "ضبط خودکار نیست؛ هر جلسه یک ضبط",
      steps: [
        "داخل کلاس، ضبط را خودتان با دکمهٔ ضبط بیگ‌بلو شروع کنید.",
        "برای توقف، همان دکمه را بزنید و هشدار بیگ‌بلو را تأیید کنید؛ دیگر برای آن جلسه ضبط نمی‌شود.",
        "با خروج از اتاق به همین صفحهٔ درس برمی‌گردید؛ ضبط بعد از پردازش کنار همان جلسه می‌نشیند.",
      ],
      scene: "record",
      tone: "from-berry to-pink-700",
    },
    {
      title: "فایل‌های درس",
      hint: "پوشهٔ اختصاصی هر معلم",
      steps: [
        "در صفحهٔ درس، «فایل‌های درس» را بزنید.",
        "فقط خودتان به پوشهٔ اختصاصی‌تان دسترسی دارید.",
        "فایل‌ها را دسته‌بندی کنید تا دانش‌آموزان راحت پیدا کنند.",
      ],
      scene: "files",
      tone: "from-amber-500 to-sun-700",
    },
  ],
  student: [
    {
      title: "اولین ورود با کد ملی",
      hint: "رمز اولیه، کد ملی خودت است",
      steps: [
        "نام کاربری را از معلم بگیر.",
        "رمز اول را همان کد ملی بگذار (با صفر یا بدون صفر، هر دو قبول است).",
        "بعد از ورود، یک رمز جدید و امن برای خودت بساز.",
      ],
      scene: "password",
      tone: "from-amber-500 to-sun-700",
    },
    {
      title: "ورود به کلاس",
      hint: "با لینک ثابت کلاس یا حساب خودت",
      steps: [
        "اگر لینک ثابت کلاس را از معلم گرفتی، همان را باز کن؛ نیازی به نام کاربری نیست.",
        "نام و نام خانوادگی‌ات را بنویس؛ اگر کلاس شروع شده باشد مستقیم وارد می‌شوی.",
        "اگر با حساب خودت وارد شده‌ای، دکمهٔ «ورود به کلاس» در صفحهٔ درس هم فعال است.",
      ],
      scene: "student",
      href: "/dashboard",
      cta: "درس‌های من",
      tone: "from-brand-600 to-brand-800",
    },
    {
      title: "دیدن ضبط درس",
      hint: "اگر جلسه ضبط شده باشد",
      steps: [
        "صفحهٔ درس را باز کن.",
        "در بخش «جلسه‌ها و ضبط‌ها»، جلسه را با شماره و تاریخش پیدا کن.",
        "دکمهٔ «تماشا» را بزن.",
      ],
      scene: "record",
      tone: "from-berry to-pink-700",
    },
    {
      title: "مراقب حساب خودت باش",
      hint: "رمز را با کسی قسمت نکن",
      steps: [
        "رمزت را فقط خودت بدان.",
        "از کامپیوتر مشترک که خارج شدی، «خروج» را بزن.",
        "اگر رمزت را فراموش کردی، به معلم یا دفتر مدرسه بگو.",
      ],
      scene: "password",
      tone: "from-emerald-600 to-teal-800",
    },
  ],
};

function MiniScene({ kind, tone }: { kind: SceneKind; tone: string }) {
  return (
    <div className={`relative h-28 overflow-hidden rounded-xl bg-gradient-to-br ${tone} p-3 text-white`}>
      <div className="absolute inset-0 opacity-20" aria-hidden="true">
        <div className="absolute -left-6 -top-8 h-24 w-24 rounded-full bg-white" />
        <div className="absolute -bottom-10 right-2 h-28 w-28 rounded-full bg-white" />
      </div>

      {kind === "teacher" && (
        <>
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur"
          >
            <ChalkboardTeacher size={24} weight="duotone" />
          </motion.span>
          <motion.span
            animate={{ x: [0, -26, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-4 right-8 flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] backdrop-blur"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
            کلاس باز است
          </motion.span>
          <motion.span
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.96, 1.04, 0.96] }}
            transition={{ duration: 2.6, repeat: Infinity }}
            className="absolute left-4 top-5 h-10 w-10 rounded-full border border-white/40"
          />
        </>
      )}

      {kind === "student" && (
        <>
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.35, duration: 0.5, repeat: Infinity, repeatDelay: 2.4 }}
              className="absolute right-4 flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] backdrop-blur"
              style={{ top: 14 + index * 26 }}
            >
              <span className="grid h-4 w-4 place-items-center rounded-full bg-white/30">
                <UsersThree size={10} />
              </span>
              <span className="h-1.5 w-10 rounded-full bg-white/50" />
            </motion.span>
          ))}
          <motion.span
            animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            className="absolute bottom-3 left-4 grid h-8 w-8 place-items-center rounded-full bg-emerald-300/30"
          >
            <CheckCircle size={18} weight="fill" className="text-emerald-100" />
          </motion.span>
        </>
      )}

      {kind === "import" && (
        <div className="absolute inset-3 rounded-lg bg-white/10 p-2.5 backdrop-blur">
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.35, duration: 0.45, repeat: Infinity, repeatDelay: 2.6 }}
              className="mb-1.5 flex items-center gap-2"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
              <span className="h-1.5 flex-1 rounded-full bg-white/45" />
              <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-300/40">
                <CheckCircle size={10} weight="fill" />
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {kind === "class" && (
        <div className="absolute inset-0 grid grid-cols-3 place-items-center gap-1 p-5">
          {Array.from({ length: 9 }).map((_, index) => (
            <motion.span
              key={index}
              animate={{ opacity: [0.25, 1, 0.25], scale: [0.9, 1, 0.9] }}
              transition={{ duration: 2.8, repeat: Infinity, delay: index * 0.12 }}
              className="h-4 w-4 rounded-lg bg-white/60"
            />
          ))}
        </div>
      )}

      {kind === "record" && (
        <>
          <motion.span
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-full bg-white/20 backdrop-blur"
          >
            <PlayCircle size={26} weight="fill" />
          </motion.span>
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2">
            <span className="h-1 flex-1 rounded-full bg-white/25">
              <motion.span
                animate={{ width: ["10%", "82%", "10%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="block h-1 rounded-full bg-amber-200"
              />
            </span>
            <FilmSlate size={14} className="opacity-80" />
          </div>
        </>
      )}

      {kind === "password" && (
        <>
          <motion.span
            animate={{ rotate: [0, -6, 6, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute right-5 top-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur"
          >
            <LockKey size={24} weight="duotone" />
          </motion.span>
          <motion.span
            animate={{ opacity: [0, 1, 0], y: [6, 0, -6] }}
            transition={{ duration: 2.8, repeat: Infinity }}
            className="absolute bottom-4 left-5 grid h-7 w-7 place-items-center rounded-full bg-emerald-300/40"
          >
            <Key size={15} weight="fill" />
          </motion.span>
        </>
      )}

      {kind === "backup" && (
        <>
          <motion.span
            animate={{ y: [0, 5, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute right-5 top-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur"
          >
            <CloudArrowDown size={26} weight="duotone" />
          </motion.span>
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2.4, repeat: Infinity }}
            className="absolute bottom-4 left-5 grid h-8 w-8 place-items-center rounded-full bg-emerald-300/30"
          >
            <ShieldCheck size={18} weight="fill" />
          </motion.span>
        </>
      )}

      {kind === "audit" && (
        <div className="absolute inset-x-4 bottom-4 flex h-14 items-end gap-1.5">
          {[35, 60, 45, 85, 55, 95, 70].map((height, index) => (
            <motion.span
              key={index}
              initial={{ height: 6 }}
              animate={{ height: `${height}%` }}
              transition={{ delay: index * 0.12, duration: 0.7, repeat: Infinity, repeatDelay: 2.2, repeatType: "reverse" }}
              className={`flex-1 rounded-t-md ${height > 80 ? "bg-amber-200" : "bg-white/45"}`}
            />
          ))}
        </div>
      )}

      {kind === "files" && (
        <>
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute right-5 top-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur"
          >
            <FolderOpen size={26} weight="duotone" />
          </motion.span>
          <motion.span
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 2.4, repeat: Infinity }}
            className="absolute bottom-5 left-5 text-[11px] text-white/80"
          >
            فقط معلم
          </motion.span>
        </>
      )}
    </div>
  );
}

export default function HelpPage() {
  const { data: session, loading } = useAsync<SessionInfo>(() => apiGet("/auth/me"));
  const role: Role = session?.user.role || "student";
  const tasks = tasksByRole[role];

  return (
    <div>
      <PageHeader
        eyebrow="آموزش سریع"
        title="راهنمای تصویری"
        subtitle="کارهای روزمره در چند قدم کوتاه؛ هر کارت یک انیمیشن کوچک دارد تا سریع یاد بگیری"
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 overflow-hidden rounded-xl3 border border-brand-100 bg-gradient-to-l from-brand-800 via-brand-700 to-brand-600 px-5 py-5 text-white shadow-lift"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
            <ShieldCheck size={24} weight="duotone" />
          </span>
          <div>
            <p className="font-display text-lg">
              {role === "admin" ? "مدیر مدرسه" : role === "teacher" ? "معلم" : "دانش‌آموز"} عزیز، خوش آمدی
            </p>
            <p className="mt-0.5 text-[12px] text-white/75">
              {role === "admin"
                ? "اینجا کارهای مدیریتی از ساخت کاربر تا گزارش و پشتیبان‌گیری را قدم‌به‌قدم می‌بینی."
                : role === "teacher"
                  ? "از شروع کلاس تا ضبط و فایل‌های درس، همه‌چیز در چند کلیک."
                  : "از اولین ورود تا تماشای ضبط درس، همه‌چیز ساده و امن."}
            </p>
          </div>
          <span className="ms-auto hidden rounded-full bg-white/10 px-3 py-1 text-[11px] sm:block">
            {num(tasks.length)} کارت آموزشی
          </span>
        </div>
      </motion.div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task, index) => (
            <motion.article
              key={task.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + index * 0.06, type: "spring", stiffness: 240, damping: 25 }}
              whileHover={{ y: -4 }}
              className="card overflow-hidden p-4"
            >
              <MiniScene kind={task.scene} tone={task.tone} />
              <h2 className="mt-3 text-[14px] font-semibold text-ink">{task.title}</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">{task.hint}</p>
              <ol className="mt-3 space-y-2">
                {task.steps.map((step, stepIndex) => (
                  <li key={step} className="flex gap-2 text-[12px] leading-6 text-ink-soft">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-semibold text-brand-700">
                      {toPersianDigits(stepIndex + 1)}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {task.href && task.cta && (
                <Link
                  href={task.href}
                  className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 transition hover:gap-2"
                >
                  {task.cta}
                  <ArrowLeft size={15} aria-hidden="true" />
                </Link>
              )}
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}
