import Link from "next/link";
import type { Metadata } from "next";
import { Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractionChecker } from "@/components/interactions/interaction-checker";
import { EmptyState, PageHeader } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { getMedicationsList } from "@/lib/database/queries";
import { createTranslator } from "@/lib/i18n";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "Drug interaction checker" };

/**
 * Interaction checker.
 *
 * Findings come from the seeded demonstration interaction rows (or RxNav when
 * `INTERACTION_PROVIDER=rxnav`). Nothing here advises stopping a medicine — every
 * finding routes the user to a doctor or pharmacist.
 */
export default async function InteractionsPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const medications = await getMedicationsList(profile.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("interactions.title")}
        description={t("interactions.subtitle")}
        emoji="⚠️"
        action={
          <Button asChild variant="secondary">
            <Link href="/medications">
              <Pill aria-hidden="true" />
              {t("nav.medications")}
            </Link>
          </Button>
        }
      />

      {medications.length < 2 ? (
        <EmptyState
          title={t("interactions.noMedicines")}
          description={t("interactions.noMedicinesBody")}
          actionLabel={t("nav.medications")}
          actionHref="/medications"
        />
      ) : (
        <InteractionChecker
          medications={medications.map((medication) => ({
            id: medication.id,
            name: medication.name,
            dosage: medication.dosage,
            status: medication.status,
          }))}
        />
      )}
    </div>
  );
}
