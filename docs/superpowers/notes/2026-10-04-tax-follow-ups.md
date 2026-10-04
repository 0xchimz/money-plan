# money-plan tax page — follow-ups (4 Oct 2026)

Built 4 Oct 2026 on branch `tax` (not deployed yet). Spec: `../specs/2026-10-04-tax-design.md` · plan: `../plans/2026-10-04-tax.md` · rules check: `2026-10-04-tax-rules-2569-check.md`.

## Before adding the rules of tax year 2570

- [ ] **Year selector.** The page always asks for the default year; `Tax.years` is unused. Adding `RULES_2027` before March 2027 would flip the default to 2570 with no way back to 2569 at filing time.
- [ ] **Plan lines are not per-year.** A linked line follows today's plan amount and today's tag in every year. In Jan–Mar 2027 a newly tagged line shows in 2569 as plan × 12, and old linked lines project at the new amount unless their as-of month is December.
- [ ] Method 2 (0.5%) excludes 40(1) by the key `inc_wage`, and section names are spelled out in `shared/tax.ts` — check both when a rule changes.
- [ ] Thai ESG: 2569 is the last year of the 30% / 300,000 window (no extension found on 4 Oct 2026).

## To check on a real phone (not done — headless Chrome only)

- [ ] Type into the edit sheet (paid so far, one-off with `+`), save, reopen
- [ ] Failed save with the network off: toast shows, the sheet stays open with the typed text
- [ ] Reserve card inside the result sheet: no zoom when the amount gets focus
- [ ] Rotate / resize across 1024px with a sheet open

## Known gaps, left on purpose

- **Writes are not queued.** Two saves on one row within a fraction of a second can reach the Worker out of order; the page shows the newer value until the next reload while the server holds the older. Fix: chain writes on one promise in `mutate`.
- **No hints on what to tag.** A salary line tagged 40(1) must be gross (before tax, social security, PVD); PVD counts the employee's part only. Nothing on the page says so.
- **Advice is per kind.** The retirement-group room shows under "RMF", not "RMF / PVD" (spec §4.3). Donation advice shows the 2× kind only.
- **Row cap labels.** Only the "เกินเพดาน นับได้ …" line at the foot of a section exists; rows have no "เต็มเพดาน" badge (spec §7.2).
- **Re-attach is by kind + name.** After an untag or a deleted line, tagging a line with the same kind and the same name re-links the amounts that were typed before. A line re-tagged with another kind, or renamed in between, is not re-linked: the earlier amounts stay as a hand-typed row and the line starts again at plan × 12 — the user has to remove one of them.
- **กอช.** is capped at 30,000 in the rules; the Revenue Department guide lists it only inside the 500,000 group (the fund accepts at most 30,000 a year, so the result is the same).
- Social security is "as paid" with no yearly maximum in the rules (10,500 for 2026 per SSO draft, not yet gazetted).
- Not built (spec "ไม่อยู่ในงานนี้"): ภ.ง.ด.90 summary, 40(3)/(4)/(6)–(8), foreign income, joint filing, actual expenses, ภ.ง.ด.94, reserve linked to a Balance row, per-child rules, PVD's 15%-of-wage cap.

## Small things

- `round2` uses `Number.EPSILON`, which does nothing for large values; half-cent inputs can round either way (at most 0.01).
- `scenarioSummary.capped` flags a changed kind that was already over its cap even when the change lowers it; a kind pushed out by its group is not flagged.
- Scenario editor: change rows are keyed by index; rows with amount 0 are dropped when another column is picked; delete has no confirm; a new row's default kind may be missing from the list; a failure reload restarts the editor and drops text not yet committed.
- Tax API: no upper bound on amounts (1e308 → 500 instead of 400); no length cap on label / expr; a scenario change of 0.004 rounds to 0 and is stored; two "apply" calls at the same instant could add the lines twice.
- Tax page: a result of exactly 0 reads "ต้องจ่ายเพิ่มตอนยื่น 0.00"; the add form accepts 0; a failed rename leaves the typed name in the desktop editor until reload; `Line` is declared inside `ResultCard` (lint `static-components`); `tax-parts.tsx` exports helpers and components together (lint `only-export-components`).
- Phone: the sheet / result sheet state survives crossing 1024px and reopens on the way back; the closing sheet shows the old numbers while it slides out; an empty amount saves as 0.
- `TaxKindSelect` shows a blank value if a stored kind is not among the options (cannot happen with one rule year).
- Tests not written: PATCH that changes type and tag together; rename of a linked line; scenario PATCH validation; two rows of one kind in a section; a group cap biting in `buildView`.
- Planning: no warning that removing a tax tag turns typed amounts into a hand-typed row.
- `scripts/import-portfolio-db.py` and `scripts/import-nitcha-excel.py` delete `budget_lines`; that now also deletes linked tax amounts and tags (warning added at the top of both).
