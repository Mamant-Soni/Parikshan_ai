"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }
>(({ className, value, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-ink-100", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "h-full rounded-full bg-brand-500 transition-transform duration-500",
        value === null ? "w-1/3 animate-[upload-progress_1.5s_ease-in-out_infinite]" : "w-full flex-1",
        indicatorClassName,
      )}
      style={value === null ? undefined : { transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = "Progress";

export { Progress };
