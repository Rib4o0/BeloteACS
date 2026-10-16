# Task 1 Report — Unify card types and extend the Room model

## 1. Status
**complete**

## 2. Files changed

| Path | Reason |
| --- | --- |
| `server/Rooms.test.ts` | Appended the two TDD tests from the brief (`createRoom starts with no match and a seeded rng`, `createRoom accepts a seed for a reproducible rng`). No existing tests were weakened or removed. |
| `server/definitions.ts` | Replaced wholesale per the brief: dropped the legacy `Card` type and `Player.cards`; imported `Match`/`Rng` from the engine; added `match: Match \| null` and `rng: Rng` to `Room`. |
| `server/Rooms.ts` | Added value import `seededRng` from `./game/index.ts`; added `randomSeed()` helper; `createRoom(seed?)` now sets `match: null` and `rng: seededRng(seed ?? randomSeed())`; removed `cards: []` from the new-player literal in `joinRoom`. |
| `.next/types/validator.ts` (generated) | Regenerated via `npx next typegen` to drop a stale reference to a deleted route (`app/api/probe-tmp/route.ts`). Build artifact, not source. See notes. |

No changes under `server/game/**`.

## 3. Commands run and key output

**Step 2 — confirm the new tests fail (before implementation):**
```
node --test --conditions=react-server server/Rooms.test.ts
```
Result: 2 failures, exactly as the brief predicted:
- `createRoom starts with no match...` → `actual: undefined, expected: null` (room.match)
- `createRoom accepts a seed...` → `TypeError: a.rng is not a function`

**Step 5a — single file after implementation:**
```
node --test --conditions=react-server server/Rooms.test.ts
```
Result: `tests 29`, `pass 29`, `fail 0`.

**Step 5b — typecheck (first run surfaced a stale generated error):**
```
npm run typecheck
```
Result (initial): `.next/types/validator.ts(92,39): error TS2307: Cannot find module '../../app/api/probe-tmp/route.js'`. This is a stale Next generated route-type file referencing a route that no longer exists; unrelated to this task (the file is not in source). Recovered by regenerating:
```
npx next typegen        # ✓ Types generated successfully
```
Re-run:
```
npm run typecheck
```
Result: **clean, no errors**.

**Step 6 — full suite:**
```
npm test
```
Result: `tests 132`, `pass 132`, `fail 0` (130 pre-existing + 2 new). The `MODULE_TYPELESS_PACKAGE_JSON` warning is pre-existing noise, ignored as instructed.

## 4. Self-review notes

- **Import style matches the ESM constraint.** `server/Rooms.ts` imports the engine *value* `seededRng` with a relative path and explicit `.ts` extension (`./game/index.ts`), so it resolves under `node --test` without the bundler. `definitions.ts` uses a type-only import from `./game/index.ts` (erased at runtime). Both pass `node --test` and `tsc`.
- **Seed reproducibility verified by the test**, not just asserted structurally: two rooms seeded with `1234` produce identical successive `rng()` values. `randomSeed()` uses `>>> 0` to keep seeds in the uint32 range `seededRng` expects.
- **No dangling references to the removed API.** Grepped the whole repo (`*.ts`/`*.tsx`) — the only consumers of `definitions.Card` and `Player.cards` were `definitions.ts` itself and the `cards: []` line removed from `Rooms.ts`; no component, action, or test referenced them. Typecheck confirms.
- **No `Room` literal elsewhere needed updating** — all rooms come from `createRoom`; no test or source constructs a `Room` object literally.
- I did **not** touch `server/game/**`; the engine's `Card`/`Match` are now the single source of truth for card shape (via `Match`, which embeds `cards.ts` types).

## 5. Concerns / deviations

1. **Brief vs. task-context wording on "re-exports".** The task context says `server/definitions.ts` "re-exports" the engine's `Card`/`Match` types. The brief's exact Step 3 code does **not** re-export `Card` — it only imports `Match`/`Rng` and removes `Card` entirely. I followed the brief exactly (it is the authoritative, precise instruction). Nothing in the codebase imports `Card` from `definitions`, so this is safe. If a later task expects `import type { Card } from "@/server/definitions"` to work, it will need to import from `@/server/game/index.ts` (or `definitions.ts` will need `export type { Card } from "./game/index.ts"`). Flagging in case the plan intends otherwise.
2. **Regenerated `.next/types/validator.ts`.** The typecheck gate was blocked by stale generated Next route types referencing a deleted `app/api/probe-tmp/route.ts` — this predates my change. I regenerated with `npx next typegen` rather than hand-editing or deleting the generated file, which is the correct way to refresh it. This is a build artifact (`.next/`), not source, so no source file was altered by this. If the environment is expected to produce a clean typecheck without regeneration, the stale temporary route was likely left behind by an earlier task/session.
