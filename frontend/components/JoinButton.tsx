"use client";

import { ArrowSquareOut, CalendarDots, ChalkboardTeacher, Hourglass, PlayCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import { apiPost } from "@/lib/api";
import { useToast } from "./Toast";

export function JoinButton({
  offeringId,
  role,
  isRunning,
  compact = false,
}: {
  offeringId: number;
  role: "admin" | "teacher" | "student";
  isRunning?: boolean;
  compact?: boolean;
}) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  if (role === "admin") {
    return (
      <span
        className={`chip border border-[color:var(--line)] bg-brand-50 text-ink-muted ${compact ? "w-full justify-center" : ""}`}
        title="کلاس را فقط معلم همان درس شروع می‌کند"
      >
        <ChalkboardTeacher size={15} aria-hidden="true" />
        شروع کلاس با معلم درس
      </span>
    );
  }

  const canEnter = role === "student" ? Boolean(isRunning) : true;

  async function enter() {
    if (busy) return;
    setBusy(true);
    try {
      const endpoint = role === "student" ? "join" : "start";
      const result = await apiPost<{ joinUrl: string }>(`/offerings/${offeringId}/${endpoint}`);
      window.location.assign(result.joinUrl);
    } catch (error) {
      push(error instanceof Error ? error.message : "ورود به کلاس ممکن نشد", "error");
    } finally {
      setBusy(false);
    }
  }

  // Teachers must first pick/create a numbered session on the lesson page; the
  // dashboard cannot guess which session they mean.
  if (role === "teacher" && !isRunning) {
    return (
      <Link
        href={`/offerings/${offeringId}`}
        className={`btn-sun ${compact ? "w-full" : ""}`}
      >
        <CalendarDots size={18} aria-hidden="true" />
        جلسه‌ها و شروع کلاس
      </Link>
    );
  }

  if (!canEnter) {
    return (
      <button
        type="button"
        disabled
        className={`btn-ghost cursor-not-allowed opacity-70 ${compact ? "w-full" : ""}`}
        title="معلم هنوز کلاس را شروع نکرده است"
      >
        <Hourglass size={18} />
        منتظر شروع معلم
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={enter}
      disabled={busy}
      className={`${role === "student" ? "btn-primary" : "btn-sun"} ${compact ? "w-full" : ""}`}
    >
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
      ) : role === "student" ? (
        <PlayCircle size={19} weight="fill" />
      ) : (
        <ArrowSquareOut size={18} />
      )}
      {role === "student" ? (busy ? "در حال ورود…" : "ورود به کلاس") : busy ? "در حال باز کردن…" : "شروع کلاس"}
    </button>
  );
}
