import type { Metadata } from "next";
import { AIChat } from "@/components/health/ai-chat";
import { PageHeader } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { getChatHistory, getTimelineRecords } from "@/lib/database/queries";
import { activeAIProviderName, isMockAI } from "@/lib/ai";
import { getVoicePublicConfig } from "@/lib/voice/config";
import { createTranslator } from "@/lib/i18n";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "AI assistant" };

/**
 * AI assistant ("Ask about your health records").
 *
 * The transcript is persisted per profile, and answers are grounded in stored
 * records only — a question the records cannot answer returns
 * "I couldn't find that information in your uploaded records." instead of a guess.
 */
export default async function AssistantPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const [messages, records] = await Promise.all([
    getChatHistory(profile.id),
    getTimelineRecords(profile.id),
  ]);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);
  const voiceConfig = getVoicePublicConfig();

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("assistant.title")}
        description={t("assistant.subtitle", { name: profile.name })}
        emoji="🤖"
      />

      {/* Remount on profile switch so another person's transcript is never
          carried over in client state. This also stops any active speech. */}
      <AIChat
        key={profile.id}
        initialMessages={messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          sources: message.sources,
          grounded: message.grounded,
          intent: message.intent,
        }))}
        providerName={activeAIProviderName()}
        isMock={isMockAI()}
        recordCount={records.length}
        voiceConfig={voiceConfig}
      />
    </div>
  );
}
