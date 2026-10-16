# Task 4 Report

## 1) Status
✅ Complete. All tests pass and typecheck is clean.

## 2) Files changed with one-line reasons
- Created `server/rooms/actionBody.test.ts` — failing tests for `parseAction` as specified in task brief
- Created `server/rooms/actionBody.ts` — implements `parseAction(raw, playerId)` that always stamps `playerId` from argument, validates shapes, returns `Action | null`
- Created `server/rooms/broadcast.test.ts` — failing tests for per-room subscriber registry (broadcast, subscribe, unsubscribe, subscriberCount, room isolation)
- Created `server/rooms/broadcast.ts` — per-room subscriber registry using `room.code` as key; stores entries with `playerId|null` + sink; `subscribe` returns unsubscribe that cleans up empty buses

## 3) Exact commands + key output
```bash
# Step 1–2: actionBody test RED
node --test --conditions=react-server server/rooms/actionBody.test.ts
# → ERR_MODULE_NOT_FOUND (expected, actionBody.ts missing)

# Step 3–4: implement + GREEN
node --test --conditions=react-server server/rooms/actionBody.test.ts
# ✓ 5 tests pass

# Step 5–6: broadcast test RED
node --test --conditions=react-server server/rooms/broadcast.test.ts
# → ERR_MODULE_NOT_FOUND (expected, broadcast.ts missing)

# Step 7–8: implement + GREEN
node --test --conditions=react-server server/rooms/broadcast.test.ts
# ✓ 4 tests pass

# Full suite
npm test
# ✓ 152 tests pass (includes actionBody + broadcast + existing)

# Typecheck
./node_modules/.bin/tsc --noEmit
# → clean (exit 0)
```

## 4) Self-review notes
- `parseAction`: only accepts objects; rejects null/non-object strings; checks `kind` values exactly; validates `card` has both suit and rank via allowlists; validates `contract` for `nt`/`at` directly, for `suit` requires valid suit string; always uses `playerId` parameter (ignores any `playerId` in body). Matches brief’s test cases.
- `broadcast.ts`: imports `buildRoomView` as a value from `./view.ts` and `Room` type from `../definitions.ts` as required. Uses module-scoped Map keyed by `room.code` stored on `globalThis` (to preserve across potential re-execution in test envs without leaks between unrelated contexts in a single process) — semantics are correct per requirement (keys on room by `room.code`, cleans up on unsubscribe when empty).
- Tests follow brief exactly; no changes to existing tests or engine code.

## 5) Concerns/deviations
None. All binding constraints satisfied:
- ESM with explicit `.ts` imports used throughout.
- `startedRoom()` calls `startGame(room, "p0")` which builds match (Tasks 1–3 done).
- Room-scoped, proper unsubscribe cleanup, returns delivery counts as specified.
- Both verification gates pass.
