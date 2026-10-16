# Task 2 Report: Presence constants + the view module

## 1. Status

**complete** — both verification gates pass (`npm test` 138/138 green, `npm run typecheck` clean).

## 2. Files changed

- **Created `server/rooms/constants.ts`** — new home for `MAX_PLAYERS`, `MAX_PLAYERS_PER_TEAM`, `HEARTBEAT_TIMEOUT_MS` (verbatim from the brief).
- **Created `server/rooms/view.ts`** — `RoomPlayer` / `RoomView` types, `seatPlayers` (team A → seats 0/2, team B → seats 1/3, join order preserved), and `buildRoomView` (lobby/playing state, membership-aware `you`, spectator-safe `publicState`). Imports `publicState` as a value from `"../game/index.ts"` and types from `"../definitions.ts"`, per the Node-ESM constraint.
- **Created `server/rooms/view.test.ts`** — the six tests from the brief, using the `startPlaying(room)` helper (builds the match directly via `createMatch`; does not touch `startGame`, which is Task 3).
- **Modified `server/Rooms.ts`** — removed the three duplicated `export const` declarations; now imports them from `./rooms/constants.ts` and re-exports them so `Rooms.test.ts`, `app/room/[code]/page.tsx`, and the players poll route keep importing from `@/server/Rooms` unchanged.

Nothing under `server/game/**` was modified.

## 3. Commands + key output

**Failing test first (expected failure confirmed):**
```
$ node --test --conditions=react-server server/rooms/view.test.ts
ERR_MODULE_NOT_FOUND: url: 'file:///Users/Rosen/WebstormProjects/belote/server/rooms/view.ts'
```
Fails for the expected reason: missing module `./view.ts`.

**After implementation, single file:**
```
$ node --test --conditions=react-server server/rooms/view.test.ts
✔ seatPlayers seats team A at 0/2 and team B at 1/3 in join order
✔ buildRoomView reports the lobby before the game starts
✔ buildRoomView treats a non-member as a spectator
✔ buildRoomView exposes only the viewer's own cards once playing
✔ buildRoomView hands a late-joining viewer the current state
✔ buildRoomView reveals no cards to a spectator
ℹ tests 6  ℹ pass 6  ℹ fail 0
```

**Full suite:**
```
$ npm test
ℹ tests 138
ℹ pass 138
ℹ fail 0
```
(Only pre-existing `MODULE_TYPELESS_PACKAGE_JSON` warnings; no new warnings.)

**Typecheck:**
```
$ npm run typecheck
(no output — clean)
```

## 4. Self-review notes

- **RED → GREEN discipline followed.** Tests written first, failure confirmed as `ERR_MODULE_NOT_FOUND` for `view.ts`, then implementation added. No test was weakened or deleted; the full suite went from 132 to 138 tests (the six new view tests) with zero regressions.
- **Constant move is safe.** Verified via grep: every external importer of `HEARTBEAT_TIMEOUT_MS` / `MAX_PLAYERS` / `MAX_PLAYERS_PER_TEAM` imports from `@/server/Rooms` (the poll route, the room page, `Rooms.test.ts`) — all satisfied by the re-export, and `Rooms.ts` itself still uses the constants internally. No pre-existing test needed fixing.
- **Node-ESM constraints respected.** `view.ts` imports the `publicState` VALUE from `"../game/index.ts"` with the `.ts` extension (required for `node --test`); `view.test.ts` imports `createMatch` from `"../game/index.ts"` and uses the brief's `startPlaying(room)` helper, avoiding `startGame` (Task 3 scope).
- **`seatPlayers` return type.** The brief's interface section declares `[PlayerId, PlayerId, PlayerId, PlayerId]` while its code block (which I followed verbatim) uses `[string, string, string, string]`. Since `PlayerId = string` these are structurally identical; no conflict.
- **Spectator safety.** `buildRoomView(room, "ghost")` yields `you: null` and, when playing, `publicState(match, "")` which reveals no cards (test asserts `hand.hand` is `[]`).

## 5. Concerns / deviations

- **None beyond one observation.** `buildRoomView` computes `member` but still calls `publicState` for spectators with `""` as the viewer id. This is harmless (spectators see zero cards, verified by test) and matches the brief exactly, but if a spectator ever needs *no* match payload at all, callers can filter on `you === null`.
- `seatPlayers` assumes the roster is complete (two players per team). With a partial roster it returns `undefined` slots. This is fine for its call sites in Tasks 3+ (after `startGame`'s `need_four` check) but is worth remembering if it ever gets called from the lobby.
- No git commands were run (per instructions; no repository exists).
