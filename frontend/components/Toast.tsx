"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<{ push: (message: string, tone?: ToastTone) => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const icons = {
  success: CheckCircle,
  error: WarningCircle,
  info: Info,
};

const tones = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-brand-200 bg-brand-50 text-brand-900",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const dismiss = (id: number) => setItems((current) => current.filter((item) => item.id !== id));
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col items-start gap-2 sm:inset-x-auto sm:left-6 sm:w-96">
        <AnimatePresence>
          {items.map((item) => {
            const Icon = icons[item.tone];
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className={`pointer-events-auto flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft ${tones[item.tone]}`}
                role="status"
                aria-live="polite"
              >
                <Icon size={20} weight="fill" aria-hidden="true" />
                <span className="flex-1 leading-6">{item.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="rounded-lg p-1 opacity-60 transition hover:opacity-100"
                  aria-label="بستن پیام"
                >
                  <X size={16} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
