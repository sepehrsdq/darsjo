"use client";

import { ArrowsClockwise, Check, Copy, LinkSimple, ShareNetwork, UsersThree } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiGet } from "@/lib/api";
import { formatDateTime, num } from "@/lib/format";
import type { GuestVisit, Offering } from "@/lib/types";

export function GuestLinkDialog({
  offering,
  open,
  onClose,
}: {
  offering: Offering | null;
  open: boolean;
  onClose: () => void;
}) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);
  const [visits, setVisits] = useState<GuestVisit[] | null>(null);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const offeringId = offering?.id;

  useEffect(() => {
    if (!open || !offeringId) return;
    let alive = true;
    setVisits(null);
    setCopied(false);
    setLoadingGuests(true);
    apiGet<{ items: GuestVisit[] }>(`/offerings/${offeringId}/guests`)
      .then((result) => {
        if (alive) setVisits(result.items);
      })
      .catch(() => {
        if (alive) setVisits([]);
      })
      .finally(() => {
        if (alive) setLoadingGuests(false);
      });
    return () => {
      alive = false;
    };
  }, [open, offeringId, reloadKey]);

  if (!offering) return null;

  const link = offering.guestUrl;
  const running = Boolean(offering.isRunning);
  const runningSession = (offering.sessions || []).find((row) => row.status === "running");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Older mobile browsers have no async clipboard; fall back to a hidden field.
      const area = document.createElement("textarea");
      area.value = link;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing else we can do */
      }
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareLink() {
    const text = `لینک ثابت کلاس ${offering!.subject.title} — ${offering!.classRoom.name}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "ورود به کلاس", text, url: link });
        return;
      } catch {
        // The user dismissed the share sheet — copy instead.
      }
    }
    await copyLink();
    push("لینک کپی شد؛ در پیام‌رسان بچسبانید.", "success");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="لینک ثابت کلاس"
      description="یک لینک برای همهٔ جلسه‌ها؛ فقط هنگام برگزاری کلاس باز است."
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">
            بستن
          </button>
          <button type="button" onClick={copyLink} className="btn-primary">
            {copied ? <Check size={17} weight="bold" aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
            {copied ? "کپی شد" : "کپی لینک"}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 ${
            running ? "border-emerald-200 bg-emerald-50/70" : "border-[color:var(--line)] bg-slate-50"
          }`}
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
              <span className="relative flex h-2 w-2">
                {running && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-slate-400"}`}
                />
              </span>
              {running
                ? runningSession
                  ? `جلسهٔ ${runningSession.numberLabel} در حال برگزاری است`
                  : "کلاس در حال برگزاری است"
                : "کلاس بسته است"}
            </p>
            <p className="mt-1 text-[10.5px] leading-5 text-ink-muted">
              {running
                ? "لینک برای دانش‌آموزان باز است؛ هر کس باز کند فقط نامش را می‌نویسد."
                : "با زدن «شروع کلاس» همین لینک خودکار باز می‌شود و با پایان کلاس بسته می‌شود."}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[color:var(--line)] bg-brand-50/40 p-2">
          <div className="flex items-center gap-1.5">
            <LinkSimple size={15} className="ms-1.5 shrink-0 text-brand-700" aria-hidden="true" />
            <input
              readOnly
              dir="ltr"
              value={link}
              aria-label="لینک ثابت کلاس"
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent px-1 py-1 text-[12px] text-ink-soft outline-none"
            />
            <button
              type="button"
              onClick={shareLink}
              className="btn-soft shrink-0 gap-1 px-2.5 py-1.5 text-[11px]"
              title="ارسال لینک"
            >
              <ShareNetwork size={14} aria-hidden="true" />
              ارسال
            </button>
          </div>
        </div>

        <ol className="space-y-1 rounded-xl bg-white px-0 text-[12px] leading-6 text-ink-soft">
          <li className="flex gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-800">
              ۱
            </span>
            این لینک <b className="font-semibold text-ink">ثابت</b> است؛ یک‌بار در گروه کلاس بفرستید.
          </li>
          <li className="flex gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-800">
              ۲
            </span>
            دانش‌آموز فقط نام و نام خانوادگی می‌نویسد و بدون حساب وارد می‌شود.
          </li>
          <li className="flex gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-800">
              ۳
            </span>
            شمارهٔ جلسه را فقط برای ضبط و تاریخ می‌زنید؛ لینک هیچ‌وقت عوض نمی‌شود.
          </li>
        </ol>

        <div className="overflow-hidden rounded-xl border border-[color:var(--line)]">
          <div className="flex items-center justify-between gap-2 bg-brand-50/60 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
              <UsersThree size={16} className="text-brand-700" aria-hidden="true" />
              ورودهای مهمان
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[10.5px] text-brand-800">
                {num(visits?.length || 0)} نفر
              </span>
            </span>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={loadingGuests}
              className="rounded-lg p-1.5 text-ink-muted transition hover:bg-white hover:text-ink disabled:opacity-50"
              aria-label="به‌روزرسانی فهرست مهمان‌ها"
              title="به‌روزرسانی"
            >
              <ArrowsClockwise size={14} className={loadingGuests ? "animate-spin" : ""} />
            </button>
          </div>
          {loadingGuests ? (
            <p className="px-3 py-4 text-center text-[11px] text-ink-muted">در حال دریافت…</p>
          ) : visits && visits.length > 0 ? (
            <ul className="max-h-44 divide-y divide-[color:var(--line)] overflow-y-auto">
              {visits.map((visit, index) => (
                <li key={`${visit.fullName}-${visit.sessionNumber}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-ink">{visit.fullName}</span>
                    <span className="block text-[10px] text-ink-muted">
                      جلسهٔ {visit.sessionNumberLabel}
                      {visit.visits > 1 && <span className="ms-1 text-brand-700">· {num(visit.visits)} بار</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-ink-muted">{formatDateTime(visit.joinedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-center text-[11px] text-ink-muted">
              هنوز کسی با این لینک وارد نشده است.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
