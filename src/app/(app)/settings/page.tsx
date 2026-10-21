import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { PageHeader } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { prisma } from "@/lib/database/client";
import { createTranslator } from "@/lib/i18n";
import { abdmMode, abhaLinkStatus } from "@/lib/fhir/abha";
import { getVoicePublicConfig } from "@/lib/voice/config";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "Profile & settings" };

/** Profile & settings: language, accessibility, notifications and privacy. */
export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  const abhaStatus = abhaLinkStatus(
    { abhaNumber: user.abhaNumber, abhaLinked: user.abhaLinked },
    abdmMode(),
  );

  const [records, fileTotals] = await Promise.all([
    prisma.healthRecord.count({ where: { profile: { userId: user.id } } }),
    prisma.healthRecord.aggregate({
      where: { profile: { userId: user.id } },
      _sum: { fileSize: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} emoji="⚙️" />

      <SettingsPanel
        user={{
          name: user.name,
          email: user.email,
          abhaNumber: user.abhaNumber,
          isDemo: user.isDemo,
          createdAt: user.createdAt.toISOString(),
        }}
        abhaStatus={abhaStatus}
        storage={{ records, bytes: fileTotals._sum.fileSize ?? 0 }}
        activeProfileName={profile.name}
        voice={getVoicePublicConfig()}
      />
    </div>
  );
}
