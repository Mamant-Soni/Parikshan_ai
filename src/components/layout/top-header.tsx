"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS } from "./nav-items";
import { NAV_ICONS } from "./nav-icons";
import { LanguageToggle } from "./language-toggle";
import { AccessibilityToggle } from "./accessibility-toggle";
import { ThemeToggle } from "./theme-toggle";
import { EmergencyCallButton } from "@/components/emergency/emergency-call-button";
import { ProfileSwitcher } from "./profile-switcher";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Sticky app header: profile switcher, language, accessibility and (on mobile)
 * a drawer that contains the sections the bottom bar cannot fit.
 */
export function TopHeader({ userName, emergencyNumber }: { userName: string; emergencyNumber: string }) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="app-menu"
          aria-label={menuOpen ? t("common.close") : t("nav.menu")}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>

        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-lg text-white">
            ❤
          </span>
          <span className="sr-only">{t("common.appName")}</span>
        </Link>

        <p className="hidden min-w-0 flex-1 truncate text-sm text-muted lg:block">
          {t("header.greeting", { name: userName })}
        </p>
        <div className="flex-1 lg:hidden" />

        <EmergencyCallButton number={emergencyNumber} compact size="sm" />
        <ProfileSwitcher />
        <LanguageToggle compact />
        <ThemeToggle />
        <AccessibilityToggle />
      </div>

      {menuOpen && (
        <div id="app-menu" className="border-t border-ink-200 bg-surface lg:hidden">
          <nav aria-label={t("nav.primary")} className="mx-auto max-w-7xl px-3 py-3">
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {NAV_ITEMS.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-[var(--a11y-tap)] items-center gap-3 rounded-xl px-3 text-base font-medium",
                        active ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-ink-50",
                      )}
                    >
                      {Icon ? <Icon className="size-5 text-ink-500" aria-hidden="true" /> : null}
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}
