import Link from "next/link";
import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FamilyManager } from "@/components/family/family-manager";
import { PageHeader } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getProfilesOverview } from "@/lib/database/queries";
import { createTranslator } from "@/lib/i18n";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "Family profiles" };

/**
 * Family profiles.
 *
 * Each person keeps their own records, medicines and summaries; switching
 * profiles is a server round-trip so one person's data can never bleed into
 * another's screen.
 */
export default async function FamilyPage() {
  const user = await requireUser();
  const profiles = await getProfilesOverview(user.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("family.title")}
        description={t("family.subtitle")}
        emoji="👨‍👩‍👧"
        action={
          <Button asChild variant="secondary">
            <Link href="/settings">
              <Settings aria-hidden="true" />
              {t("nav.settings")}
            </Link>
          </Button>
        }
      />

      <Alert variant="brand">
        <p className="text-sm leading-relaxed">{t("family.privacyNote")}</p>
      </Alert>

      <FamilyManager profiles={profiles} />
    </div>
  );
}
