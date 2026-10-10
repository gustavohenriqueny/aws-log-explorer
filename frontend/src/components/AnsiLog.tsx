import { useMemo } from "react";
import { parseAnsiString } from "@/lib/ansi";
import { TERMINAL_THEMES, type TerminalThemeId } from "@/lib/terminal-themes";

export interface AnsiLogProps {
  message: string;
  parsedMessage?: Record<string, unknown> | unknown[] | null;
  viewMode?: "raw" | "json";
  terminalTheme?: TerminalThemeId;
  wrapText?: boolean;
}

export function AnsiLog({
  message,
  parsedMessage,
  viewMode = "raw",
  terminalTheme = "slate",
  wrapText = false,
}: AnsiLogProps) {
  const theme = TERMINAL_THEMES[terminalTheme] ?? TERMINAL_THEMES.slate;

  const content = useMemo(() => {
    if (viewMode === "json" && parsedMessage) {
      return JSON.stringify(parsedMessage, null, 2);
    }
    return message;
  }, [message, parsedMessage, viewMode]);

  const chunks = useMemo(() => {
    if (viewMode === "json" && parsedMessage) {
      return [{ text: content }];
    }
    return parseAnsiString(content);
  }, [content, viewMode, parsedMessage]);

  return (
    <div className={`relative mt-2 rounded-xl border ${theme.borderClass} ${theme.bgClass} p-3.5 shadow-sm`}>
      <pre
        className={`max-h-72 overflow-x-auto font-mono text-xs leading-relaxed ${theme.textClass} selection:bg-primary/30 ${
          wrapText ? "whitespace-pre-wrap break-words" : "whitespace-pre"
        }`}
      >
        {chunks.map((chunk, idx) => {
          let className = chunk.colorClass ?? (theme.id === "light" ? "text-slate-800" : "text-slate-100");
          if (chunk.isDim) className += ` ${theme.timeClass} opacity-80`;
          if (chunk.isBold) className += " font-bold";

          return (
            <span key={idx} className={className}>
              {chunk.text}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
