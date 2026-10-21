import Link from "next/link";
import type { Metadata } from "next";
import { Info, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UploadDropzone } from "@/components/upload/upload-dropzone";
import { PageHeader } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { createTranslator } from "@/lib/i18n";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "Upload record" };

/** Upload screen: photo/PDF in, structured record out (mock OCR in this build). */
export default async function UploadPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  const tips = [
    { titleKey: "upload.tip1Title", bodyKey: "upload.tip1Body" },
    { titleKey: "upload.tip2Title", bodyKey: "upload.tip2Body" },
    { titleKey: "upload.tip3Title", bodyKey: "upload.tip3Body" },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("upload.title")}
        description={t("upload.subtitle", { name: profile.name })}
        emoji="📄"
        action={<Badge variant="brand">{t("upload.demoBadge")}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardContent>
            <UploadDropzone />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("upload.tips")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {tips.map((tip) => (
                  <li key={tip.titleKey} className="rounded-2xl border border-ink-200 p-3">
                    <p className="font-medium text-ink-900">{t(tip.titleKey)}</p>
                    <p className="text-sm text-muted">{t(tip.bodyKey)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Alert variant="brand">
            <Info className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">{t("upload.ocrNoticeTitle")}</p>
              <p className="text-sm text-muted">{t("upload.mockNotice")}</p>
            </div>
          </Alert>

          <Alert variant="neutral">
            <Lock className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">{t("upload.privacyTitle")}</p>
              <p className="text-sm text-muted">{t("upload.privacyBody")}</p>
            </div>
          </Alert>

          <Button asChild variant="secondary" className="w-full">
            <Link href="/records">{t("records.title")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
