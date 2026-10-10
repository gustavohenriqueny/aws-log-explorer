/* eslint-disable no-control-regex */

export interface AnsiChunk {
  text: string;
  colorClass?: string;
  isDim?: boolean;
  isBold?: boolean;
}

const ANSI_COLOR_MAP: Record<string, string> = {
  "30": "text-slate-500",
  "31": "text-rose-400 font-semibold",
  "32": "text-emerald-400 font-semibold",
  "33": "text-amber-300 font-medium",
  "34": "text-sky-400 font-medium",
  "35": "text-fuchsia-400 font-medium",
  "36": "text-cyan-400 font-medium",
  "37": "text-slate-200",
  "90": "text-slate-400",
  "91": "text-rose-300 font-semibold",
  "92": "text-emerald-300 font-semibold",
  "93": "text-yellow-200",
  "94": "text-sky-300",
  "95": "text-fuchsia-300",
  "96": "text-cyan-300",
  "97": "text-white font-bold",
};

export function parseAnsiString(raw: string): AnsiChunk[] {
  if (!raw) return [{ text: "" }];

  // Matches \x1b[...m or \u001b[...m or literal [...m if escape character was dropped
  const ansiRegex = /(?:[\u001b\x1b\x00\ufffd\u25a1]|\u25a2)?\[([0-9;]+)m/g;
  const chunks: AnsiChunk[] = [];
  let lastIndex = 0;
  let currentColorClass: string | undefined = undefined;
  let isDim = false;
  let isBold = false;

  let match: RegExpExecArray | null;
  while ((match = ansiRegex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      const text = raw.substring(lastIndex, match.index);
      if (text) {
        chunks.push({
          text,
          ...(currentColorClass ? { colorClass: currentColorClass } : {}),
          ...(isDim ? { isDim: true } : {}),
          ...(isBold ? { isBold: true } : {}),
        });
      }
    }

    const codes = (match[1] || "0").split(";");
    for (const code of codes) {
      if (code === "0" || code === "" || code === "00" || code === "39") {
        currentColorClass = undefined;
        isDim = false;
        isBold = false;
      } else if (code === "1") {
        isBold = true;
      } else if (code === "2") {
        isDim = true;
      } else if (ANSI_COLOR_MAP[code]) {
        currentColorClass = ANSI_COLOR_MAP[code];
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  if (lastIndex < raw.length) {
    const text = raw.substring(lastIndex);
    if (text) {
      chunks.push({
        text,
        ...(currentColorClass ? { colorClass: currentColorClass } : {}),
        ...(isDim ? { isDim: true } : {}),
        ...(isBold ? { isBold: true } : {}),
      });
    }
  }

  // Clean any stray control chars or replacement squares
  return chunks.map((chunk) => ({
    ...chunk,
    text: chunk.text.replace(/[\u001b\x1b\x00\ufffd\u25a1\u25a2]/g, ""),
  }));
}
