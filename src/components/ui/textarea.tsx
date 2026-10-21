import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="input"
    className={cn(
      "flex min-h-24 w-full rounded-xl border border-ink-200 bg-surface px-4 py-3 text-base leading-relaxed text-ink-900",
      "placeholder:text-ink-400 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
