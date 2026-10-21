import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
  {
    variants: {
      variant: {
        neutral: "border-ink-200 bg-ink-50 text-ink-700",
        brand: "border-brand-200 bg-brand-50 text-brand-700",
        good: "border-good-100 bg-good-50 text-good-700",
        watch: "border-watch-100 bg-watch-50 text-watch-700",
        alert: "border-alert-100 bg-alert-50 text-alert-700",
        info: "border-info-100 bg-info-50 text-info-700",
        outline: "border-ink-300 bg-surface text-ink-700",
      },
      size: {
        default: "text-xs",
        lg: "px-3 py-1.5 text-sm",
      },
    },
    defaultVariants: { variant: "neutral", size: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };
