"use client";

import { motion } from "framer-motion";
import {
  Camera,
  ChalkboardTeacher,
  GraduationCap,
  IdentificationBadge,
  Key,
  UserCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonRows } from "@/components/Skeleton";
import { SubjectIcon } from "@/components/SubjectIcon";
import { useToast } from "@/components/Toast";
import { api, apiPatch, apiPost, apiUpload } from "@/lib/api";
import { formatDate, num } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

export default function ProfilePage() {
  const { push } = useToast();
  const { data: profile, loading, setData } = useAsync<Profile>(() => api("/profile"));
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const editable = profile?.editableFields || [];
  const roleLabel = profile?.role === "admin" ? "مدیر سامانه" : profile?.role === "teacher" ? "معلم" : "دانش‌آموز";

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      editable.forEach((field) => {
        if (form[field] !== undefined) payload[field] = form[field];
      });
      const updated = await apiPatch<Profile>("/profile", payload);
      setData(updated);
      push("تغییرات ذخیره شد", "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "ذخیره ناموفق بود", "error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!profile) return;
    if (file.size > 2 * 1024 * 1024) {
      push("حجم تصویر باید کمتر از ۲ مگابایت باشد", "error");
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.append("avatar", file);
      const result = await apiUpload<{ avatarUrl: string }>("/profile/avatar", data);
      setData({ ...profile, avatarUrl: result.avatarUrl });
      push("تصویر پروفایل به‌روزرسانی شد", "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "آپلود تصویر ناموفق بود", "error");
    } finally {
      setUploading(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-36 rounded-xl3" aria-hidden="true" />
        <SkeletonRows rows={4} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="حساب کاربری"
        title="پروفایل من"
        subtitle="اطلاعات حساب، تصویر و درس‌های شما"
        action={
          <Link href="/change-password" className="btn-ghost">
            <Key size={18} aria-hidden="true" />
            تغییر رمز
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
            <div className="flex flex-wrap items-center gap-5">
              <div className="relative">
                <Avatar name={profile.fullName} src={profile.avatarUrl} size={88} className="ring-4 ring-brand-100" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -left-1 grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-white shadow-soft transition hover:bg-brand-700"
                  aria-label="تغییر تصویر پروفایل"
                >
                  {uploading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  ) : (
                    <Camera size={17} />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadAvatar(file);
                    event.target.value = "";
                  }}
                />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink">{profile.fullName}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
                  <span className="chip bg-brand-50 text-brand-800">
                    <IdentificationBadge size={14} aria-hidden="true" />
                    {roleLabel}
                  </span>
                  <span dir="ltr">{profile.username}</span>
                </p>
                {profile.classRoom && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-brand-800">
                    <GraduationCap size={16} aria-hidden="true" />
                    کلاس {profile.classRoom.name}
                  </p>
                )}
              </div>
            </div>
          </motion.section>

          <section className="card p-6">
            <h2 className="mb-4 text-[15px] font-semibold text-ink">اطلاعات شخصی</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="label">نام</span>
                <p className="rounded-xl bg-brand-50/60 px-3.5 py-2.5 text-[13px] text-ink">{profile.first_name || "—"}</p>
              </div>
              <div>
                <span className="label">نام خانوادگی</span>
                <p className="rounded-xl bg-brand-50/60 px-3.5 py-2.5 text-[13px] text-ink">{profile.last_name || "—"}</p>
              </div>
              <div>
                <span className="label">نام کاربری</span>
                <p className="rounded-xl bg-brand-50/60 px-3.5 py-2.5 text-[13px] text-ink" dir="ltr">
                  {profile.username}
                </p>
              </div>
              <div>
                <span className="label">کد ملی</span>
                <p className="rounded-xl bg-brand-50/60 px-3.5 py-2.5 text-[13px] text-ink" dir="ltr">
                  {profile.nationalIdMasked || "—"}
                </p>
              </div>

              {editable.includes("first_name") && (
                <div>
                  <label htmlFor="first_name" className="label">نام (قابل ویرایش)</label>
                  <input
                    id="first_name"
                    className="input"
                    defaultValue={profile.first_name}
                    onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))}
                  />
                </div>
              )}
              {editable.includes("last_name") && (
                <div>
                  <label htmlFor="last_name" className="label">نام خانوادگی (قابل ویرایش)</label>
                  <input
                    id="last_name"
                    className="input"
                    defaultValue={profile.last_name}
                    onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
                  />
                </div>
              )}
              {editable.includes("phone") && (
                <div>
                  <label htmlFor="phone" className="label">شمارهٔ تماس</label>
                  <input
                    id="phone"
                    className="input"
                    dir="ltr"
                    inputMode="tel"
                    placeholder="۰۹۱۲…"
                    defaultValue={profile.phone || ""}
                    onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  />
                </div>
              )}
            </div>

            {profile.role === "student" ? (
              <p className="mt-4 rounded-xl bg-amber-50/70 px-3.5 py-2.5 text-[11.5px] leading-6 text-sun-700">
                نام، کلاس و کد ملی توسط مدرسه ثبت می‌شود و از این صفحه قابل تغییر نیست.
              </p>
            ) : (
              <div className="mt-5 flex justify-end">
                <button type="button" onClick={save} disabled={saving} className="btn-primary">
                  {saving ? "در حال ذخیره…" : "ذخیرهٔ تغییرات"}
                </button>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
              <ChalkboardTeacher size={19} className="text-brand-600" aria-hidden="true" />
              {profile.role === "teacher" ? "درس‌هایی که تدریس می‌کنی" : profile.role === "student" ? "درس‌های من" : "دسترسی"}
            </h2>

            {profile.role === "admin" ? (
              <p className="text-[12.5px] leading-7 text-ink-muted">
                شما به همهٔ کلاس‌ها، کاربران، ضبط‌ها و گزارش‌های مدرسه دسترسی دارید.
              </p>
            ) : profile.offerings.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">درسی ثبت نشده است.</p>
            ) : (
              <ul className="space-y-2">
                {profile.offerings.map((offering) => (
                  <li key={offering.id}>
                    <Link
                      href={`/offerings/${offering.id}`}
                      className="flex items-center gap-3 rounded-xl border border-[color:var(--line)] px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50/50"
                    >
                      <span
                        className="grid h-9 w-9 place-items-center rounded-xl"
                        style={{ background: `${offering.subject.color}1f`, color: offering.subject.color }}
                      >
                        <SubjectIcon name={offering.subject.icon} size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{offering.subject.title}</span>
                        <span className="block truncate text-[11.5px] text-ink-muted">
                          {offering.classRoom.name} · {offering.teacher.fullName}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
              <UserCircle size={19} className="text-brand-600" aria-hidden="true" />
              وضعیت حساب
            </h2>
            <dl className="space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between">
                <dt className="text-ink-muted">تاریخ عضویت</dt>
                <dd className="text-ink">{formatDate(profile.date_joined)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-muted">آخرین ورود</dt>
                <dd className="text-ink">{formatDate(profile.last_login)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-muted">تعداد درس</dt>
                <dd className="text-ink">{num(profile.offerings.length)}</dd>
              </div>
              {profile.ftpUsername && (
                <div className="flex items-center justify-between">
                  <dt className="text-ink-muted">دسترسی به فضای فایل</dt>
                  <dd className="text-ink" dir="ltr">{profile.ftpUsername}</dd>
                </div>
              )}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
