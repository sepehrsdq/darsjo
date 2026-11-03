"use client";

import {
  ChartBar,
  ChalkboardTeacher,
  CirclesThreePlus,
  House,
  IdentificationCard,
  Question,
  SignOut,
  UploadSimple,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiPost } from "@/lib/api";
import type { Role } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Brand, BrandMark } from "./Brand";
import { CreditFooter } from "./CreditFooter";

interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  roles: Role[];
  short?: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "خانه", icon: House, roles: ["admin", "teacher", "student"] },
  { href: "/admin/users", label: "کاربرها", icon: UsersThree, roles: ["admin"] },
  { href: "/admin/classes", label: "کلاس‌ها و درس‌ها", icon: ChalkboardTeacher, roles: ["admin"] },
  { href: "/admin/import", label: "افزودن گروهی", icon: UploadSimple, roles: ["admin"] },
  { href: "/admin/audit", label: "گزارش فعالیت", icon: ChartBar, roles: ["admin"] },
  { href: "/help", label: "راهنمای تصویری", icon: Question, roles: ["admin", "teacher", "student"] },
  { href: "/profile", label: "پروفایل من", icon: IdentificationCard, roles: ["admin", "teacher", "student"] },
];

export function AppShell({
  user,
  children,
}: {
  user: { fullName: string; role: Role; avatarUrl?: string | null; username: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const items = NAV.filter((item) => item.roles.includes(user.role));

  useEffect(() => {
    setLeaving(false);
  }, [pathname]);

  async function logout() {
    setLeaving(true);
    try {
      await apiPost("/auth/logout");
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-l border-[color:var(--line)] bg-white/85 px-4 py-6 backdrop-blur lg:flex">
        <Brand />
        <nav className="mt-8 flex flex-1 flex-col gap-1.5" aria-label="منوی اصلی">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "nav-link-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={20} weight={active ? "duotone" : "regular"} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 rounded-xl2 border border-[color:var(--line)] bg-brand-50/60 p-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} src={user.avatarUrl} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{user.fullName}</p>
              <p className="text-[11px] text-ink-muted">
                {user.role === "admin" ? "مدیر سامانه" : user.role === "teacher" ? "معلم" : "دانش‌آموز"}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl p-2 text-ink-muted transition hover:bg-white hover:text-danger"
              aria-label="خروج از حساب"
            >
              <SignOut size={19} />
            </button>
          </div>
        </div>

        <div className="mt-3 hidden lg:block">
          <CreditFooter />
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="lg:hidden">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[color:var(--line)] bg-white/90 px-4 py-3 backdrop-blur">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9" />
            <span className="font-display text-base text-brand-900">دبستان مهر</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/profile" aria-label="پروفایل">
              <Avatar name={user.fullName} src={user.avatarUrl} size={36} />
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl p-2 text-ink-muted transition hover:bg-brand-50 hover:text-danger"
              aria-label="خروج"
            >
              <SignOut size={19} />
            </button>
          </div>
        </header>
      </div>

      <div className="relative flex min-h-dvh flex-col">
        {/*
          A plain keyed <main> with a CSS entrance animation. We deliberately do
          not use AnimatePresence here: with the App Router its exit animation
          can leave the new page mounted at opacity 0, which showed up as a
          blank screen until a full reload. CSS "both" always ends at opacity 1.
        */}
        <main
          key={pathname}
          className="page-enter mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-8"
        >
          {children}

          <div className="mt-10 lg:hidden">
            <CreditFooter />
          </div>
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="منوی پایین"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
          {items.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 px-1 py-2.5 text-[11px] transition ${
                    active ? "text-brand-700" : "text-ink-muted"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                      active ? "bg-brand-600 text-white shadow-soft" : ""
                    }`}
                  >
                    <Icon size={20} weight={active ? "duotone" : "regular"} aria-hidden="true" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {leaving && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-white/70 backdrop-blur-sm">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      )}
    </div>
  );
}
