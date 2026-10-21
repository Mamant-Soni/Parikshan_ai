"use client";

import * as React from "react";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import { useFeatureText } from "@/lib/i18n/use-feature-text";
import { cn } from "@/lib/utils";

/**
 * "Emergency Help — Call 112".
 *
 * Nothing is dialled automatically. The first tap opens a confirmation dialog;
 * only the second, explicit tap follows a `tel:` link, which asks the phone's
 * own dialer to start. The website cannot tell whether a call was placed, so
 * the success message says only that the dialer was opened.
 */
export function EmergencyCallButton({
  number,
  variant = "primary",
  size = "default",
  className,
  label,
  compact = false,
}: {
  number: string;
  variant?: "primary" | "danger";
  size?: "default" | "sm" | "lg";
  className?: string;
  label?: string;
  /** Header use: full text from `sm` up, icon-only (still named) on small screens. */
  compact?: boolean;
}) {
  const ft = useFeatureText();
  const [open, setOpen] = React.useState(false);
  const telHref = `tel:${number}`;

  return (
    <>
      <Button
        type="button"
        variant={variant === "danger" ? "danger" : "primary"}
        size={size}
        className={cn("bg-alert-600 text-white hover:bg-alert-700", compact && "shrink-0", className)}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Phone className="size-4" aria-hidden="true" />
        {label ?? (compact ? <span className="sr-only sm:not-sr-only">{ft("emergency.buttonLabel")}</span> : ft("emergency.buttonLabel"))}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ft("emergency.callTitle")}</DialogTitle>
            <DialogDescription>{ft("emergency.callBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">{ft("emergency.callCancel")}</Button>
            </DialogClose>
            <Button
              asChild
              className="bg-alert-600 text-white hover:bg-alert-700"
              onClick={() => {
                setOpen(false);
                toast.info(ft("emergency.callOpened"));
              }}
            >
              <a href={telHref}>
                <Phone className="size-4" aria-hidden="true" />
                {ft("emergency.callConfirm")}
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
