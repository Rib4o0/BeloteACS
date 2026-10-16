# Task 6 Report — Game action route

## 1) Status

**COMPLETE.** Created `app/api/rooms/[code]/actions/route.ts` implementing
`POST /api/rooms/[code]/actions`. All verification gates pass:
`npm test` 152/152 green, `npm run typecheck` clean, `npm run build` succeeds and
lists `ƒ /api/rooms/[code]/actions`.

## 2) Files changed

| File | Reason |
|------|--------|
| `app/api/rooms/[code]/actions/route.ts` | New. POST handler for game actions (bid/pass/play): resolves the room, resolves identity from the cookie, validates the body via `parseAction`, applies via `applyGameAction`, and broadcasts on success. |
| `.superpowers/sdd/belote-live-game/task-6/report.md` | This report. |

No other source files were touched. `server/game/**` untouched.

## 3) Exact commands + key output

### `npm test`
```
ℹ tests 152
ℹ suites 0
ℹ pass 152
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
(`MODULE_TYPELESS_PACKAGE_JSON` warnings are the known pre-existing noise.)

### `npm run typecheck`
```
npm notice run belote@0.1.0 typecheck
npm notice run tsc --noEmit
```
Exits clean (no diagnostics).

### `npm run build` (Step 2 of the brief)
```
✓ Compiled successfully in 2.2s
  Running TypeScript ...
  Finished TypeScript in 3.0s ...
✓ Generating static pages using 9 workers (5/5)

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/rooms/[code]/actions
├ ƒ /api/rooms/[code]/players
├ ƒ /api/rooms/[code]/stream
└   /room/[code]
  └ ◐ /room/[code]
```
`ƒ /api/rooms/[code]/actions` is listed as a dynamic route, as the brief expects.

### `npm run lint` (extra, not required)
48 pre-existing problems in `components/RoomLobby.tsx`, `components/HomeControls.tsx`,
`app/room/[code]/page.tsx`, and two test files (plus `.superpowers/**/before`
snapshot copies). **Zero** findings for `app/api/rooms/[code]/actions/route.ts`.

## 4) Self-review notes

Implemented exactly the semantics enumerated in the task brief/plan plus the
task's binding semantics:

- `await connection()` from `next/server` first (required by `cacheComponents: true`);
  no `export const dynamic` / `noStore`.
- `const { code } = await context.params;` then `findRoom(code)`; unknown room →
  `404 { ok: false, error: "room_not_found" }`.
- Identity **always** from the cookie: `await getPlayerId()`. Missing cookie →
  `{ ok: false, error: "not_a_player" }`. The `playerId` in the request body is
  never read — `parseAction` stamps the cookie id onto the action, so a
  hostile/spoofed body `playerId` is ignored (Review Focus 5).
- Body read defensively: `await request.json().catch(() => null)`.
  `parseAction(body?.action, playerId)`; `null` → `400 { ok: false, error: "bad_request" }`.
- `touchPlayer(room, playerId)` then `sweepStalePlayers(room)` **before** applying
  (same order as the Task 5 stream route).
- `applyGameAction(room, action)`:
  - success → `broadcast(room)` then `200 { ok: true }`;
  - `error === "not_started"` → `409 { ok: false, error: "not_started" }`
    (transport/state conflict: no match yet);
  - any other engine `Reason` → `400 { ok: false, error: <Reason> }`.
- The engine is never invoked with a null match: `applyGameAction` returns
  `not_started` before calling `applyAction` when `room.match` is null.

The route mirrors the existing Task 5 route conventions (`@/…` imports,
`context: { params: Promise<...> }`, `Response.json(...)`).

## 5) Concerns / deviations

1. **Failure status mapping deviates from the literal brief code.**
   The plan's Step 1 code returns `409` for *every* `applyGameAction` failure.
   This task's binding semantics explicitly require `not_started → 409` but
   **any other failure → 400 carrying the engine `Reason`**. I implemented the
   task semantics: `const status = result.error === "not_started" ? 409 : 400;`.
   Rationale: a rejected move (`not_your_turn`, `card_not_legal`, `bid_too_weak`,
   …) is a client error (400), while `not_started` is a state/transport conflict
   (409). The client (Task 11 `GameTable.send`) only reads `data.ok` / `data.error`
   and ignores the status code, so this is wire-compatible either way. If the
   reviewer prefers strict brief fidelity, change the one line to `status: 409`.

2. **`not_a_player` status: 403 (per the brief), not 401.**
   This task's prose says "If absent → 401 (the brief states the exact status/shape;
   follow it)". The brief/plan explicitly specifies `403 { ok: false, error: "not_a_player" }`,
   and the parenthetical directs following the brief. I used **403** with the brief's
   exact error string. Flagging in case 401 was actually intended — one-line change.

3. **No unit test added.** The brief prescribes no unit test for this route (a route
   imports `next/server` + `next/headers` + the `@/` alias, which `node --test`
   cannot resolve), so per instructions I performed the prescribed compile/behaviour
   checks: typecheck + build listing the route. Behaviour was verified by reading the
   call chain against the already-tested `parseAction`, `applyGameAction`,
   `touchPlayer`, and `sweepStalePlayers` units.

4. **`parseAction(body?.action, …)` vs the task prose `parseAction(body, …)`.**
   The task prose writes `parseAction(body, playerId)` as shorthand. The real body
   shape is `{ action }` (per the plan's interface and the Task 11 client, which posts
   `JSON.stringify({ action })`), and `parseAction` expects the action object itself
   (`raw.kind`). I used the brief's exact `body?.action` call, which is correct.

5. `npm run lint` still reports 48 pre-existing problems in unrelated files
   (including snapshot copies under `.superpowers/**`). Not introduced by this task;
   lint is not one of the task's gates.
