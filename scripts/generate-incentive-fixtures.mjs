import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ratesDir = path.join(root, "fixtures", "rates");
const scrollDir = path.join(root, "fixtures", "scroll");

fs.mkdirSync(ratesDir, { recursive: true });
fs.mkdirSync(scrollDir, { recursive: true });

const syntheticRatesCsv = [
  "scheme,hs_code,rate_bps,cap_per_unit,uqc,effective_from,effective_to,source_note",
  "rodtep,84834000,150,25.00,KGS,2026-01-01,2026-06-30,SYNTHETIC TEST FIXTURE ONLY (NOT OFFICIAL RATE)",
  "rodtep,84834000,180,30.00,KGS,2026-07-01,,SYNTHETIC TEST FIXTURE ONLY (MID-YEAR CHANGE TEST)",
  "drawback,84834000,120,,KGS,2026-01-01,,SYNTHETIC TEST FIXTURE ONLY (NO CAP TEST)",
  "rosctl,62052000,325,18.50,PCS,2026-01-01,,SYNTHETIC TEST FIXTURE ONLY (APPAREL CAP TEST)",
  "rodtep,73269099,85,12.00,KGS,2026-01-01,,SYNTHETIC TEST FIXTURE ONLY (ALT HS TEST)",
].join("\n");

const ratesReadme = `# Incentive Rate CSV Fixtures (Synthetic Only)

This folder contains **synthetic test fixtures** used solely for automated unit tests and Playwright E2E tests.

- **Important:** Do NOT use \`synthetic-test-rates.csv\` in production. Official RoDTEP, Duty Drawback, and RoSCTL schedules must be downloaded from DGFT / CBIC notifications and imported via the Admin Rate Importer after verification.
- Columns required by the admin rate importer:
  \`scheme, hs_code, rate_bps, cap_per_unit, uqc, effective_from, effective_to, source_note\`
`;

const syntheticScrollCsv = [
  "sb_number,scheme,credited_amount,credited_on,scroll_number",
  "SB2026001,rodtep,2900.00,2026-05-10,SCR-2026-0001",
  "SB2026001,drawback,10000.00,2026-05-12,SCR-2026-0002",
  "SB2026002,rodtep,4500.00,2026-08-20,SCR-2026-0099",
].join("\n");

const scrollReadme = `# Customs Scroll / Ledger Fixtures (Synthetic Baseline)

This folder contains a **synthetic customs scroll CSV** baseline matching the synthetic Shipping Bills used in local development and automated tests.

- Drop 1-2 anonymised real customs scroll CSV exports here later when calibrating bank/customs column variants.
- Supported columns: \`sb_number\`, \`scheme\`, \`credited_amount\`, \`credited_on\`, \`scroll_number\`.
`;

fs.writeFileSync(path.join(ratesDir, "synthetic-test-rates.csv"), `${syntheticRatesCsv}\n`, "utf8");
fs.writeFileSync(path.join(ratesDir, "README.md"), ratesReadme, "utf8");
fs.writeFileSync(
  path.join(scrollDir, "customs-scroll-rodtep-drawback.csv"),
  `${syntheticScrollCsv}\n`,
  "utf8"
);
fs.writeFileSync(path.join(scrollDir, "README.md"), scrollReadme, "utf8");

console.log("Generated synthetic incentive rate and customs scroll fixtures.");
