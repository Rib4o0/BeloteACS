# Task 5 Report: SSE stream route

## 1. Status

**COMPLETE.** All three verification gates are green:

- `npm test` — 152/152 tests pass, 0 fail.
- `npm run typecheck` — clean (no output).
- `npm run build` — succeeds; route listed as `ƒ /api/rooms/[code]/stream`.

## 2. Files changed

- **Created** `app/api/rooms/[code]/stream/route.ts` — the single live SSE channel
  (`GET /api/rooms/[code]/stream`). Implemented exactly as specified in the brief
  (Step 1), including the `connection()` opt-in, 404 on unknown room, initial
  snapshot, 5s keepalive that also refreshes the heartbeat, and a `cancel()`
  that clears the interval and unsubscribes.

No other files were touched. `server/game/**` was not modified.

## 3. Exact commands + key output

### `npm run typecheck`
```
npm notice run belote@0.1.0 typecheck
npm notice run tsc --noEmit
```
No diagnostics. Clean.

### `npm test`
```
ℹ tests 152
ℹ suites 0
ℹ pass 152
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 465.427458
```
All suites green. (`MODULE_TYPELESS_PACKAGE_JSON` warnings are pre-existing noise.)

### `npm run build`
```
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully in 918ms
  Running TypeScript ...
  Finished TypeScript in 2.1s ...
✓ Generating static pages using 8 workers (5/5) in 485ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/rooms/[code]/players
├ ƒ /api/rooms/[code]/stream
└   /room/[code]
  └ ◐ /room/[code]
```
Expected marker `ƒ /api/rooms/[code]/stream` is present.

## 4. Self-review notes

Verified each binding constraint and semantic against the checked-in code:

- **Request-time opt-in**: route calls `await connection()` from `next/server`.
  No `export const dynamic`, no `noStore`. Build confirms it is dynamic (`ƒ`).
- **Room resolution + 404**: `findRoom(code)` resolves `params.code`; returns
  `new Response("Room not found", { status: 404 })` when absent — the client page
  shows its notice.
- **playerId resolution**: `getPlayerId()` (`string | undefined`) is coerced to
  `null` for `buildRoomView` / `subscribe`. A spectator (undefined) is simply not
  touched.
- **Sweep + touch on connect**: `touchPlayer(room, playerId)` (boolean ignored),
  then `sweepStalePlayers(room)`, then `broadcast(room)` so existing viewers see
  the roster change.
- **Immediate snapshot (Review Focus 1)**: right after `subscribe`, the stream
  enqueues `buildRoomView(room, playerId)` so a mid-hand opener gets current state
  at once.
- **SSE frame shape**: `event: state\ndata: ${JSON.stringify(view)}\n\n` matches the
  brief's declared `text/event-stream` of `event: state` frames carrying a `RoomView`.
- **Keepalive**: `setInterval(..., 5000)` writes `:keepalive\n\n` (comment line keeps
  the connection open) and, when `playerId` is defined, calls `touchPlayer` to
  refresh the heartbeat, so a live connection never goes stale.
- **No leaks on cancel**: `cancel()` sets `closed = true`, `clearInterval(keepalive)`,
  calls the `unsubscribe()` returned by `subscribe`, then sweeps/broadcasts.
- **Headers**: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`,
  `Connection: keep-alive`, `X-Accel-Buffering: no` — as the brief specified.
- **API signatures confirmed** against source: `touchPlayer(room, playerId, now?) => boolean`,
  `sweepStalePlayers(room, now?) => void`, `subscribe(room, playerId|null, sink) => () => void`,
  `broadcast(room)`, `buildRoomView(room, playerId|null) => RoomView`, `findRoom(code)`.

## 5. Concerns / deviations

None. The implementation matches the brief verbatim. Two minor observations:

- The brief's keepalive comment line is `:keepalive\n\n`; the task summary mentioned
  `:\n\n` as an example. The brief is authoritative, so the exact brief form was used.
  Both are valid SSE comment lines.
- The brief specifies no unit test for the route (routes are hard to unit-test under
  `node --test`); the prescribed compile/behaviour checks (build + typecheck + full
  suite) were run instead, all green.
