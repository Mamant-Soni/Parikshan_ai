import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    data-slot="input"
    className={cn(
      "flex min-h-[var(--a11y-tap)] w-full rounded-xl border border-ink-200 bg-surface px-4 py-2 text-base text-ink-900",
      "placeholder:text-ink-400 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
      "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500",
      "file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
