import type { Metadata } from "next";
import { EmergencyPanel } from "@/components/emergency/emergency-panel";
import { PageHeader } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { createTranslator } from "@/lib/i18n";
import { featureText } from "@/lib/i18n/features";
import { activeMedicineNames, getCard, listContacts } from "@/lib/safety/service";
import { cardHasDetails, shareableItems } from "@/lib/safety/card";
import { computeReadiness } from "@/lib/safety/readiness";
import { getEmergencyNumber, isVerificationProviderConfigured } from "@/lib/safety/emergency-number";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "Emergency help" };

/**
 * Emergency help. Everything here is scoped to the signed-in user's active
 * profile, read on the server. The page is never cached and has no public URL
 * for the full card or the contact list.
 */
export default async function EmergencyPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  const [contacts, card, medicines] = await Promise.all([
    listContacts(user.id, profile.id),
    getCard(user.id, profile.id),
    activeMedicineNames(user.id, profile.id),
  ]);
  const providerConfigured = isVerificationProviderConfigured();
  const readiness = computeReadiness({
    contacts: contacts.map((c) => ({ verificationStatus: c.verificationStatus, consentEmergencyInfo: c.consentEmergencyInfo })),
    cardHasDetails: cardHasDetails(card, medicines),
    verificationProviderConfigured: providerConfigured,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={featureText(lang, "emergency.title")}
        description={featureText(lang, "emergency.subtitle")}
        emoji="🚑"
      />
      <EmergencyPanel
        emergencyNumber={getEmergencyNumber()}
        ownerName={profile.name}
        contacts={contacts}
        card={card}
        medicines={medicines}
        shareItems={shareableItems(card, medicines)}
        readiness={readiness}
        providerConfigured={providerConfigured}
      />
      <p className="text-xs text-muted">{t("disclaimer.short")}</p>
    </div>
  );
}
