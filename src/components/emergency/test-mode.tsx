"use client";

import * as React from "react";
import { FlaskConical } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useFeatureText } from "@/lib/i18n/use-feature-text";

/**
 * TEST MODE — rehearses the steps of an emergency workflow on screen.
 *
 * This component has NO network calls, NO `tel:`/`sms:`/`wa.me` links and NO
 * server actions. The 112 action is shown disabled. Nothing here can call,
 * message or record an emergency.
 */
export function TestMode() {
  const ft = useFeatureText();
  const [active, setActive] = React.useState(false);
  const [done, setDone] = React.useState(false);

  return (
    <Card id="test-mode" className="border-dashed border-watch-600">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-5 text-watch-700" aria-hidden="true" />
          {ft("test.banner")}
        </CardTitle>
        <CardDescription>{ft("test.body")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!active ? (
          <Button id="test-mode-start" type="button" variant="secondary" onClick={() => { setActive(true); setDone(false); }}>
            {ft("test.start")}
          </Button>
        ) : (
          <div className="space-y-4" role="region" aria-label={ft("test.banner")}>
            <Alert variant="watch">
              <AlertTitle>{ft("test.banner")}</AlertTitle>
              <AlertDescription>{ft("test.body")}</AlertDescription>
            </Alert>
            <ol className="list-decimal space-y-2 pl-5 text-base text-ink-800">
              <li>{ft("test.step1")}</li>
              <li>{ft("test.step2")}</li>
              <li>{ft("test.step3")}</li>
              <li>
                <span className="font-medium">{ft("test.step4")}</span>
                <span className="mt-1 block">
                  <Button type="button" variant="secondary" size="sm" disabled aria-disabled="true">
                    112 — {ft("test.disabledCall")}
                  </Button>
                </span>
              </li>
            </ol>
            {done ? <p role="status" className="font-semibold text-ink-900">{ft("test.result")}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setDone(true)} disabled={done}>{ft("test.finish")}</Button>
              <Button type="button" variant="ghost" onClick={() => { setActive(false); setDone(false); }}>{ft("test.exit")}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
