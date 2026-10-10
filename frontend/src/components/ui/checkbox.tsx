import type { InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> { label: string | React.ReactNode }
export function Checkbox({ className, label, id, ...props }: CheckboxProps) {
  const inputId = id ?? (typeof label === "string" ? `checkbox-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}` : undefined);
  return (
    <label
      className={cn(
        "group flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-accent/70",
        className
      )}
      htmlFor={inputId}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <input id={inputId} type="checkbox" className="peer sr-only" {...props} />
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-[5px] border border-border bg-background transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-checked:border-primary peer-checked:bg-primary peer-hover:border-primary/60"
        />
        <Check
          aria-hidden="true"
          className="pointer-events-none absolute h-3 w-3 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
        />
      </span>
      <span className="truncate">{label}</span>
    </label>
  );
}
