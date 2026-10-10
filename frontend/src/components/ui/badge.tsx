import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border-border text-foreground bg-background/50",
        destructive: "border-transparent bg-destructive/15 text-destructive border border-destructive/30 font-semibold",
        success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold",
        warning: "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold",
        info: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold",
        purple: "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold",
      },
    },
    defaultVariants: { variant: "default" },
  }
);
export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) { return <div className={cn(badgeVariants({ variant }), className)} {...props} />; }
