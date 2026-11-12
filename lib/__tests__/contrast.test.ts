import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function parseBlockTokens(css: string, selector: ":root" | ".dark"): Record<string, string> {
  const escaped = selector.replace(".", "\\.");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, "m"));
  if (!match?.[1]) {
    throw new Error(`Could not find ${selector} block in styles/tokens.css`);
  }

  const tokens: Record<string, string> = {};
  const varRegex = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let current: RegExpExecArray | null;
  while ((current = varRegex.exec(match[1])) !== null) {
    if (current[1] && current[2]) {
      tokens[`--${current[1]}`] = current[2].trim();
    }
  }
  return tokens;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) {
    throw new Error(`Expected 6-digit hex color, received: ${hex}`);
  }
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((v) => {
    const srgb = v / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const REQUIRED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["--text", "--bg"],
  ["--text", "--surface"],
  ["--text", "--surface-muted"],
  ["--text-muted", "--bg"],
  ["--text-muted", "--surface"],
  ["--text-muted", "--surface-muted"],
  ["--primary-fg", "--primary"],
  ["--primary", "--surface"],
  ["--secondary-fg", "--secondary"],
  ["--accent-fg", "--accent"],
  ["--accent", "--surface"],
  ["--accent-soft-fg", "--accent-soft"],
  ["--success-fg", "--success"],
  ["--success-soft-fg", "--success-soft"],
  ["--warning-fg", "--warning"],
  ["--warning-soft-fg", "--warning-soft"],
  ["--danger-fg", "--danger"],
  ["--danger-soft-fg", "--danger-soft"],
];

describe("Design token WCAG AA contrast (>= 4.5:1)", () => {
  const cssPath = path.resolve(process.cwd(), "styles/tokens.css");
  const css = fs.readFileSync(cssPath, "utf8");

  it.each([":root", ".dark"] as const)(
    "maintains >= 4.5:1 contrast for all semantic pairs in %s",
    (mode) => {
      const tokens = parseBlockTokens(css, mode);
      for (const [fgVar, bgVar] of REQUIRED_PAIRS) {
        const fg = tokens[fgVar];
        const bg = tokens[bgVar];
        expect(fg, `Missing ${fgVar} in ${mode}`).toBeDefined();
        expect(bg, `Missing ${bgVar} in ${mode}`).toBeDefined();
        const ratio = contrastRatio(fg!, bg!);
        expect(
          ratio,
          `${mode} pair ${fgVar} (${fg}) on ${bgVar} (${bg}) has contrast ${ratio.toFixed(2)}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  );
});
