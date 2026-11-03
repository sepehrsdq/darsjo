"use client";

import { motion, useMotionValue, useMotionValueEvent } from "framer-motion";
import {
  ArrowsHorizontal,
  ArrowCounterClockwise,
  CheckCircle,
  CircleNotch,
  CursorClick,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiGet, apiPost } from "@/lib/api";

export interface CaptchaSolution {
  token: string;
  x: number | null;
}

interface Challenge {
  token: string;
  background: string;
  piece: string;
  width: number;
  height: number;
  pieceWidth: number;
  pieceHeight: number;
  pieceTop: number;
  expiresIn: number;
}

type Status = "idle" | "checking" | "ok" | "error";

export function PuzzleCaptcha({
  onChange,
  refreshSignal = 0,
  errorSignal = 0,
}: {
  onChange: (solution: CaptchaSolution | null) => void;
  refreshSignal?: number;
  errorSignal?: number;
}) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [position, setPosition] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [shaking, setShaking] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const checkTimer = useRef<number | null>(null);
  const generation = useRef(0);
  useMotionValueEvent(x, "change", (value) => setPosition(value));

  const clearCheck = useCallback(() => {
    if (checkTimer.current !== null) {
      window.clearTimeout(checkTimer.current);
      checkTimer.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    generation.current += 1;
    clearCheck();
    setLoading(true);
    setFailed(null);
    setChallenge(null);
    setStatus("idle");
    x.set(0);
    onChange(null);
    try {
      const payload = await apiGet<Challenge>("/auth/captcha");
      setChallenge(payload);
      onChange({ token: payload.token, x: null });
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "دریافت پازل ممکن نشد.");
    } finally {
      setLoading(false);
    }
  }, [clearCheck, onChange, x]);

  useEffect(() => {
    load();
    // reload only when the parent explicitly asks for a fresh challenge
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    if (!errorSignal) return;
    setShaking(true);
    const timer = window.setTimeout(() => setShaking(false), 520);
    return () => window.clearTimeout(timer);
  }, [errorSignal]);

  useEffect(() => {
    const element = trackRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || 0;
      setTrackWidth(width);
    });
    observer.observe(element);
    setTrackWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [challenge]);

  useEffect(() => clearCheck, [clearCheck]);

  const maxOffset = challenge && trackWidth ? trackWidth * (1 - challenge.pieceWidth / challenge.width) : 0;

  /**
   * The visitor lets go, we wait a split second for the piece to settle, then
   * ask the server right away. One chance per puzzle: a wrong position burns
   * the challenge and a brand-new image is fetched automatically.
   */
  function submitPosition(value = x.get()) {
    if (!challenge || status === "ok" || status === "checking" || status === "error") return;
    const imageX = trackWidth ? (value / trackWidth) * challenge.width : 0;
    const rounded = Math.round(imageX * 10) / 10;
    const token = challenge.token;
    const current = ++generation.current;

    clearCheck();
    setStatus("checking");
    checkTimer.current = window.setTimeout(async () => {
      try {
        await apiPost("/auth/captcha/verify", { captcha_token: token, captcha_x: rounded });
        if (generation.current !== current) return;
        setStatus("ok");
        onChange({ token, x: rounded });
      } catch (error) {
        if (generation.current !== current) return;
        setStatus("error");
        setShaking(true);
        window.setTimeout(() => setShaking(false), 520);
        setFailed(error instanceof Error ? error.message : "جای قطعه درست نبود.");
        onChange(null);
        // Give the visitor a moment to see what happened, then show a new one.
        window.setTimeout(() => {
          if (generation.current === current) load();
        }, 900);
      }
    }, 180);
  }

  function nudge(delta: number) {
    if (status === "ok") return;
    const next = Math.min(Math.max(x.get() + delta, 0), Math.max(maxOffset, 0));
    x.set(next);
  }

  const locked = status === "ok";

  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div
        ref={trackRef}
        dir="ltr"
        className={`relative aspect-[320/168] w-full select-none overflow-hidden rounded-xl border bg-brand-900 shadow-inner transition ${
          status === "ok"
            ? "border-emerald-400 ring-2 ring-emerald-400/40"
            : status === "error"
              ? "border-red-400"
              : "border-brand-200"
        } ${shaking ? "captcha-shake" : ""}`}
      >
        {challenge ? (
          <>
            <img
              src={challenge.background}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <motion.div
              drag={locked ? false : "x"}
              dragMomentum={false}
              dragElastic={0}
              dragConstraints={{ left: 0, right: Math.max(maxOffset, 0) }}
              style={{
                x,
                top: `${(challenge.pieceTop / challenge.height) * 100}%`,
                width: `${(challenge.pieceWidth / challenge.width) * 100}%`,
                height: `${(challenge.pieceHeight / challenge.height) * 100}%`,
              }}
              onDragEnd={() => submitPosition()}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  nudge(-6);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  nudge(6);
                }
              }}
              onKeyUp={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") submitPosition();
              }}
              role="slider"
              data-token={challenge.token}
              tabIndex={locked ? -1 : 0}
              aria-label="قطعهٔ پازل را با موس، انگشت یا کلیدهای جهت جابه‌جا کنید"
              aria-valuemin={0}
              aria-valuemax={Math.round(maxOffset)}
              aria-valuenow={Math.round(position)}
              aria-disabled={locked}
              className={`absolute left-0 z-10 touch-none rounded-md outline-none ring-offset-2 focus-visible:ring-4 focus-visible:ring-white/70 ${
                locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
              }`}
            >
              <img src={challenge.piece} alt="" draggable={false} className="pointer-events-none h-full w-full" />
            </motion.div>

            {status === "checking" && (
              <span className="absolute inset-0 z-20 grid place-items-center bg-black/25 backdrop-blur-[1px]">
                <CircleNotch size={26} className="animate-spin text-white" aria-label="در حال بررسی" />
              </span>
            )}
            {status === "ok" && (
              <span className="absolute inset-0 z-20 grid place-items-center bg-emerald-500/20">
                <CheckCircle size={34} weight="fill" className="text-emerald-200 drop-shadow" aria-label="تأیید شد" />
              </span>
            )}
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/70">
            {loading ? (
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <span className="text-[11.5px]">{failed || "پازل آماده نشد"}</span>
            )}
          </div>
        )}

        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" />
        <span className="pointer-events-none absolute bottom-1.5 right-2 inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-white/85 backdrop-blur">
          {status === "ok" ? (
            <CheckCircle size={12} weight="fill" className="text-emerald-300" />
          ) : status === "error" ? (
            <XCircle size={12} weight="fill" className="text-red-300" />
          ) : status === "checking" ? (
            <CircleNotch size={12} className="animate-spin" />
          ) : (
            <CursorClick size={12} />
          )}
          {status === "ok"
            ? "تأیید شد"
            : status === "error"
              ? "جای قطعه درست نبود"
              : status === "checking"
                ? "در حال بررسی…"
                : "قطعه را روی حفره بکشید"}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2" dir="ltr">
        <input
          type="range"
          min={0}
          max={Math.max(Math.round(maxOffset), 0)}
          step={1}
          value={Math.round(position)}
          disabled={locked || !challenge}
          onChange={(event) => {
            x.set(Number(event.target.value));
          }}
          onPointerUp={() => submitPosition()}
          onKeyUp={() => submitPosition()}
          onBlur={() => submitPosition()}
          className="h-1 w-full cursor-pointer accent-brand-600 disabled:opacity-50"
          aria-label="جابه‌جایی دقیق قطعهٔ پازل"
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-muted">
          <ArrowsHorizontal size={13} aria-hidden="true" />
          کلیدهای ← → هم کار می‌کنند
        </span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10.5px] text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
        >
          <ArrowCounterClockwise size={13} aria-hidden="true" />
          پازل تازه
        </button>
      </div>

      {status === "error" && failed && (
        <p className="mt-1 text-center text-[10.5px] text-danger">{failed}</p>
      )}
      {failed && !challenge && (
        <button type="button" onClick={load} className="mt-1 text-[11px] text-danger underline">
          تلاش دوباره برای دریافت پازل
        </button>
      )}
    </div>
  );
}
