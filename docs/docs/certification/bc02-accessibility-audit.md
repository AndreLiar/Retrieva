---
sidebar_position: 2
---

# BC02 — Accessibility / RGAA audit (Retrieva)

**Bloc:** BC02 Concevoir & développer · **Date:** 2026-09-06 · **Target:** Retrieva frontend
(https://retrieva.online) · **Tool:** Lighthouse (headless Chrome) — automated RGAA-aligned checks.

## Result: **96 / 100** (gate: ≥ 80 ✅)

The accessibility gate flagged in `platform-backlog#195` was originally scoped (in error) to the
ktayl-solution public site; the correct target is the **certification project — Retrieva**. Audited
there, Retrieva's public frontend scores **96/100**, already above the required threshold.

## Automated findings (1 issue)

| Weight | Check | Elements | Detail |
|---|---|---|---|
| 7 | Insufficient colour contrast | 1 | A muted badge chip: foreground `#79879a` on background `#1b222d` = ratio **4.37** (WCAG AA needs **4.5** for this size). Selector: `div.min-h-screen > section.container > div > div.inline-flex` (`bg-muted` pill on the hero). |

**Fix:** nudge the `muted-foreground` token slightly lighter (e.g. `#8a97a8`+) → ratio ≥ 4.5 →
100/100. Single CSS-variable change.

## Manual review still required (RGAA is 106 criteria)

Lighthouse automates a subset; **10 manual checks** remain for a formal RGAA dossier — keyboard
navigation, focus order/visibility, screen-reader labelling, reflow/zoom, and content structure.
These are the real BC02 accessibility documentation work (on Retrieva, not ktayl).

## Evidence

Full Lighthouse report (HTML + JSON) is stored with this section:
- `static/certification/retrieva-a11y-report.html` — the interactive report
- `static/certification/retrieva-a11y-report.json` — raw scores + audit details

Re-run: `lighthouse https://retrieva.online --only-categories=accessibility --chrome-flags="--headless"`.
