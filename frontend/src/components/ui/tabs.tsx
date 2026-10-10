import { createContext, useContext, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
}

const TabsContext = createContext<TabsContextValue>({});

export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value?: string | undefined;
  defaultValue?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
}

export function Tabs({ className, value, onValueChange, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("w-full", className)} {...props} />
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center rounded-lg bg-muted/80 p-1 text-muted-foreground shadow-inner",
        className
      )}
      role="tablist"
      {...props}
    />
  );
}

export interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value?: string | undefined;
  active?: boolean | undefined;
}

export function TabsTrigger({ className, value, active, onClick, ...props }: TabsTriggerProps) {
  const context = useContext(TabsContext);
  const isSelected = active !== undefined ? active : (value !== undefined && context.value === value);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={(e) => {
        if (value !== undefined && context.onValueChange) {
          context.onValueChange(value);
        }
        onClick?.(e);
      }}
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-md px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        isSelected
          ? "bg-background text-foreground shadow-xs font-semibold"
          : "hover:text-foreground/80 hover:bg-background/40",
        className
      )}
      {...props}
    />
  );
}

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({ className, value, children, ...props }: TabsContentProps) {
  const context = useContext(TabsContext);
  if (context.value !== undefined && context.value !== value) {
    return null;
  }
  return (
    <div
      role="tabpanel"
      className={cn("mt-2 focus-visible:outline-none", className)}
      {...props}
    >
      {children}
    </div>
  );
}
