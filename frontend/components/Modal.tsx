"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Dialogs can overlap (for example the "new session" form hands over to the
// class-link dialog). A plain save/restore would leave the page locked or
// unlocked depending on the order they close, so the scroll lock is counted.
let bodyLocks = 0;
let bodyOverflow = "";

function lockBody() {
  if (bodyLocks === 0) {
    bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyLocks += 1;
}

function unlockBody() {
  bodyLocks = Math.max(0, bodyLocks - 1);
  if (bodyLocks === 0) document.body.style.overflow = bodyOverflow;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  // Keep the latest callback without making it an effect dependency. Otherwise
  // every parent re-render (for example, one keystroke) re-runs the focus
  // effect and steals focus back to the close button.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    // Focus the first real field, never the close button in the header.
    const timer = window.setTimeout(() => {
      const field = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
      );
      (field || panelRef.current)?.focus({ preventScroll: true });
    }, 80);

    lockBody();
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
      unlockBody();
    };
  }, [open]);

  if (!mounted) return null;

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5">
          <motion.button
            type="button"
            aria-label="بستن"
            tabIndex={-1}
            className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={`relative flex max-h-[calc(100dvh-1.5rem)] w-full ${widths[size]} flex-col overflow-hidden rounded-2xl bg-white shadow-lift`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-[14.5px] font-semibold leading-6 text-ink">{title}</h2>
                {description && (
                  <p className="mt-0.5 text-[11.5px] leading-5 text-ink-muted">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-ink-muted transition hover:bg-brand-50 hover:text-ink"
                aria-label="بستن پنجره"
              >
                <X size={17} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-[color:var(--line)] bg-brand-50/40 px-4 py-2.5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
