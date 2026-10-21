"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { NAV_ICONS } from "./nav-icons";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

/** Desktop sidebar navigation. Hidden below lg, where the bottom bar takes over. */
export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-ink-200 bg-surface lg:flex lg:flex-col"
      aria-label={t("nav.primary")}
    >
      <Link href="/dashboard" className="flex items-center gap-3 px-5 py-4">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-2xl bg-brand-600 text-xl text-white">
          ❤
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink-900">{t("common.appName")}</span>
          <span className="block truncate text-xs text-muted">{t("common.tagline")}</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[var(--a11y-tap)] items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors",
                    active ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-ink-50 hover:text-ink-900",
                  )}
                >
                  {Icon ? <Icon className={cn("size-5", active ? "text-brand-600" : "text-ink-500")} aria-hidden="true" /> : null}
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="border-t border-ink-200 px-5 py-3 text-xs leading-relaxed text-muted">
        {t("disclaimer.short")}
      </p>
    </aside>
  );
}
