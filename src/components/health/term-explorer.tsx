"use client";

import * as React from "react";
import { BookOpen, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { useI18n } from "@/components/providers/i18n-provider";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { GLOSSARY, findGlossaryEntry } from "@/lib/medical/glossary";

/**
 * "What do these words mean?" — the glossary screen.
 *
 * Explanations come from the reviewed glossary, not from a live model call, so
 * the wording a patient reads is the same wording a clinician approved. Terms
 * found in the user's own records are highlighted first.
 */
export function TermExplorer({ termsInRecords }: { termsInRecords: string[] }) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");

  const mine = React.useMemo(() => {
    const found = new Map<string, (typeof GLOSSARY)[number]>();
    for (const term of termsInRecords) {
      const entry = findGlossaryEntry(term);
      if (entry) found.set(entry.term, entry);
    }
    return [...found.values()];
  }, [termsInRecords]);

  const needle = query.trim().toLowerCase();
  const matches = React.useMemo(() => {
    const source = needle ? GLOSSARY : GLOSSARY;
    return source
      .filter((entry) => {
        if (!needle) return true;
        return (
          entry.term.toLowerCase().includes(needle) ||
          entry.aliases.some((alias) => alias.includes(needle)) ||
          t(entry.meaningKey).toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.term.localeCompare(b.term));
  }, [needle, t]);

  return (
    <div className="space-y-5">
      {mine.length > 0 && (
        <section aria-labelledby="my-terms">
          <h2 id="my-terms" className="text-lg font-semibold text-ink-900">
            {t("summary.termsFromYourRecords")}
          </h2>
          <p className="mb-3 text-sm text-muted">{t("summary.termsFromYourRecordsBody")}</p>
          <ul className="flex flex-wrap gap-2">
            {mine.map((entry) => (
              <li key={entry.term}>
                <Badge variant="brand" size="lg">
                  {entry.term}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-5 text-brand-600" aria-hidden="true" />
            {t("summary.termMeanings")}
          </CardTitle>
          <ReadAloudButton text={matches.slice(0, 8).map((entry) => `${entry.term}. ${t(entry.meaningKey)}`).join(" ")} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("summary.searchTerm")}
              aria-label={t("summary.searchTerm")}
              className="pl-10"
              type="search"
            />
          </div>

          {matches.length === 0 ? (
            <Alert variant="neutral">
              <p className="text-sm">{t("common.noResults")}</p>
            </Alert>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              {matches.map((entry) => (
                <div key={entry.term} className="rounded-2xl border border-ink-200 p-3.5">
                  <dt className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
                    {entry.term}
                    {entry.alsoCalled?.length ? (
                      <span className="text-xs font-normal text-muted">({entry.alsoCalled.join(", ")})</span>
                    ) : null}
                  </dt>
                  <dd className="mt-1 text-base leading-relaxed text-ink-700">{t(entry.meaningKey)}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Alert variant="watch">
        <p className="text-sm leading-relaxed">{t("summary.disclaimer")}</p>
      </Alert>
    </div>
  );
}
