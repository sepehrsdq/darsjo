"use client";

import { motion } from "framer-motion";
import { Clock, FilmSlate, Users } from "@phosphor-icons/react";
import Link from "next/link";

import { formatTime, num, todayWeekday } from "@/lib/format";
import type { Offering, Role } from "@/lib/types";
import { JoinButton } from "./JoinButton";
import { SubjectIcon } from "./SubjectIcon";

function nextSlot(schedule: Offering["schedule"]) {
  if (!schedule?.length) return null;
  const today = todayWeekday();
  const sorted = [...schedule].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  return sorted.find((slot) => slot.weekday === today) || sorted[0];
}

export function OfferingCard({
  offering,
  role,
  index = 0,
}: {
  offering: Offering;
  role: Role;
  index?: number;
}) {
  const slot = nextSlot(offering.schedule);
  const accent = offering.subject.color || "#0D9488";

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: Math.min(index * 0.05, 0.3) }}
      whileHover={{ y: -5 }}
      className="card group relative overflow-hidden p-5"
    >
      <span
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}66)` }}
        aria-hidden="true"
      />

      <div className="flex items-start gap-3.5">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition duration-300 group-hover:rotate-6"
          style={{ background: `${accent}1f`, color: accent }}
        >
          <SubjectIcon name={offering.subject.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-ink">{offering.subject.title}</h3>
            {offering.isRunning && (
              <span className="chip bg-emerald-50 text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                در حال برگزاری
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
            {offering.classRoom.name} · {offering.teacher.fullName}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-muted">
        {slot && (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={15} aria-hidden="true" />
            {slot.weekdayLabel} {formatTime(slot.start_time)}
          </span>
        )}
        {role !== "student" && (
          <span className="inline-flex items-center gap-1.5">
            <Users size={15} aria-hidden="true" />
            {num(offering.studentCount)} دانش‌آموز
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <FilmSlate size={15} aria-hidden="true" />
          {num(offering.recordingCount)} ضبط
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <JoinButton offeringId={offering.id} role={role} isRunning={offering.isRunning} />
        <Link href={`/offerings/${offering.id}`} className="btn-ghost">
          جزئیات
        </Link>
      </div>
    </motion.article>
  );
}
