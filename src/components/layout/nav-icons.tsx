import {
  Bot,
  CalendarDays,
  LifeBuoy,
  Clock,
  FolderOpen,
  Home,
  Pill,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";

/** Icon lookup for nav items (kept out of the data file so it stays serialisable). */
export const NAV_ICONS: Record<string, React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>> = {
  home: Home,
  upload: Upload,
  folder: FolderOpen,
  sparkles: Sparkles,
  bot: Bot,
  trending: TrendingUp,
  pill: Pill,
  shield: ShieldAlert,
  clock: Clock,
  users: Users,
  settings: Settings,
  lifebuoy: LifeBuoy,
  calendar: CalendarDays,
};
