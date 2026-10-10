import { describe, expect, it } from "vitest";
import { parseAnsiString } from "@/lib/ansi";

describe("parseAnsiString", () => {
  it("returns empty string chunk when empty", () => {
    expect(parseAnsiString("")).toEqual([{ text: "" }]);
  });

  it("handles plain text without ANSI codes", () => {
    const text = "Normal log message without color";
    expect(parseAnsiString(text)).toEqual([{ text }]);
  });

  it("parses Spring Boot / Logback ANSI escape sequences into styled chunks", () => {
    const raw = "\u001b[2m2026-08-21 19:56:54.612\u001b[0;39m \u001b[32m INFO\u001b[0;39m \u001b[35m1\u001b[0;39m \u001b[2m---\u001b[0;39m \u001b[2m[nio-8080-exec-7]\u001b[0;39m \u001b[33m[correlationId=N/A]\u001b[0;39m \u001b[36mcom.example.config.logs.CorrelationId   \u001b[0;39m \u001b[2m:\u001b[0;39m Header ausente; gerado correlationId=5a6bb488-5d59-4e67-9ff5-1b8e19cbb259";
    const chunks = parseAnsiString(raw);
    expect(chunks.length).toBeGreaterThan(5);

    // Timestamp chunk should be dim
    const timeChunk = chunks.find((c) => c.text.includes("2026-08-21"));
    expect(timeChunk).toBeDefined();
    expect(timeChunk?.isDim).toBe(true);

    // INFO chunk should have green color
    const infoChunk = chunks.find((c) => c.text.includes("INFO"));
    expect(infoChunk).toBeDefined();
    expect(infoChunk?.colorClass).toContain("emerald");

    // correlationId chunk should have yellow/amber color
    const corrChunk = chunks.find((c) => c.text.includes("correlationId=N/A"));
    expect(corrChunk).toBeDefined();
    expect(corrChunk?.colorClass).toContain("amber");

    // Class chunk should have cyan color
    const classChunk = chunks.find((c) => c.text.includes("CorrelationId"));
    expect(classChunk).toBeDefined();
    expect(classChunk?.colorClass).toContain("cyan");
  });

  it("handles literal [...m sequences when escape code byte was stripped", () => {
    const raw = "[2m2026-08-21[0;39m [32m INFO[0;39m Message";
    const chunks = parseAnsiString(raw);
    expect(chunks.some((c) => c.text.includes("INFO") && c.colorClass?.includes("emerald"))).toBe(true);
  });
});
