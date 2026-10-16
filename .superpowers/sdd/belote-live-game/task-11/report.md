# Task 11 Report — `GameTable` component

## 1) Status

**COMPLETE.** All verification gates pass:

- `npm test` — **157 pass, 0 fail** (157 tests).
- `npm run typecheck` — **clean** (no output).
- `npm run build` — **succeeds**.

The brief's code was applied **verbatim**; no adaptation was required.

## 2) Files changed

| File | Reason |
| --- | --- |
| `components/GameTable.tsx` (created) | New client component rendering bidding/trick play, scoreboard, seats, hand, optimistic card echo, and action POSTs to `/api/rooms/[code]/actions`. Copied exactly from brief Step 1. |
| `components/RoomLobby.tsx` (modified) | Added `import GameTable from "./GameTable";` and replaced the "The game is starting…" placeholder with `<GameTable code={code} players={players} match={room.match} />`, keeping the `Dealing…` branch (brief Step 2). |

No other files touched. `server/game/**` untouched.

## 3) Exact commands + key output

```
$ npm run typecheck
npm notice run belote@0.1.0 typecheck
npm notice run tsc --noEmit
(no diagnostics — clean)
```

```
$ npm test
...
✔ parses a pass and stamps the cookie player id (1.73275ms)
✔ buildRoomView exposes only the viewer's own cards once playing (1.605417ms)
✔ buildRoomView hands a late-joining viewer the current state (0.378917ms)
ℹ tests 157
ℹ suites 0
ℹ pass 157
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 803.091292
```
(`MODULE_TYPELESS_PACKAGE_JSON` lines are the pre-existing warnings noted in the task context.)

```
$ npm run build
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully in 1000ms
  Running TypeScript ...
  Finished TypeScript in 3.8s ...
✓ Generating static pages using 8 workers (5/5) in 921ms
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/rooms/[code]/actions
├ ƒ /api/rooms/[code]/stream
└   /room/[code]
```

## 4) Self-review notes

- **Client/engine boundary respected:** `GameTable.tsx` imports only `import type { Card, PublicMatch, Seat }` and `import type { RoomPlayer }`; `SEATS` is defined locally (`const SEATS: Seat[] = [0, 1, 2, 3];`). No engine *value* is imported. The build output confirms the client bundle compiles.
- **Interfaces verified against source before writing:**
  - `PublicMatch`/`PublicHand` in `server/game/engine.ts` (lines 240–271) match the brief exactly.
  - `HandOutcome` in `server/game/scoring.ts` (lines 12–22) has `raw`, `gamePoints`, `dedans`, `capot`, `taker`.
  - `RoomPlayer` in `server/rooms/view.ts` matches (`id`, `name`, `team`, `host`, `connected`).
  - `Action` union in `server/game/types.ts` — `{kind:"bid"; contract}` / `{kind:"pass"}` / `{kind:"play"; card}`.
  - Actions route (`app/api/rooms/[code]/actions/route.ts`) returns `{ok:true}` (200) on success and `{ok:false, error}` on failure — matching `send`/`describe`.
- **Discriminated-union narrowing in the bid buttons:** `match.legal.filter((a) => a.kind === "bid").map((a) => a.contract ...)` compiles under this project's TypeScript 5.9.3 (inferred type predicates), confirmed by the clean typecheck. No adaptation needed.
- **Optimistic play flow:** `useEffect` clears `optimisticCard`/`pending` when `match` changes; the played card is filtered out of the hand and echoed as a dashed chip until the server frame arrives — consistent with the brief.
- `cardLabel`, `contractLabel`, `isPlayable` consumed from `./table` exactly as specified; `screenSlot`/`rankLabel`/`suitSymbol` remain available but are not needed by this component (they are used/exported by Task 10's `table.ts`).

## 5) Concerns / deviations

**None.** The brief's code was written literally; it typechecked and built on the first attempt. No diff/adaptation was required.

Minor, non-blocking observations (not changes):
- `cardLabel` only labels at rank+suit; that is the established Task 10 helper behavior, fine for this UI.
- The component has no unit test of its own (the brief requested none, and the task says not to add/weaken tests); the file is exercised by `npm run build` compilation and covered indirectly by engine/room view tests.

## Fix round 1

Reviewer defect: `send()` set an optimistic card on play, but on a rejected action
(`{ ok: false, error }`) it only set the error and never cleared the optimistic card. The
actions route does not broadcast on failure, so the played card stayed hidden and rendered as a
`you: <card>` ghost until some unrelated broadcast arrived.

### Exact change (applied identically in two places)

`components/GameTable.tsx` (real source) and, to keep the plan self-consistent,
`docs/superpowers/plans/2026-10-14-belote-live-game.md` (Task 11, Step 1 code block):

```diff
       const data = await response.json();
-      if (!data.ok) setError(describe(data.error));
+      if (!data.ok) {
+        setError(describe(data.error));
+        setOptimisticCard(null);
+      }
     } catch {
       setError("Could not reach the server");
     } finally {
```

Nothing else changed. `server/game/**` untouched; no git commands run; no tests weakened/added.

### Brief regenerated + byte-for-byte check

Regenerated:

```
$ bash .superpowers/sdd/belote-live-game/extract-task.sh docs/superpowers/plans/2026-10-14-belote-live-game.md 11 > .superpowers/sdd/belote-live-game/task-11/brief.md
(exit 0, no output)
```

The regenerated brief contains two ```tsx fenced blocks: Step 1 (the full component file,
lines 14–225) and Step 2 (the `RoomLobby.tsx` swap, lines 231–237). Extracting only the Step 1
block and diffing it against the source:

```
$ sed -n '14,225p' .superpowers/sdd/belote-live-game/task-11/brief.md > /tmp/brief_step1.tsx
$ diff -u components/GameTable.tsx /tmp/brief_step1.tsx
$ echo "diff exit: $?"
diff exit: 0
```

**Result: identical, byte-for-byte** (empty diff, exit 0) — brief Step 1 ↔ `components/GameTable.tsx`.

### Verification gates (all pass)

```
$ npm run typecheck
npm notice run belote@0.1.0 typecheck
npm notice run tsc --noEmit
(no diagnostics — clean)
```

```
$ npm test
...
ℹ tests 157
ℹ suites 0
ℹ pass 157
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 961.239708
```

```
$ npm run build
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully in 514ms
  Running TypeScript ...
  Finished TypeScript in 1294ms ...
✓ Generating static pages using 8 workers (5/5) in 557ms
  Finalizing page optimization ...
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/rooms/[code]/actions
├ ƒ /api/rooms/[code]/stream
└   /room/[code]
  └ ◐ /room/[code]
```

- `npm run typecheck` — clean.
- `npm test` — all green (**157 pass, 0 fail**).
- `npm run build` — succeeds.

No new concerns. Fix round 1 complete.

## Fix round 2

Reviewer defect (same class as fix round 1, but on the network-error path): in `send()`, the
`catch` block set an error message but did not clear the optimistic card. Round 1 fixed only the
`{ ok: false }` rejection path. On a network failure no broadcast is guaranteed, so a played card
would remain hidden from the hand and render as a `you: <card>` ghost indefinitely.

### Exact change (applied identically in two places)

`components/GameTable.tsx` (real source) and, to keep the plan self-consistent,
`docs/superpowers/plans/2026-10-14-belote-live-game.md` (Task 11, Step 1 code block):

```diff
       const data = await response.json();
       if (!data.ok) {
         setError(describe(data.error));
         setOptimisticCard(null);
       }
     } catch {
       setError("Could not reach the server");
+      setOptimisticCard(null);
     } finally {
       setPending(false);
     }
```

Nothing else changed. `server/game/**` untouched; no git commands run; no tests weakened/added.

### Brief regenerated + byte-for-byte check

Regenerated:

```
$ bash .superpowers/sdd/belote-live-game/extract-task.sh docs/superpowers/plans/2026-10-14-belote-live-game.md 11 > .superpowers/sdd/belote-live-game/task-11/brief.md
extract exit: 0
```

The Step 1 fenced block is the full component file. Because the change added a line inside the
block, the block now spans **lines 14–226** of the regenerated brief (fence opens line 13, closes
line 227), one line longer than the 14–225 range used in round 1. Confirmed with the requested
extraction and `diff -u`:

```
$ sed -n '14,225p' .superpowers/sdd/belote-live-game/task-11/brief.md > /tmp/brief_step1.tsx
$ diff -u components/GameTable.tsx /tmp/brief_step1.tsx
@@ -210,4 +210,3 @@
     room_not_found: "This room no longer exists",
   };
   return messages[error] ?? "That move was rejected";
-}
```

The stale 14–225 range simply clips the final `}` (the off-by-one is the added line). Re-running
with the corrected, fence-accurate range:

```
$ sed -n '14,226p' .superpowers/sdd/belote-live-game/task-11/brief.md > /tmp/brief_step1.tsx
$ diff -u components/GameTable.tsx /tmp/brief_step1.tsx
$ echo "diff exit: $?"
diff exit: 0
```

**Result: identical, byte-for-byte** (empty diff, exit 0) — brief Step 1 ↔ `components/GameTable.tsx`.

### Verification gates (all pass)

```
$ npm run typecheck
npm notice run belote@0.1.0 typecheck
npm notice run tsc --noEmit
typecheck exit: 0
(no diagnostics — clean)
```

```
$ npm test
...
ℹ tests 157
ℹ suites 0
ℹ pass 157
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 548.23525
test exit: 0
```

```
$ npm run build
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully in 563ms
  Running TypeScript ...
  Finished TypeScript in 1320ms ...
✓ Generating static pages using 8 workers (5/5) in 503ms
  Finalizing page optimization ...
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/rooms/[code]/actions
├ ƒ /api/rooms/[code]/stream
└   /room/[code]
  └ ◐ /room/[code]
build exit: 0
```

- `npm run typecheck` — clean (exit 0).
- `npm test` — all green (**157 pass, 0 fail**).
- `npm run build` — succeeds (exit 0).

No new concerns. Fix round 2 complete.
