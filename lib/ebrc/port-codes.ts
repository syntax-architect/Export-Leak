import fs from "node:fs";
import path from "node:path";

export interface DgftPortCodeEntry {
  code: string;
  name: string;
  mode: "sea" | "air" | "icd" | string;
}

interface PortCodesFileShape {
  version: string;
  ports: DgftPortCodeEntry[];
}

let cachedPortMap: Map<string, DgftPortCodeEntry> | null = null;
let cachedVersion = "unknown";

function ensureLoaded(): Map<string, DgftPortCodeEntry> {
  if (cachedPortMap) return cachedPortMap;

  const filePath = path.resolve(process.cwd(), "fixtures", "dgft-port-codes.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as PortCodesFileShape;
  const map = new Map<string, DgftPortCodeEntry>();

  for (const item of parsed.ports ?? []) {
    if (item && typeof item.code === "string") {
      const normalized = item.code.trim().toUpperCase();
      map.set(normalized, {
        code: normalized,
        name: item.name,
        mode: item.mode,
      });
    }
  }

  cachedPortMap = map;
  cachedVersion = parsed.version ?? "unknown";
  return cachedPortMap;
}

export function isValidDgftPortCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return false;
  return ensureLoaded().has(normalized);
}

export function getDgftPortCodeInfo(code: string): DgftPortCodeEntry | null {
  const normalized = code.trim().toUpperCase();
  return ensureLoaded().get(normalized) ?? null;
}

export function listDgftPortCodes(): readonly DgftPortCodeEntry[] {
  return Array.from(ensureLoaded().values());
}

export function getDgftPortCodesVersion(): string {
  ensureLoaded();
  return cachedVersion;
}
