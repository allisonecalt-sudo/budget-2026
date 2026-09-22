# budget-2026 — how this budget actually works

**This repo is public and she is fine with that (her call, 2026-09-20: "i dont care that its public… its fine"). Third-party names are still kept out.**

Read this before touching anything. It is Allison's own model, in her words, so it never has to be re-explained. Full walkthrough with more detail: `second-brain/projects/budget-app/how-her-budget-works-2026-09-20.md`.

---

## The frame

> _"its a fluid budget i plan and then move around"_
> _"i'm not a genius at budgeting I just change things all the time to make it work… I estimate and then I fix it as I go"_

Everything is a dial. A number changing is the instrument working — never call a re-budget "drift", and never present a category overrun as a problem unless she asks.

**A projected == actual match is RECONCILIATION, not forecasting skill.** She moves the projection to meet reality as she goes. Never compliment the precision of a match; if you want to say something true about how she budgets, look at the edit trail (405 budget-amount edits in 2026), not at whether two columns agree.

**Savings is the scoreboard.** Her words: _"that's all that's actually the important number."_ Lead money work with it.

## The five behaviours

| Behaviour             | Lines                                                           | How it works                                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estimate → Actual** | Income                                                          | She types a guess, flips **EST→ACT** when it lands. **Private is the exception** — fed from the Biz tab, always sure.                                                                                            |
| **The dial**          | Savings                                                         | _"i change the number if needed"_ — where slack goes. Rarely invests so far.                                                                                                                                     |
| **Envelope**          | Groceries, Household, Transport, Health, Therapy, all 6 Leisure | Budget estimate + line items as she spends; the gap is what she watches. Sub-lines roll up to the group.                                                                                                         |
| **Fixed**             | Housing, Recurring                                              | _"they are unchangeable and there budget is implicitly there spend."_ Counted as consumed when the month opens, so an envelope can't be spent twice. She trues up the real bill later, _"but never by so much"_. |
| **Set-aside pot**     | Travel, Admin                                                   | Putting money in **is** the spend. The amount is still a dial: _"i cna move it around based on eneed"_.                                                                                                          |

**Charity is the only calculated line** — she sets a %, the money follows income. Note the two sides: the **allocation** is monthly (income × %); the **giving** is one yearly bucket with no month attribution (see `renderCharityTab`, 2026-08-02).

## Vocabulary — do NOT flatten these

Four words exist for money-gone and **each has a reason**. She pushed back hard on merging them:

- **Used** (Budget tab) — actual spend **or committed fixed bills, whichever is higher**. Sep Housing shows ₪3,728 Used against ₪0 of transactions. The real axis is _money she can no longer move_, not spent-vs-unspent.
- **Spent** (Admin/Travel) — cash actually out.
- **Paid** — one payment event in a log.
- **given** — tzedaka. You do not _spend_ tzedaka.

**SETTLED 2026-09-22 (full terminology audit, her ask: "analyze all מונחים and decide what is best").** One word, one meaning:

- **"Remaining" now means exactly one thing app-wide** — projected − paid, on Admin/Travel only. The Budget-ribbon tile was RETIRED, not renamed: `Remaining = Unallocated + Left to Spend` is an identity, so whenever Unallocated is 0 (her goal, the "Every shekel has a job" state) it showed the same number as the tile beside it. It carried information only when she was failing at the thing measured one tile over. The Year tab's twin became **Unspent**.
- **"Unallocated" STAYS.** Do not rename it to "Left to Budget" — two tiles reading `Left to ___` on a 412px ribbon scan worse than one, and the sub-line already says her sentence ("income not yet budgeted"). The memory file `feedback_budget_unallocated_is_key_number` proposing the rename is STALE; it predates the separate live "Left to Spend" stat.
- **"Used" stays** (she killed the "Locked" rename herself: _"why do i care about locked? is that imporatnat that it son ribbon"_). The Year tab's "Total Spent" became **Total Used**, because it counts committed bills, pot allocations AND savings — it was never "Spent".
- Per-row wording joined the **"left"** family; Travel and Admin sub-lines both say **"not yet paid"**; Charity's "Still to go out" became **"Not given yet"** (it sat 40px from "Still to go" and was a different number).
- The one shaming label is gone: Biz's red _"Should have paid until X"_ → amber **"Due by X"** / **"Paid so far"**.

## What she actually acts on

1. **Unallocated** — her zero-based number: does every shekel have a job.
2. **Savings** — the score.
3. **Where there's room to move** — the main activity. `renderRoomToMove` exists for this.

Everything else on the ribbon is arithmetic feeding those three. **Keep the ribbon uncrowded** — her explicit instruction.

## Hard rules

- **NEVER write to her budget data without her explicit go for THAT write.** Reads are free. Modelling a scenario in chat is not permission. One tagged `change_log` row per write. A number with no obvious field → ASK, never borrow a field.
- **This repo is PUBLIC and that is fine by her.** Keep OTHER people's names out of it anyway — that is their data, not hers to publish.
- **Groceries: makolet vs supermarket.** Of the stores she actually uses: Osher Ad / Yochananof / Carrefour are the supermarket; **everything else is a makolet** — Wolt, the Paz petrol station, even a pizza place she bought a drink at. `BIG_STORES` also carries Shufersal and Rami Levy (+ Hebrew spellings), which she has never used but are the same kind of chain — leave them, dropping them would misclassify her first trip to one. Source of truth = `isBigStore`.
- Household Items is split with her flatmate: she logs **what leaves her own pocket**; the other half accrues in Splitwise as owed-to-her.
- Standing build rules: TS strict, ESLint, Prettier, CI green before deploy, bump `APP_VERSION` **and** the `sw.js` VERSION together every deploy, verify at **412×892** (her phone) and not only on desktop.
