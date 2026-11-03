"use client";

import { motion } from "framer-motion";
import {
  ArrowClockwise,
  ArrowRight,
  CalendarDots,
  Clock,
  FilmSlate,
  FolderOpen,
  Hourglass,
  LinkSimple,
  PlayCircle,
  Plus,
  StopCircle,
  Trash,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { GuestLinkDialog } from "@/components/GuestLinkDialog";
import { Modal } from "@/components/Modal";
import { SessionGuide } from "@/components/SessionGuide";
import { SkeletonRows } from "@/components/Skeleton";
import { SubjectIcon } from "@/components/SubjectIcon";
import { useToast } from "@/components/Toast";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import {
  formatDateTime,
  formatSessionDate,
  formatTime,
  num,
  toEnglishDigits,
  toPersianDigits,
} from "@/lib/format";
import type { Offering, Session, SessionInfo } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

// A recording is processed by BBB after the class ends; keep the session (and
// hide its delete button) for this long so a just-ended class never loses its
// recording by accident.
const RECORDING_GRACE_MS = 2 * 60 * 60 * 1000;

export default function OfferingPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { push } = useToast();

  const { data: sessionInfo } = useAsync<SessionInfo>(() => apiGet("/auth/me"));
  const { data: offering, loading, reload, setData } = useAsync<Offering>(
    () => apiGet(`/offerings/${id}`),
    [id],
  );

  const [sessionModal, setSessionModal] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  // BigBlueButton appends `?reason=...` (often with an English sentence) to the
  // logout URL. Drop it so the address bar stays clean and the browser back
  // button does not take the teacher back into the ended BBB page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (!reason) return;
    window.history.replaceState({}, "", window.location.pathname);
    push("جلسه پایان یافت و به همین درس برگشتید.", "info");
  }, [push]);

  const role = sessionInfo?.user.role || "student";
  const isTeacher = role === "teacher";

  if (loading || !offering) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-32 rounded-xl3" aria-hidden="true" />
        <SkeletonRows rows={4} />
      </div>
    );
  }

  const accent = offering.subject.color;
  const sessions = offering.sessions || [];
  const nextNumber = offering.nextSessionNumber || 1;

  function openCreate() {
    setNewNumber(String(nextNumber));
    setNewTitle("");
    setSessionModal(true);
  }

  async function createSession(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const created = await apiPost<Session>(`/offerings/${offering!.id}/sessions`, {
        number: Number(toEnglishDigits(newNumber)) || undefined,
        title: newTitle.trim(),
      });
      setData((current) =>
        current
          ? {
              ...current,
              sessions: [...(current.sessions || []), created].sort((a, b) => a.number - b.number),
              nextSessionNumber: created.number + 1,
            }
          : current,
      );
      push(`جلسهٔ «${created.label}» ساخته شد`, "success");
      setSessionModal(false);
    } catch (error) {
      push(error instanceof Error ? error.message : "ساخت جلسه ناموفق بود", "error");
    } finally {
      setCreating(false);
    }
  }

  async function startSession(row: Session) {
    const key = `start-${row.id}`;
    if (activeAction) return;
    setActiveAction(key);
    try {
      const result = await apiPost<{ joinUrl: string; recordingAllowed: boolean }>(`/sessions/${row.id}/start`);
      if (!result.recordingAllowed) {
        push("این جلسه قبلاً ضبط شده؛ اتاق بدون امکان ضبط باز می‌شود.", "error");
      }
      window.location.assign(result.joinUrl);
    } catch (error) {
      push(error instanceof Error ? error.message : "شروع جلسه ممکن نشد", "error");
      setActiveAction(null);
    }
  }

  async function joinSession(row: Session) {
    const key = `join-${row.id}`;
    if (activeAction) return;
    setActiveAction(key);
    try {
      const result = await apiPost<{ joinUrl: string }>(`/sessions/${row.id}/join`);
      window.location.assign(result.joinUrl);
    } catch (error) {
      push(error instanceof Error ? error.message : "ورود به کلاس ممکن نشد", "error");
      setActiveAction(null);
    }
  }

  async function endSession(row: Session) {
    const key = `end-${row.id}`;
    if (activeAction) return;
    setActiveAction(key);
    try {
      await apiPost(`/sessions/${row.id}/end`);
      push(`«${row.label}» پایان یافت`, "success");
      reload();
    } catch (error) {
      push(error instanceof Error ? error.message : "پایان جلسه ممکن نشد", "error");
    } finally {
      setActiveAction(null);
    }
  }

  async function refreshRecordings() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await apiPost<{ synced: number }>(`/offerings/${offering!.id}/recordings/refresh`);
      if (result.synced > 0) {
        push(`${num(result.synced)} ضبط تازه اضافه شد`, "success");
      } else {
        push("ضبط تازه‌ای پیدا نشد؛ پردازش ضبط در بیگ‌بلو چند دقیقه طول می‌کشد.", "info");
      }
      reload();
    } catch (error) {
      push(error instanceof Error ? error.message : "به‌روزرسانی ضبط‌ها ممکن نشد", "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function removeSession() {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    try {
      await apiDelete(`/sessions/${confirmDelete.id}`);
      setData((current) =>
        current
          ? { ...current, sessions: (current.sessions || []).filter((item) => item.id !== confirmDelete.id) }
          : current,
      );
      push(`«${confirmDelete.label}» حذف شد`, "success");
      setConfirmDelete(null);
    } catch (error) {
      push(error instanceof Error ? error.message : "حذف جلسه ناموفق بود", "error");
    } finally {
      setDeleting(false);
    }
  }

  const statusTone: Record<Session["status"], string> = {
    planned: "bg-brand-50 text-brand-800",
    running: "bg-emerald-50 text-emerald-700",
    ended: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted transition hover:text-brand-700">
        <ArrowRight size={16} aria-hidden="true" />
        بازگشت به خانه
      </Link>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="card relative overflow-hidden p-6"
      >
        <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: accent }} aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <span
              className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl"
              style={{ background: `${accent}1f`, color: accent }}
            >
              <SubjectIcon name={offering.subject.icon} size={30} />
            </span>
            <div>
              <h1 className="font-display text-[26px] leading-tight text-ink">{offering.subject.title}</h1>
              <p className="mt-1 text-[13px] text-ink-muted">
                {offering.classRoom.name} · {offering.teacher.fullName} · سال {offering.year}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`chip ${offering.isRunning ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-ink-muted"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${offering.isRunning ? "animate-pulse bg-emerald-500" : "bg-ink-muted/40"}`} />
                  {offering.isRunning ? "جلسه‌ای در حال برگزاری" : "کلاس بسته است"}
                </span>
                <span className="chip bg-brand-50 text-brand-800">
                  <CalendarDots size={14} aria-hidden="true" />
                  {num(sessions.length)} جلسه
                </span>
                <span className="chip bg-brand-50 text-brand-800">
                  <FilmSlate size={14} aria-hidden="true" />
                  {num(offering.recordingCount)} ضبط
                </span>
                <span className="chip bg-brand-50 text-brand-800">
                  <UsersThree size={14} aria-hidden="true" />
                  {num(offering.studentCount)} دانش‌آموز
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isTeacher && (
              <button type="button" onClick={openCreate} className="btn-primary">
                <Plus size={18} aria-hidden="true" />
                جلسهٔ جدید
              </button>
            )}
            {role !== "student" && (
              <button type="button" onClick={() => setLinkOpen(true)} className="btn-ghost">
                <LinkSimple size={18} aria-hidden="true" />
                لینک کلاس
              </button>
            )}
            <a
              href={`https://files.example.ir/?path=${encodeURIComponent(offering.filesPath)}`}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              <FolderOpen size={18} aria-hidden="true" />
              فایل‌های درس
            </a>
            {role === "admin" && (
              <p className="basis-full text-[11.5px] leading-6 text-ink-muted">
                مدیر کلاس را شروع نمی‌کند؛ اما لینک ثابت درس را می‌بیند و می‌تواند وارد کلاس در حال برگزاری شود.
              </p>
            )}
          </div>
        </div>
      </motion.section>

      <SessionGuide />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <CalendarDots size={19} className="text-brand-600" aria-hidden="true" />
                جلسه‌ها و ضبط‌ها
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                هر جلسه شماره، تاریخ و ضبط جداگانه دارد
              </p>
              <p className="mt-1 text-[11px] leading-5 text-ink-muted/90">
                ضبط هر جلسه بعد از پردازش بیگ‌بلو (چند دقیقه پس از پایان) خودکار در همین فهرست می‌آید.
              </p>
            </div>
            {role !== "student" && (
              <button
                type="button"
                onClick={refreshRecordings}
                disabled={refreshing}
                className="btn-soft px-3 py-1.5 text-[12px]"
              >
                <ArrowClockwise size={15} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
                {refreshing ? "در حال دریافت…" : "به‌روزرسانی ضبط‌ها"}
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <EmptyState
              icon={<CalendarDots size={28} />}
              title="هنوز جلسه‌ای ساخته نشده"
              description={
                isTeacher
                  ? "اول شماره و عنوان جلسه را بساز؛ بعد اتاق همان جلسه را شروع کن."
                  : "معلم هنوز جلسه‌ای برای این درس نساخته است."
              }
              action={
                isTeacher ? (
                  <button type="button" onClick={openCreate} className="btn-soft">
                    <Plus size={17} aria-hidden="true" />
                    ساخت اولین جلسه
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-3">
              {sessions.map((row) => {
                const running = row.status === "running";
                const ended = row.status === "ended";
                const endedRecently =
                  ended && row.ended_at
                    ? Date.now() - new Date(row.ended_at).getTime() < RECORDING_GRACE_MS
                    : false;
                const recordingPending = endedRecently && row.recordingCount === 0;
                const canDelete =
                  isTeacher &&
                  (row.status === "planned" ||
                    (ended && row.recordingCount === 0 && !endedRecently));
                const canEnter = running && (role === "teacher" ? true : row.isRunning);
                const busyStart = activeAction === `start-${row.id}`;
                const busyJoin = activeAction === `join-${row.id}`;
                const busyEnd = activeAction === `end-${row.id}`;

                return (
                  <li
                    key={row.id}
                    className={`rounded-2xl border p-3.5 transition ${
                      running ? "border-emerald-300 bg-emerald-50/40" : "border-[color:var(--line)] bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[13px] font-bold ${
                            running ? "bg-emerald-600 text-white" : "bg-brand-50 text-brand-800"
                          }`}
                        >
                          {row.numberLabel}
                        </span>
                        <div>
                          <p className="text-[13.5px] font-semibold text-ink">{row.label}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-muted">
                            <span className="inline-flex items-center gap-1">
                              <Clock size={13} aria-hidden="true" />
                              {formatSessionDate(row.date)}
                            </span>
                            <span className={`chip ${statusTone[row.status]}`}>{row.statusLabel}</span>
                            {row.recordingCount > 0 ? (
                              <span className="chip bg-amber-50 text-amber-700">
                                <FilmSlate size={13} aria-hidden="true" />
                                {num(row.recordingCount)} ضبط
                              </span>
                            ) : recordingPending ? (
                              <span
                                className="chip bg-amber-50 text-amber-800"
                                title="بیگ‌بلو در حال پردازش ضبط است؛ معمولاً چند دقیقه طول می‌کشد."
                              >
                                <Hourglass size={13} aria-hidden="true" />
                                ضبط در حال پردازش
                              </span>
                            ) : (
                              <span className="chip bg-slate-100 text-slate-500">بدون ضبط</span>
                            )}
                            {row.guestCount > 0 && (
                              <span className="chip bg-brand-50 text-brand-800">
                                <UsersThree size={13} aria-hidden="true" />
                                {num(row.guestCount)} مهمان
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {isTeacher && !running && !ended && (
                          <button
                            type="button"
                            onClick={() => startSession(row)}
                            disabled={Boolean(activeAction)}
                            className="btn-primary px-3 py-1.5 text-[12px]"
                          >
                            <PlayCircle size={17} weight="fill" aria-hidden="true" />
                            {busyStart ? "در حال باز کردن…" : "شروع کلاس"}
                          </button>
                        )}
                        {isTeacher && running && (
                          <button
                            type="button"
                            onClick={() => joinSession(row)}
                            disabled={Boolean(activeAction)}
                            className="btn-primary px-3 py-1.5 text-[12px]"
                          >
                            <PlayCircle size={17} weight="fill" aria-hidden="true" />
                            {busyJoin ? "در حال ورود…" : "ورود به کلاس"}
                          </button>
                        )}
                        {role === "student" && (
                          <button
                            type="button"
                            onClick={() => joinSession(row)}
                            disabled={!canEnter || Boolean(activeAction)}
                            className="btn-primary px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-60"
                            title={canEnter ? "ورود به جلسهٔ در حال برگزاری" : "معلم هنوز این جلسه را شروع نکرده است"}
                          >
                            <PlayCircle size={17} weight="fill" aria-hidden="true" />
                            {busyJoin ? "در حال ورود…" : canEnter ? "ورود به کلاس" : "منتظر شروع معلم"}
                          </button>
                        )}
                        {role === "admin" && running && (
                          <button
                            type="button"
                            onClick={() => joinSession(row)}
                            disabled={!row.isRunning || Boolean(activeAction)}
                            className="btn-primary px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-60"
                            title={
                              row.isRunning
                                ? "ورود به کلاس برای بررسی"
                                : "اتاق هنوز در بیگ‌بلو باز نشده است"
                            }
                          >
                            <PlayCircle size={17} weight="fill" aria-hidden="true" />
                            {busyJoin ? "در حال ورود…" : "ورود به کلاس"}
                          </button>
                        )}
                        {(isTeacher || role === "admin") && running && (
                          <button
                            type="button"
                            onClick={() => endSession(row)}
                            disabled={Boolean(activeAction)}
                            className="btn-ghost px-3 py-1.5 text-[12px] text-danger hover:bg-red-50"
                          >
                            <StopCircle size={17} aria-hidden="true" />
                            {busyEnd ? "در حال پایان…" : "پایان جلسه"}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(row)}
                            className="btn-ghost px-2 py-1.5 text-[12px] text-danger hover:bg-red-50"
                            aria-label={`حذف ${row.label}`}
                          >
                            <Trash size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>

                    {row.recordings.length > 0 && (
                      <ul className="mt-3 space-y-1.5 border-t border-[color:var(--line)] pt-2.5">
                        {row.recordings.map((recording) => (
                          <li
                            key={recording.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50/50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[12px] text-ink">{recording.name || row.label}</p>
                              <p className="text-[11px] text-ink-muted">
                                {formatDateTime(recording.published_at)} · {recording.duration}
                              </p>
                            </div>
                            <a
                              href={recording.playback_url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-soft px-3 py-1.5 text-[11.5px]"
                            >
                              <PlayCircle size={15} aria-hidden="true" />
                              تماشا
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card h-fit p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <CalendarDots size={19} className="text-brand-600" aria-hidden="true" />
            برنامهٔ هفتگی
          </h2>
          {offering.schedule.length === 0 ? (
            <p className="rounded-xl bg-brand-50/60 px-4 py-4 text-[12.5px] text-ink-muted">هنوز زمانی ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2">
              {offering.schedule.map((slot) => (
                <li key={slot.id} className="flex items-center justify-between rounded-xl border border-[color:var(--line)] px-3.5 py-2.5">
                  <span className="text-[13px] text-ink">{slot.weekdayLabel}</span>
                  <span className="text-[12.5px] text-brand-800" dir="ltr">
                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {role !== "student" && offering.students && (
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <UsersThree size={19} className="text-brand-600" aria-hidden="true" />
            دانش‌آموزان کلاس
          </h2>
          {offering.students.length === 0 ? (
            <EmptyState
              icon={<UsersThree size={28} />}
              title="دانش‌آموزی ثبت نشده"
              description="از «کلاس‌ها و درس‌ها» دانش‌آموز را تک‌نفره یا با فایل اکسل به این کلاس اضافه کنید."
              action={
                <Link href="/admin/classes" className="btn-soft">
                  <UsersThree size={17} aria-hidden="true" />
                  رفتن به کلاس‌ها و درس‌ها
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {offering.students.map((student) => (
                <li key={student.id} className="flex items-center justify-between rounded-xl bg-brand-50/50 px-3.5 py-2.5">
                  <span className="truncate text-[13px] text-ink">{student.fullName}</span>
                  <span className="text-[11.5px] text-ink-muted" dir="ltr">{student.username}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal
        open={sessionModal}
        onClose={() => setSessionModal(false)}
        title="جلسهٔ جدید"
        description="اتاق مجازی و ضبط، مخصوص همین شمارهٔ جلسه ساخته می‌شود."
        size="sm"
      >
        <form onSubmit={createSession} className="space-y-3">
          <div>
            <label className="label" htmlFor="session-number">شمارهٔ جلسه</label>
            <input
              id="session-number"
              className="input text-center"
              inputMode="numeric"
              value={toPersianDigits(newNumber)}
              onChange={(event) =>
                setNewNumber(
                  toEnglishDigits(event.target.value)
                    .replace(/[^\d]/g, "")
                    .slice(0, 3),
                )
              }
              required
            />
            <p className="mt-1 text-[11px] text-ink-muted">شمارهٔ پیشنهادی: {num(nextNumber)}</p>
          </div>
          <div>
            <label className="label" htmlFor="session-title">عنوان جلسه (اختیاری)</label>
            <input
              id="session-title"
              className="input"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="مثلاً حل تمرین فصل دوم"
              maxLength={120}
            />
          </div>
          <button type="submit" disabled={creating} className="btn-primary w-full">
            {creating ? "در حال ساخت…" : "ساخت جلسه"}
          </button>
        </form>
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => (deleting ? null : setConfirmDelete(null))}
        title="حذف جلسه"
        size="sm"
      >
        <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] leading-6 text-red-800">
          جلسهٔ «{confirmDelete?.label}» حذف می‌شود. جلسهٔ دارای ضبط یا در حال برگزاری قابل حذف نیست؛ جلسهٔ تازه‌پایان‌یافته هم تا دو ساعت برای پردازش ضبط نگه داشته می‌شود.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting} className="btn-ghost">
            انصراف
          </button>
          <button type="button" onClick={removeSession} disabled={deleting} className="btn-danger">
            <Trash size={16} /> {deleting ? "در حال حذف…" : "حذف جلسه"}
          </button>
        </div>
      </Modal>

      <GuestLinkDialog offering={offering} open={linkOpen} onClose={() => setLinkOpen(false)} />
    </div>
  );
}
