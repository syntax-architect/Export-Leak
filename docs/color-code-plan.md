# ExportLeak — Color Code Plan

**Decision: Navy + Silver Blue + Copper** · approved 2026-11-14 · Runner-up: Emerald + White + Tangerine

Provenance: token names/lines below were re-verified by reading `styles/tokens.css`, `app/globals.css`, `app/layout.tsx` and `app/manifest.ts` when this plan was written. Component touchpoints (button.tsx:23, alerts-drawer.tsx:134, documents-manager.tsx:843/973, ebrc-workspace.tsx:320) come from the decision brief/verification run and were not re-read here.

## 1. Chosen palette and why

- **Keeps the incumbent trusted navy** (`--primary: #0f2744`, styles/tokens.css:12; `themeColor: #0F2744`, app/layout.tsx:66) as structural ink and adds exactly **one warm accent — copper**. The lowest-risk identity change for a trust-critical, data-dense finance/compliance app.
- **Silver Blue** is a desaturated cool neutral carrying ~60% of pixels (canvas, cards, tables, dividers), so INR-dense numerals stay calm and copper keeps the signal.
- **Runner-up Emerald + White + Tangerine lost on role separation/trust**: emerald (CTA) collides with `--success` #15803d "money received" (styles/tokens.css:26) and tangerine collides with `--warning` amber (styles/tokens.css:31) — two payment-status semantics blurred at once. Measured contrast ramping (2.80→5.18:1) cannot fix that semantic blur. Its score of 37 is slightly generous (~35 after crediting trustFit/roleSeparation at 6). _(Runner-up and alternative-candidate scores were not re-verified — out of scope for the winner check.)_
- Acid Green would force a 4th color (light-theme ring 1.38:1 / links 2.84:1 per the decision run); Mocha + Lavender's identity collapses in light theme (pale lavender unusable as text).
- The winner's one flagged collision — copper `#B4530A` (hue 25.8°) vs `--warning` `#b45309` (hue 26.0°), a literal 1-bit twin (styles/tokens.css:31) — is resolved by **retinting `--warning` toward yellow** (`#a16207` light / `#eab308` dark) without touching the 3-color palette.

## 2. 60 / 30 / 10 allocation

| Role           | Color                                  | Usage                                                                                   | Light hex                                                              | Dark hex                                                                          |
| -------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **60% canvas** | Silver Blue (desaturated cool neutral) | Page canvas, cards/tables/zebra rows, dividers — calm large surfaces for INR-dense data | bg `#E9EEF4` · cards `#F7FAFC` · borders `#DBDBDF` / `#E3E9EF`         | bg `#0B1220` · cards `#121D30` · borders `#1E2F4D`-tinted (`#1E2F4D` / `#2A3B58`) |
| **30% ink**    | Navy (structural ink)                  | Primary text, table numerals/headers, secondary buttons, panel chrome                   | text `#16324F` · muted `#5B6B7F` · panel tints `#F0F4F8`               | text `#C9D6E8` · muted `#8FA1B8` · panels `#1E2F4D`                               |
| **10% accent** | Copper (signature accent)              | Primary CTAs, active tabs, links, selection highlights, focus ring                      | fill `#B4530A` + fg `#FFFFFF` (5.02:1) · links/ring `#9C4408` (5.55:1) | fill/links `#E8935C` + fg `#160F08` (7.92:1) · ring `#E8935C`                     |

## 3. Token mapping — real names from styles/tokens.css

**No new tokens are required and nothing is renamed** — every mapped name already exists in `styles/tokens.css` (light `:root` lines 3–42, dark `.dark` lines 61–102), so the `@theme inline` mapping in `app/globals.css:3–41` and all Tailwind utilities keep resolving unchanged. Values marked _(derived)_ are not pinned by the decision — they are suggested fill-ins inside the stated family, contrast-measured this session where noted; all other values are decision-pinned. Hex case: the file uses lowercase; write proposed values lowercase (`#e8935c`) to keep diffs tidy. Spacing/radius/shadow tokens are untouched.

| Token (styles/tokens.css)                      | Light: current → proposed  | Dark: current → proposed   | Verdict                                                                                                                                                             |
| ---------------------------------------------- | -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--bg` (3)                                     | `#f8fafc` → `#e9eef4`      | `#070d17` → `#0b1220`      | change (pinned)                                                                                                                                                     |
| `--surface` (4)                                | `#ffffff` → `#f7fafc`      | `#0f172a` → `#121d30`      | change (pinned)                                                                                                                                                     |
| `--surface-muted` (5)                          | `#f1f5f9` → `#f0f4f8`      | `#1e293b` → `#1e2f4d`      | change (pinned; panel tint)                                                                                                                                         |
| `--text` (6)                                   | `#0f172a` → `#16324f`      | `#f8fafc` → `#c9d6e8`      | change (pinned)                                                                                                                                                     |
| `--text-muted` (7)                             | `#475569` → `#5b6b7f`      | `#cbd5e1` → `#8fa1b8`      | change (pinned)                                                                                                                                                     |
| `--border` (8)                                 | `#cbd5e1` → `#dbdbdf`      | `#334155` → `#2a3b58`      | change (light: stronger endpoint of the pinned border range; dark: _derived_ #1E2F4D tint, one step lighter — preserves current border > border-subtle visibility)  |
| `--border-subtle` (9)                          | `#e2e8f0` → `#e3e9ef`      | `#1e293b` → `#1e2f4d`      | change (light: fainter endpoint of the pinned range; dark: mirrors surface-muted, matching the current convention where dark `--border-subtle` = `--surface-muted`) |
| `--primary` (12)                               | `#0f2744` → `#b4530a`      | `#60a5fa` → `#e8935c`      | change (pinned; replaces the old blue dark flip at line 72)                                                                                                         |
| `--primary-hover` (13)                         | `#16365e` → `#9c4408`      | `#93c5fd` → `#f0a675`      | change (light pinned; dark _derived_ lighter step per existing dark-hover-lighter convention — fg contrast improves above the measured 7.92)                        |
| `--primary-fg` (14)                            | `#ffffff` (unchanged)      | `#070d17` → `#160f08`      | dark change (pinned; 5.02 light / 7.92 dark)                                                                                                                        |
| `--secondary` (16)                             | `#e2e8f0` → `#f0f4f8`      | `#1e293b` → `#1e2f4d`      | change (pinned panel tints)                                                                                                                                         |
| `--secondary-hover` (17)                       | `#cbd5e1` → `#e3e9ef`      | `#334155` → `#24344f`      | change (light: pinned-range value, measured 10.71 with fg; dark: _derived_, measured 8.50 with fg)                                                                  |
| `--secondary-fg` (18)                          | `#0f172a` → `#16324f`      | `#f8fafc` → `#c9d6e8`      | change (navy ink; measured 11.85 light / 9.09 dark on the secondary bg)                                                                                             |
| `--accent` (20)                                | `#0f766e` → `#9c4408`      | `#2dd4bf` → `#e8935c`      | change (pinned; the darkened copper ramp that carries link/selection text — replaces the old teal)                                                                  |
| `--accent-hover` (21)                          | `#115e59` → `#823a06`      | `#5eead4` → `#f0a675`      | change (_derived_ darker/lighter steps following the existing hover conventions; fg contrast improves above measured 6.47)                                          |
| `--accent-fg` (22)                             | `#ffffff` (unchanged)      | `#042f2e` → `#160f08`      | dark change (pinned; 6.47 light / 7.92 dark)                                                                                                                        |
| `--accent-soft` (23)                           | `#ccfbf1` → `#f8e9de`      | `#042f2e` → `#2e1d10`      | change (_derived_ soft copper tints replacing the old teal soft)                                                                                                    |
| `--accent-soft-fg` (24)                        | `#115e59` → `#9c4408`      | `#5eead4` → `#e8935c`      | change (own -fg pair per the decision; measured 5.46 light / 6.74 dark on the soft bg)                                                                              |
| `--ring` (42)                                  | `#0f766e` → `#9c4408`      | `#2dd4bf` → `#e8935c`      | change (pinned; replaces the old teal ring)                                                                                                                         |
| `--warning` (31)                               | `#b45309` → `#a16207`      | `#f59e0b` → `#eab308`      | change (pinned retint — clears the 1-bit copper collision; hue 26.0° → 35.5° light / 45.4° dark)                                                                    |
| `--warning-fg` (32)                            | `#ffffff` keep             | `#1c1917` keep             | keep (re-measured on the retinted fills: 4.92 light / 9.12 dark)                                                                                                    |
| `--warning-soft` / `--warning-soft-fg` (33–34) | `#fef3c7` / `#78350f` keep | `#451a03` / `#fde68a` keep | keep — amber family stays (see residual (b) below)                                                                                                                  |
| `--success` family (26–29)                     | `#15803d` + soft pair keep | `#22c55e` + soft pair keep | keep — "money received" semantics untouched (hue 142.4°)                                                                                                            |
| `--danger` family (36–40)                      | `#b91c1c` + soft pair keep | `#f87171` + soft pair keep | keep — crimson, hue 0°, Δ26° from copper                                                                                                                            |

Brand anchors: `themeColor` (app/layout.tsx:66) and `theme_color` (app/manifest.ts:13) **stay `#0F2744`** — no brand-anchor change. One optional flag: `background_color` (app/manifest.ts:12, `#F8FAFC`) mirrors the old `--bg`; update it to `#E9EEF4` if the splash background should match the new canvas (outside the pinned decision — implementer's call).

## 4. WCAG AA pairing notes

Verification **completed** during planning: approved, no blocking issues (WCAG 2.1 relative-luminance run, 31 pairs + 9 hues). For this document the pivotal pairs were **re-measured independently this session** with a `node -e` one-liner (28 pairs + 6 hues); every overlapping value matched exactly, so the numbers below are confirmed by both runs.

Light theme (≥4.5:1 text, ≥3:1 fills/UI):

| Pair                                                                                                                                                           | Ratio                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Navy text `#16324F` on canvas `#E9EEF4` / card `#F7FAFC` / panel `#F0F4F8`                                                                                     | 11.23 / 12.50 / 11.85 — AAA                                                                                                                                                                                        |
| Muted `#5B6B7F` on canvas / card / panel                                                                                                                       | 4.67 / 5.20 / 4.93 — AA pass (the decision text's "muted 5.20 in light" is the card value, misattributed to canvas; both pass)                                                                                     |
| Copper CTA fill `#B4530A` + `#FFFFFF` fg                                                                                                                       | 5.02 (hover `#9C4408` + `#FFF` = 6.47)                                                                                                                                                                             |
| Links/ring `#9C4408` on canvas / card                                                                                                                          | 5.55 / 6.18                                                                                                                                                                                                        |
| Raw copper `#B4530A` as text on canvas                                                                                                                         | 4.30 — fails 4.5:1, exactly as the decision flags; the mapping routes link/selection text to the `#9C4408` ramp. 4.30 still clears 3:1 for fills/UI (CTA fill on canvas, documents-manager.tsx:973 progress fills) |
| Retinted warning `#A16207` + existing `#FFFFFF` fg (tokens.css:32)                                                                                             | 4.92                                                                                                                                                                                                               |
| Derived pairs measured this session: `#16324F` on secondary `#F0F4F8` = 11.85; on secondary-hover `#E3E9EF` = 10.71; `#9C4408` on accent-soft `#F8E9DE` = 5.46 | all ≥4.5 — AA                                                                                                                                                                                                      |

Dark theme:

| Pair                                                                                                                          | Ratio                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Text `#C9D6E8` on bg `#0B1220` / card `#121D30` / panel `#1E2F4D`                                                             | 12.72 / 11.47 / 9.09                                |
| Muted `#8FA1B8` on bg / card / panel                                                                                          | 7.10 / 6.40 / 5.07 — AA everywhere                  |
| Copper `#E8935C` on bg / card / panel                                                                                         | 7.81 / 7.04 / 5.58; fg `#160F08` on the fill = 7.92 |
| Retinted `#EAB308` + existing `#1C1917` fg                                                                                    | 9.12                                                |
| Ring on every dark surface                                                                                                    | ≥5.58 — clears 3:1 with margin                      |
| Derived pairs measured this session: `#C9D6E8` on secondary-hover `#24344F` = 8.50; `#E8935C` on accent-soft `#2E1D10` = 6.74 | ≥4.5 — AA                                           |

Semantics (hue run; both runs agree):

- Copper `#B4530A` = 25.8° vs `--warning` `#b45309` = 26.0° — the "1-bit twin" claim is true (tokens.css:31). The retint moves warning to 35.5° (`#a16207`) light / 45.4° (`#eab308`) dark — materially separated.
- Danger `#b91c1c` at 0° stays Δ26° distinct from copper; success `#15803d` ("money received", tokens.css:26) is untouched at 142.4°. Copper is neither red nor green — no error/money-received clash.
- Structure check passes: calm desaturated dominant in both themes (`#E9EEF4` / `#0B1220`), navy ink support, single warm accent — not all-loud, not all-dark.

Residuals for the implementer (non-blocking, from the verification):

- **(a)** Copper fill vs retinted warning fill remain warm-family adjacent (Δ~10° hue, near-equal luminance) — status badges/progress must keep text labels (documents-manager.tsx:973; ebrc-workspace.tsx:320 uses the warning-soft banner with text — keep it that way).
- **(b)** Retint scope names only `--warning` — `--warning-soft`/`--warning-soft-fg` (tokens.css:33–34) stay amber-family; fine in soft-banner contexts, but don't leave a solid `#b45309`-class fill anywhere.
- **(c)** The decision's "every dark-theme pair 6.40–12.72" dips to 5.07–5.58 for muted/copper on panels — those surfaces use the brighter text/secondary-fg, still AA.

## 5. Migration checklist

1. [ ] `styles/tokens.css` `:root` (lines 1–59): apply the **Light** column of §3 — silver surfaces, navy ink family, copper accent trio, ring `#9c4408`; retint `--warning` `#b45309` → `#a16207` (line 31). Leave `--success` (26–29), `--danger` (36–40), `--warning-fg/-soft/-soft-fg` (32–34), `--primary-fg`/`--accent-fg` (`#ffffff`, 14/22) untouched.
2. [ ] `styles/tokens.css` `.dark` (lines 60–102): apply the **Dark** column — replace the old blue/teal dark flips (`--primary` `#60a5fa` → `#e8935c` line 72; `--accent` `#2dd4bf` → `#e8935c` line 80; `--ring` `#2dd4bf` → `#e8935c` line 102) and retint `--warning` `#f59e0b` → `#eab308` (line 91).
3. [ ] No token renames and no new tokens → `app/globals.css` `@theme inline` (globals.css:3–41) untouched; all utilities (`bg-bg`, `text-text`, `bg-primary`, `bg-accent-soft`, …) keep resolving.
4. [ ] Brand anchors unchanged: `themeColor` app/layout.tsx:66 and `theme_color` app/manifest.ts:13 stay `#0F2744`.
5. [ ] Optional (implementer's call): `background_color` app/manifest.ts:12 → `#e9eef4` to mirror the new canvas.
6. [ ] Grep sweep for hardcoded legacy hexes in components — `#0f766e`, `#115e59`, `#ccfbf1` (old teal accent family) and `#16365e` (old primary hover) — swap any stragglers to tokens. Main consumers already use tokens (per decision brief): primary Button button.tsx:23, active tabs alerts-drawer.tsx:134, selection documents-manager.tsx:843, status dots/progress documents-manager.tsx:973, banners ebrc-workspace.tsx:320.
7. [ ] Re-run the WCAG pair check (§4 pattern) on the committed values in both themes, including the derived soft-tint/border-adjacent pairs; fills ≥3:1, text pairs ≥4.5:1.
8. [ ] Manual pass per CLAUDE.md rule 7 (cited in decision brief): ≥360px phone-first, tables → card lists, ≥44px tap targets (`.tap-target` globals.css:87), 2px `--ring` focus outline visible on the silver canvas **and** on the copper CTA (globals.css:73–75), 16px inputs ≤767px to prevent iOS zoom (globals.css:78–85), `prefers-reduced-motion` kill switch (globals.css:92–100).
9. [ ] Confirm residual constraints: text labels kept on status badges/progress (a); no solid `#b45309`-class fill remains anywhere (b).
