import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex w-full gap-3 rounded-2xl border p-4 text-sm leading-relaxed", {
  variants: {
    variant: {
      info: "border-info-100 bg-info-50 text-ink-800",
      brand: "border-brand-200 bg-brand-50 text-ink-800",
      good: "border-good-100 bg-good-50 text-ink-800",
      watch: "border-watch-100 bg-watch-50 text-ink-800",
      alert: "border-alert-100 bg-alert-50 text-ink-800",
      neutral: "border-ink-200 bg-surface text-ink-700",
    },
  },
  defaultVariants: { variant: "info" },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="status" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("font-semibold text-ink-900", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <div className={cn("text-sm text-ink-700", className)} {...props} />;
}

export { alertVariants };
