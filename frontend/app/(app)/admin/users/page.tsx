"use client";

import { Key, MagnifyingGlass, Plus, Power, Trash, UserPlus, Warning } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { formatDate, num } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

const roleLabels: Record<Role, string> = { admin: "مدیر", teacher: "معلم", student: "دانش‌آموز" };
const roleTones: Record<Role, string> = {
  admin: "bg-violet-50 text-grape",
  teacher: "bg-brand-50 text-brand-800",
  student: "bg-amber-50 text-sun-700",
};

const emptyForm = {
  first_name: "",
  last_name: "",
  username: "",
  role: "student" as Role,
  national_id: "",
  phone: "",
  password: "",
};

export default function AdminUsersPage() {
  const { push } = useToast();
  const [role, setRole] = useState<"" | Role>("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (query.trim()) params.set("q", query.trim());
    const suffix = params.toString();
    return `/admin/users${suffix ? `?${suffix}` : ""}`;
  }, [role, query]);

  const { data, loading, reload } = useAsync<{ items: User[]; total: number }>(() => apiGet(path), [path]);
  const items = data?.items || [];

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form };
      if (!payload.national_id) delete (payload as any).national_id;
      if (!payload.password) delete (payload as any).password;
      const created = await apiPost<User & { generatedPassword?: string }>("/admin/users", payload);
      setGenerated(created.generatedPassword || null);
      push("کاربر ساخته شد", "success");
      reload();
      if (!created.generatedPassword) {
        setOpen(false);
        setForm({ ...emptyForm });
      }
    } catch (error) {
      push(error instanceof Error ? error.message : "ساخت کاربر ناموفق بود", "error");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user: User) {
    try {
      const result = await apiPost<{ temporaryPassword: string | null }>(`/admin/users/${user.id}/reset-password`);
      push(
        result.temporaryPassword
          ? `رمز موقت: ${result.temporaryPassword}`
          : "رمز به کد ملی برگشت و تغییر رمز در ورود بعدی اجباری است",
        "success",
      );
      reload();
    } catch (error) {
      push(error instanceof Error ? error.message : "ریست رمز ناموفق بود", "error");
    }
  }

  async function toggleActive(user: User) {
    try {
      await apiPatch(`/admin/users/${user.id}`, { is_active: !user.is_active });
      push(user.is_active ? "کاربر غیرفعال شد" : "کاربر فعال شد", "success");
      reload();
    } catch (error) {
      push(error instanceof Error ? error.message : "تغییر وضعیت ناموفق بود", "error");
    }
  }

  async function deleteUser() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/admin/users/${confirmDelete.id}`);
      push("کاربر برای همیشه حذف شد", "success");
      setConfirmDelete(null);
      reload();
    } catch (error) {
      push(error instanceof Error ? error.message : "حذف کاربر ناموفق بود", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="مدیریت"
        title="کاربران"
        subtitle="معلمان، دانش‌آموزان و مدیران مدرسه"
        action={
          <button type="button" onClick={() => { setOpen(true); setGenerated(null); }} className="btn-primary">
            <UserPlus size={18} aria-hidden="true" />
            کاربر جدید
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <MagnifyingGlass size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted/70" aria-hidden="true" />
          <input
            className="input pr-10"
            placeholder="جست‌وجوی نام یا نام کاربری…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="جست‌وجوی کاربر"
          />
        </div>
        {(["", "student", "teacher", "admin"] as const).map((value) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setRole(value)}
            className={`chip border transition ${
              role === value
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-[color:var(--line)] bg-white text-ink-soft hover:border-brand-300"
            }`}
          >
            {value ? roleLabels[value] : "همه"}
          </button>
        ))}
        <span className="ms-auto text-[12px] text-ink-muted">{num(data?.total || 0)} کاربر</span>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={<UserPlus size={30} />} title="کاربری پیدا نشد" description="فیلتر را تغییر دهید یا کاربر جدید بسازید." />
      ) : (
        <div className="card overflow-hidden">
          {/* One shared column template keeps the header and every row aligned. */}
          <div className="hidden gap-3 border-b border-[color:var(--line)] bg-brand-50/50 px-4 py-2.5 text-[11px] font-medium text-ink-muted md:grid md:grid-cols-[minmax(0,1fr)_80px_112px_210px] md:items-center xl:grid-cols-[minmax(0,1fr)_88px_120px_120px_220px]">
            <span className="text-start">کاربر</span>
            <span className="text-start">نقش</span>
            <span className="hidden text-start xl:block">کد ملی</span>
            <span className="text-start">آخرین ورود</span>
            <span className="text-end">عملیات</span>
          </div>
          <ul className="divide-y divide-[color:var(--line)]">
            {items.map((user) => (
              <li
                key={user.id}
                className="grid gap-2.5 px-4 py-3 transition-colors hover:bg-brand-50/30 md:grid-cols-[minmax(0,1fr)_80px_112px_210px] md:items-center md:gap-3 xl:grid-cols-[minmax(0,1fr)_88px_120px_120px_220px]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={user.fullName} src={user.avatarUrl} size={36} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-[13px] font-medium text-ink">{user.fullName}</p>
                      {!user.is_active && (
                        <span className="shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                          غیرفعال
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-ink-muted" dir="ltr">
                      {user.username}
                    </p>
                  </div>
                </div>

                <span className={`chip w-fit justify-self-start px-2 py-0.5 text-[10.5px] ${roleTones[user.role]}`}>
                  {roleLabels[user.role]}
                </span>

                <span
                  className="hidden text-end text-[11.5px] tabular-nums text-ink-muted xl:block"
                  dir="ltr"
                >
                  {user.nationalIdMasked || "—"}
                </span>

                <span className="text-[11.5px] text-ink-soft">
                  <span className="text-ink-muted md:hidden">آخرین ورود: </span>
                  {formatDate(user.last_login)}
                </span>

                <div className="flex items-center gap-1 md:justify-end">
                  <button
                    type="button"
                    onClick={() => resetPassword(user)}
                    className="btn-ghost gap-1 whitespace-nowrap px-2 py-1.5 text-[11px]"
                    title="ریست رمز"
                  >
                    <Key size={14} aria-hidden="true" />
                    رمز
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(user)}
                    className={`btn-ghost gap-1 whitespace-nowrap px-2 py-1.5 text-[11px] ${
                      user.is_active ? "text-danger hover:bg-red-50" : "text-emerald-700 hover:bg-emerald-50"
                    }`}
                    title={user.is_active ? "غیرفعال کردن حساب" : "فعال کردن حساب"}
                  >
                    <Power size={14} aria-hidden="true" />
                    {user.is_active ? "غیرفعال" : "فعال"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(user)}
                    className="btn-ghost px-2 py-1.5 text-danger hover:bg-red-50"
                    title="حذف قطعی کاربر"
                    aria-label={`حذف ${user.fullName}`}
                  >
                    <Trash size={15} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="کاربر جدید"
        description="معلم و مدیر با همین حساب وارد سامانهٔ فایل هم می‌شوند؛ دانش‌آموز فقط وارد کلاس می‌شود."
      >
        {generated ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] leading-6 text-emerald-900">
              کاربر ساخته شد. رمز موقت (فقط همین یک‌بار نمایش داده می‌شود):
              <span className="mt-2 block rounded-lg bg-white px-3 py-2 font-mono text-[14px]" dir="ltr">
                {generated}
              </span>
            </p>
            <button type="button" onClick={() => { setOpen(false); setGenerated(null); setForm({ ...emptyForm }); }} className="btn-primary w-full">
              متوجه شدم
            </button>
          </div>
        ) : (
          <form onSubmit={createUser} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="first_name">نام</label>
                <input id="first_name" className="input" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="last_name">نام خانوادگی</label>
                <input id="last_name" className="input" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="username">نام کاربری</label>
                <input id="username" className="input" dir="ltr" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="role">نقش</label>
                <select id="role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                  <option value="student">دانش‌آموز</option>
                  <option value="teacher">معلم</option>
                  <option value="admin">مدیر</option>
                </select>
              </div>
            </div>
            {form.role === "student" && (
              <div>
                <label className="label" htmlFor="national_id">کد ملی (۱۰ رقم)</label>
                <input id="national_id" className="input" dir="ltr" inputMode="numeric" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} />
                <p className="mt-1 text-[11px] text-ink-muted">رمز اولیهٔ دانش‌آموز همان کد ملی است.</p>
              </div>
            )}
            <div>
              <label className="label" htmlFor="phone">شمارهٔ تماس (اختیاری)</label>
              <input id="phone" className="input" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            {form.role !== "student" && (
              <div>
                <label className="label" htmlFor="password">رمز عبور (اختیاری)</label>
                <input id="password" className="input" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="خالی بگذارید تا خودکار ساخته شود" />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">انصراف</button>
              <button type="submit" disabled={busy} className="btn-primary">
                <Plus size={17} />
                {busy ? "در حال ساخت…" : "ساخت کاربر"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => {
          if (!deleting) setConfirmDelete(null);
        }}
        title="حذف قطعی کاربر"
        description="حساب از فهرست هر دو سامانه پاک می‌شود."
        size="sm"
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] leading-6 text-red-900">
            <Warning size={20} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              حساب <b>{confirmDelete?.fullName}</b>{" "}
              <span className="text-red-700/90" dir="ltr">({confirmDelete?.username})</span> برای
              همیشه از این سامانه، سامانهٔ فایل و FTP حذف می‌شود و نشست‌های فعالش بسته می‌شود.
              پوشهٔ فایل‌های او در سامانهٔ فایل به آرشیو منتقل می‌شود. اگر این معلم در درسی
              استفاده شده باشد، حذف انجام نمی‌شود و باید اول معلم آن درس را عوض کنید.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
              className="btn-ghost"
            >
              انصراف
            </button>
            <button type="button" onClick={deleteUser} disabled={deleting} className="btn-danger">
              {deleting ? "در حال حذف…" : "حذف قطعی"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
