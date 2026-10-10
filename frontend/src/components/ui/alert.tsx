import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, variant = "default", ...props }: HTMLAttributes<HTMLDivElement> & { variant?: "default" | "warning" | "destructive" | "info" | "success" }) {
  const styles =
    variant === "destructive"
      ? "border-destructive/40 bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-rose-200"
      : variant === "warning"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
      : variant === "info"
      ? "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200"
      : variant === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200"
      : "border-border/80 bg-muted/60 text-foreground";
  return <div role="alert" className={cn("relative w-full rounded-xl border p-4 text-sm leading-relaxed backdrop-blur-sm", styles, className)} {...props} />;
}
