"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV_ITEMS } from "./nav-items";
import { NAV_ICONS } from "./nav-icons";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom navigation: Home · Upload · Trends · Medicines · Assistant.
 *
 * Five targets, each at least 44 px tall, with the label always visible —
 * icons alone are unusable for the audience this app is built for.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("nav.primary")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-7xl">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[var(--a11y-tap)] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.7rem] font-medium",
                  active ? "text-brand-700" : "text-ink-600",
                )}
              >
                {Icon ? (
                  <Icon className={cn("size-6", active ? "text-brand-600" : "text-ink-500")} aria-hidden="true" />
                ) : null}
                <span className="text-center leading-tight">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
