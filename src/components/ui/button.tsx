import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * Minimum height is driven by `--a11y-tap` (44px default, 52px in Easy Read
 * Mode) so touch targets stay comfortable for elderly users without any extra
 * work in the pages.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm",
        secondary: "bg-surface text-ink-800 border border-ink-200 hover:bg-ink-50 active:bg-ink-100",
        outline: "border-2 border-ink-300 bg-transparent text-ink-800 hover:bg-ink-50",
        ghost: "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
        soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
        danger: "bg-alert-600 text-white hover:bg-alert-700",
        link: "text-brand-700 underline underline-offset-4 hover:text-brand-800",
      },
      size: {
        sm: "min-h-9 px-3 text-sm [&_svg]:size-4",
        default: "min-h-[var(--a11y-tap)] px-4 py-2 text-base [&_svg]:size-5",
        lg: "min-h-[calc(var(--a11y-tap)+0.5rem)] px-6 text-lg [&_svg]:size-6",
        icon: "min-h-[var(--a11y-tap)] w-[var(--a11y-tap)] p-0 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
