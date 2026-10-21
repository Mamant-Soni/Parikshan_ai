import type { TranslationKey } from "@/lib/i18n";

/** Single source of truth for navigation (sidebar, mobile drawer, bottom nav). */
export type NavItem = {
  href: string;
  /** Dictionary key for the label. */
  labelKey: TranslationKey;
  icon: string;
  /** Shown in the mobile bottom bar (max five targets). */
  mobile: boolean;
  /** One-line description used on the dashboard quick links. */
  descriptionKey?: TranslationKey;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "home", mobile: true },
  { href: "/upload", labelKey: "nav.upload", icon: "upload", mobile: true },
  { href: "/records", labelKey: "nav.records", icon: "folder", mobile: false },
  { href: "/summary", labelKey: "nav.summary", icon: "sparkles", mobile: false },
  { href: "/assistant", labelKey: "nav.assistant", icon: "bot", mobile: true },
  { href: "/trends", labelKey: "nav.trends", icon: "trending", mobile: true },
  { href: "/medications", labelKey: "nav.medications", icon: "pill", mobile: true },
  { href: "/interactions", labelKey: "nav.interactions", icon: "shield", mobile: false },
  { href: "/timeline", labelKey: "nav.timeline", icon: "clock", mobile: false },
  { href: "/family", labelKey: "nav.family", icon: "users", mobile: false },
  { href: "/emergency", labelKey: "nav.emergency", icon: "lifebuoy", mobile: false },
  { href: "/care", labelKey: "nav.care", icon: "calendar", mobile: false },
  { href: "/settings", labelKey: "nav.settings", icon: "settings", mobile: false },
];

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.mobile);
