import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createTranslator } from "@/lib/i18n";

/**
 * 404 page.
 *
 * Also the response for a record that belongs to somebody else — the app never
 * reveals whether another account's document exists.
 */
export default function NotFound() {
  const t = createTranslator("en");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <Card className="max-w-xl">
        <CardContent className="space-y-4 text-center">
          <p className="text-4xl" aria-hidden="true">
            🔎
          </p>
          <h1 className="text-2xl font-semibold text-ink-900">{t("error.notFoundTitle")}</h1>
          <p className="text-base leading-relaxed text-ink-600">{t("error.notFoundBody")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/dashboard">{t("nav.dashboard")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">{t("common.backHome")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
