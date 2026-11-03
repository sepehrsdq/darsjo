"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowsClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartBar,
  CheckCircle,
  Funnel,
  MagnifyingGlass,
  Timer,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonRows } from "@/components/Skeleton";
import { apiGet } from "@/lib/api";
import { formatDateTime, num, toPersianDigits } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

interface AuditItem {
  id: number;
  action: string;
  username: string;
  targetType: string;
  targetId: string;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
  requestId: string;
  level: "info" | "warning" | "error";
  ip: string | null;
  userAgent: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface AuditSummary {
  total: number;
  errors: number;
  warnings: number;
  today: number;
  byAction: { action: string; count: number }[];
}

interface AuditPayload {
  results: AuditItem[];
  count: number;
  next: string | null;
  previous: string | null;
  summary: AuditSummary;
}

const labels: Record<string, string> = {
  "auth.login": "ورود موفق",
  "auth.logout": "خروج",
  "auth.login_failed": "ورود ناموفق",
  "auth.captcha_failed": "پازل ناموفق",
  "auth.password_changed": "تغییر رمز",
  "user.create": "ساخت کاربر",
  "user.update": "ویرایش کاربر",
  "user.delete": "حذف کاربر",
  "user.password_reset": "ریست رمز",
  "import.students": "افزودن گروهی دانش‌آموزان",
  "bbb.start": "شروع کلاس",
  "bbb.join": "ورود به کلاس",
  "bbb.end": "پایان کلاس",
  "profile.update": "ویرایش پروفایل",
  "profile.avatar": "تغییر تصویر",
  "http.request": "درخواست",
  "http.error": "خطای درخواست",
  "server.error": "خطای سرور",
};

const tones: Record<string, string> = {
  auth: "bg-sky/10 text-sky",
  user: "bg-violet-50 text-grape",
  import: "bg-amber-50 text-sun-700",
  bbb: "bg-emerald-50 text-emerald-700",
  profile: "bg-brand-50 text-brand-800",
  http: "bg-slate-100 text-ink-soft",
  server: "bg-red-50 text-red-700",
};

const levelStyles: Record<AuditItem["level"], string> = {
  info: "border-r-brand-300",
  warning: "border-r-amber-400 bg-amber-50/30",
  error: "border-r-red-400 bg-red-50/30",
};

const families = [
  { value: "", label: "همه" },
  { value: "failures", label: "فقط خطاها" },
  { value: "auth", label: "ورود و امنیت" },
  { value: "user", label: "کاربران" },
  { value: "bbb", label: "کلاس مجازی" },
  { value: "import", label: "افزودن گروهی" },
  { value: "http", label: "درخواست‌ها" },
];

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("");
  const [level, setLevel] = useState("");
  const [days, setDays] = useState("7");
  const [auto, setAuto] = useState(true);
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 12000);
    return () => window.clearInterval(timer);
  }, [auto]);

  const path = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    if (family) params.set("action", family);
    if (level) params.set("level", level);
    if (days) params.set("days", days);
    return `/admin/audit?${params.toString()}`;
  }, [page, query, family, level, days]);

  const { data, loading } = useAsync<AuditPayload>(() => apiGet(path), [path, tick]);

  const items = data?.results || [];
  const summary = data?.summary;
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil((data?.count || 0) / pageSize));

  const stats = [
    { label: "کل رویدادها", value: summary?.total ?? 0, tone: "text-brand-800", icon: ChartBar },
    { label: "امروز", value: summary?.today ?? 0, tone: "text-sky", icon: Timer },
    { label: "هشدار", value: summary?.warnings ?? 0, tone: "text-sun-700", icon: WarningCircle },
    { label: "خطا", value: summary?.errors ?? 0, tone: "text-red-700", icon: WarningCircle },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="مدیریت"
        title="گزارش فعالیت"
        subtitle="ردپای کامل ورودها، تغییرات، کلاس‌ها و خطاها — برای پیدا کردن دقیق مشکل"
        action={
          <button type="button" onClick={() => setTick((value) => value + 1)} className="btn-ghost">
            <ArrowsClockwise size={17} aria-hidden="true" />
            به‌روزرسانی
          </button>
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-[11.5px] leading-6 text-amber-900">
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          برای سبک ماندن سامانه، رویدادهای قدیمی‌تر از <b>۷ روز</b> هر شب به‌صورت خودکار پاک
          می‌شوند. اگر به رویدادی نیاز دارید، همان روز آن را ببینید یا خروجی بگیرید.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="card flex items-center gap-3 px-4 py-3">
              <span className={`grid h-10 w-10 place-items-center rounded-xl bg-brand-50/80 ${item.tone}`}>
                <Icon size={21} weight="duotone" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11.5px] text-ink-muted">{item.label}</p>
                <p className={`text-xl font-semibold ${item.tone}`}>{num(item.value)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <MagnifyingGlass size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted/70" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              className="input pr-10"
              placeholder="جست‌وجو در نام کاربر، مسیر، رویداد یا شناسهٔ درخواست…"
              aria-label="جست‌وجو در گزارش"
            />
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
            <Funnel size={15} aria-hidden="true" />
            <select
              value={family}
              onChange={(event) => {
                setFamily(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-2 text-[12px] text-ink"
              aria-label="دستهٔ رویداد"
            >
              {families.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <select
            value={level}
            onChange={(event) => {
              setLevel(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-2 text-[12px] text-ink"
            aria-label="سطح"
          >
            <option value="">همهٔ سطح‌ها</option>
            <option value="error">خطا</option>
            <option value="warning">هشدار</option>
            <option value="info">عادی</option>
          </select>

          <select
            value={days}
            onChange={(event) => {
              setDays(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-2 text-[12px] text-ink"
            aria-label="بازهٔ زمانی"
          >
            <option value="1">۲۴ ساعت گذشته</option>
            <option value="7">۷ روز گذشته</option>
          </select>

          <label className="inline-flex items-center gap-2 rounded-lg bg-brand-50/70 px-2.5 py-2 text-[11.5px] text-ink-soft">
            <input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} className="accent-brand-600" />
            به‌روزرسانی خودکار
          </label>
        </div>

        {summary?.byAction?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.byAction.slice(0, 8).map((item) => (
              <span key={item.action} className="chip bg-brand-50 text-brand-800">
                {labels[item.action] || item.action}: {num(item.count)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ChartBar size={30} />}
          title="رویدادی با این فیلتر پیدا نشد"
          description="فیلترها را ساده‌تر کنید یا بازهٔ زمانی را بیشتر کنید. فعالیت‌های مهم خودکار اینجا ثبت می‌شوند."
        />
      ) : (
        <>
          <div className="space-y-1.5">
            {items.map((item) => {
              const familyName = item.action.split(".")[0];
              const open = openId === item.id;
              return (
                <motion.article
                  key={item.id}
                  layout
                  className={`card overflow-hidden border-r-4 px-4 py-3 ${levelStyles[item.level]}`}
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className={`chip ${tones[familyName] || "bg-brand-50 text-brand-800"}`}>
                      {item.level === "error" ? (
                        <WarningCircle size={13} weight="fill" />
                      ) : item.level === "warning" ? (
                        <WarningCircle size={13} />
                      ) : (
                        <CheckCircle size={13} />
                      )}
                      {labels[item.action] || item.action}
                    </span>
                    <span className="text-[12.5px] font-medium text-ink">{item.username || "مهمان"}</span>
                    {item.statusCode != null && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-mono text-[10.5px] ${
                          item.statusCode >= 500
                            ? "bg-red-100 text-red-700"
                            : item.statusCode >= 400
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                        dir="ltr"
                      >
                        {toPersianDigits(item.statusCode)}
                      </span>
                    )}
                    <span className="ms-auto text-[11px] text-ink-muted">{formatDateTime(item.createdAt)}</span>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : item.id)}
                      className="rounded-lg p-1 text-ink-muted transition hover:bg-brand-50 hover:text-brand-700"
                      aria-label={open ? "بستن جزئیات" : "نمایش جزئیات"}
                      aria-expanded={open}
                    >
                      <CaretDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-ink-muted">
                    {item.durationMs != null && (
                      <span>
                        مدت: {toPersianDigits(item.durationMs)} میلی‌ثانیه
                      </span>
                    )}
                    {item.targetType && <span>هدف: {item.targetType}</span>}
                  </div>

                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 rounded-xl bg-slate-50 p-3">
                          <p className="mb-1 text-[11px] font-medium text-ink-soft">جزئیات فنی</p>
                          <pre dir="ltr" className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2.5 text-left font-mono text-[10.5px] leading-5 text-ink-soft">
                            {JSON.stringify(
                              {
                                method: item.method || null,
                                path: item.path || null,
                                statusCode: item.statusCode,
                                durationMs: item.durationMs,
                                ip: item.ip || null,
                                requestId: item.requestId || null,
                                targetId: item.targetId || null,
                                userAgent: item.userAgent || null,
                                meta: item.meta,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px] text-ink-muted">
              {num(data?.count || 0)} رویداد · صفحهٔ {num(page)} از {num(pages)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost px-3 py-1.5"
                disabled={!data?.previous}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <CaretRight size={16} /> قبلی
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5"
                disabled={!data?.next}
                onClick={() => setPage((value) => value + 1)}
              >
                بعدی <CaretLeft size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
