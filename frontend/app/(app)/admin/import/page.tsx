"use client";

import { motion } from "framer-motion";
import {
  CheckCircle,
  DownloadSimple,
  FileXls,
  PencilSimple,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { apiUpload } from "@/lib/api";
import { num, toPersianDigits } from "@/lib/format";
import type { ImportPreview, ImportRow } from "@/lib/types";

const steps = [
  {
    icon: DownloadSimple,
    title: "فایل نمونه را بگیرید",
    text: "یک فایل اکسل آماده با ستون‌های درست دانلود کنید.",
    tone: "bg-amber-50 text-sun-700",
  },
  {
    icon: PencilSimple,
    title: "ردیف‌ها را پر کنید",
    text: "نام، نام خانوادگی، نام کاربری، کد ملی و کلاس هر دانش‌آموز.",
    tone: "bg-brand-50 text-brand-700",
  },
  {
    icon: CheckCircle,
    title: "پیش‌نمایش و ثبت",
    text: "اول همهٔ ردیف‌ها بررسی می‌شوند؛ بعد با یک کلیک ثبت می‌شوند.",
    tone: "bg-emerald-50 text-emerald-700",
  },
];

const actionLabels: Record<ImportRow["action"], string> = {
  create: "ایجاد",
  update: "به‌روزرسانی",
  error: "خطا",
};

const actionTones: Record<ImportRow["action"], string> = {
  create: "bg-emerald-50 text-emerald-700",
  update: "bg-sky/10 text-sky",
  error: "bg-red-50 text-red-700",
};

export default function ImportPage() {
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);

  async function runPreview(selected: File) {
    setBusy("preview");
    setDone(null);
    try {
      const form = new FormData();
      form.append("file", selected);
      const result = await apiUpload<ImportPreview>("/import/students/preview", form);
      setPreview(result);
      push(`پیش‌نمایش آماده است: ${num(result.summary.total)} ردیف`, "info");
    } catch (error) {
      push(error instanceof Error ? error.message : "خواندن فایل ناموفق بود", "error");
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy("commit");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await apiUpload<{ applied: { created: number; updated: number } }>("/import/students/commit", form);
      setDone(result.applied);
      setPreview(null);
      push(`ثبت انجام شد: ${num(result.applied.created)} جدید، ${num(result.applied.updated)} به‌روزرسانی`, "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "ثبت نهایی ناموفق بود", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="مدیریت"
        title="افزودن گروهی دانش‌آموزان"
        subtitle="به‌جای ساختن تک‌تک، فهرست کلاس را از فایل اکسل وارد کنید؛ قبل از ثبت، همهٔ ردیف‌ها بررسی می‌شوند"
        action={
          <a href="/api/import/students/template" className="btn-ghost">
            <DownloadSimple size={18} aria-hidden="true" />
            دانلود فایل نمونه
          </a>
        }
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="مراحل افزودن گروهی">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + index * 0.08, type: "spring", stiffness: 240, damping: 24 }}
              className="card relative overflow-hidden p-4"
            >
              <span className="absolute left-3 top-3 font-display text-2xl text-brand-100">
                {toPersianDigits(index + 1)}
              </span>
              <span className={`grid h-10 w-10 place-items-center rounded-2xl ${step.tone}`}>
                <Icon size={21} weight="duotone" aria-hidden="true" />
              </span>
              <p className="mt-2.5 text-[13px] font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-[11.5px] leading-6 text-ink-muted">{step.text}</p>
            </motion.div>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <div
            className="card flex flex-col items-center justify-center gap-3 border-dashed p-8 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) {
                setFile(dropped);
                runPreview(dropped);
              }
            }}
          >
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-brand-50 text-brand-600">
              <FileXls size={30} weight="duotone" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[14px] font-medium text-ink">
                {file ? file.name : "فایل اکسل را اینجا رها کنید"}
              </p>
              <p className="mt-1 text-[12px] text-ink-muted">
                ستون‌ها: نام، نام خانوادگی، نام کاربری، کد ملی، کلاس
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary" disabled={busy !== null}>
                <UploadSimple size={18} aria-hidden="true" />
                انتخاب فایل
              </button>
              {file && (
                <button type="button" className="btn-ghost" onClick={() => runPreview(file)} disabled={busy !== null}>
                  پیش‌نمایش دوباره
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) {
                  setFile(selected);
                  runPreview(selected);
                }
                event.target.value = "";
              }}
            />
          </div>

          {done && (
            <div className="card border-emerald-200 bg-emerald-50/70 p-5">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-emerald-900">
                <CheckCircle size={20} weight="fill" aria-hidden="true" />
                افزودن گروهی با موفقیت انجام شد
              </p>
              <p className="mt-1 text-[12.5px] text-emerald-800">
                {num(done.created)} دانش‌آموز جدید ساخته شد و {num(done.updated)} ردیف به‌روزرسانی شد.
              </p>
            </div>
          )}

          {preview && (
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] bg-brand-50/50 px-4 py-3">
                <span className="chip bg-white text-ink-soft">کل: {num(preview.summary.total)}</span>
                <span className="chip bg-emerald-50 text-emerald-700">جدید: {num(preview.summary.create)}</span>
                <span className="chip bg-sky/10 text-sky">به‌روزرسانی: {num(preview.summary.update)}</span>
                <span className={`chip ${preview.summary.error ? "bg-red-50 text-red-700" : "bg-white text-ink-muted"}`}>
                  خطا: {num(preview.summary.error)}
                </span>
                <button
                  type="button"
                  onClick={commit}
                  disabled={preview.summary.error > 0 || busy !== null}
                  className="btn-primary ms-auto px-4 py-2 text-[12.5px]"
                >
                  {busy === "commit" ? "در حال ثبت…" : "ثبت نهایی"}
                </button>
              </div>

              <div className="max-h-[26rem] overflow-auto">
                <table className="w-full border-collapse text-right text-[12.5px]">
                  <thead className="sticky top-0 bg-white/95 text-[11.5px] text-ink-muted backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 font-medium">ردیف</th>
                      <th className="px-3 py-2 font-medium">نام</th>
                      <th className="px-3 py-2 font-medium">نام کاربری</th>
                      <th className="px-3 py-2 font-medium">کد ملی</th>
                      <th className="px-3 py-2 font-medium">کلاس</th>
                      <th className="px-3 py-2 font-medium">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--line)]">
                    {preview.rows.map((row) => (
                      <tr key={row.row} className={row.action === "error" ? "bg-red-50/40" : ""}>
                        <td className="px-3 py-2 text-ink-muted">{num(row.row)}</td>
                        <td className="px-3 py-2 text-ink">{row.first_name} {row.last_name}</td>
                        <td className="px-3 py-2 text-ink-muted" dir="ltr">{row.username}</td>
                        <td className="px-3 py-2 text-ink-muted" dir="ltr">{row.national_id_masked}</td>
                        <td className="px-3 py-2 text-ink-muted">{row.class_name}</td>
                        <td className="px-3 py-2">
                          <span className={`chip ${actionTones[row.action]}`}>{actionLabels[row.action]}</span>
                          {row.errors.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {row.errors.map((message) => (
                                <li key={message} className="flex items-start gap-1 text-[11px] leading-5 text-red-700">
                                  <WarningCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                                  {message}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="card p-5">
            <h2 className="mb-2 text-[14px] font-semibold text-ink">قبل از افزودن گروهی</h2>
            <ul className="space-y-2 text-[12px] leading-6 text-ink-muted">
              <li>• کد ملی می‌تواند با صفر شروع شود؛ همیشه به‌صورت متن خوانده می‌شود.</li>
              <li>• ارقام فارسی و عربی خودکار به انگلیسی تبدیل می‌شوند.</li>
              <li>• افزودن دوبارهٔ همان فایل، کاربر تکراری نمی‌سازد (به‌روزرسانی می‌کند).</li>
              <li>• کد ملی ۹ رقمی (بدون صفر اول) هم پذیرفته و خودکار کامل می‌شود.</li>
              <li>• اگر دانش‌آموزی در کلاس دیگری باشد، به کلاس جدید منتقل می‌شود.</li>
            </ul>
          </div>
          <div className="card p-5">
            <h2 className="mb-2 text-[14px] font-semibold text-ink">رمز اولیه</h2>
            <p className="text-[12px] leading-6 text-ink-muted">
              رمز اولیهٔ هر دانش‌آموز همان کد ملی است و در اولین ورود، تغییر رمز اجباری خواهد بود.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
