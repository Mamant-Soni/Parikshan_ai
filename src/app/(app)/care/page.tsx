import type { Metadata } from "next";
import { CareCalendar } from "@/components/care/care-calendar";
import { PageHeader } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { listCareTasks } from "@/lib/care/service";
import { featureText } from "@/lib/i18n/features";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "Care calendar" };

/** Preventive-care calendar for the active profile. Tasks come only from the user or their clinician. */
export default async function CarePage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const tasks = await listCareTasks(user.id, profile.id);

  return (
    <div className="space-y-5">
      <PageHeader title={featureText(lang, "care.title")} description={featureText(lang, "care.subtitle")} emoji="🗓️" />
      <CareCalendar tasks={tasks} profileName={profile.name} />
    </div>
  );
}
