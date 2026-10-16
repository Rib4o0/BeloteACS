# Task 8 + 9 Report — Server-rendered initial view, stream hook, container refactor, remove poll route

## 1) Status
**Complete.** Both coupled tasks landed together. All verification gates pass:
- `npm test` → 152 pass, 0 fail
- `npm run typecheck` → clean
- `npm run build` → succeeds; route list no longer contains `players`

## 2) Files changed

| File | Change | Reason |
| --- | --- | --- |
| `app/room/[code]/page.tsx` | Modified | Server-renders the initial `RoomView` via `buildRoomView`; passes `{ code, currentPlayerId: playerId, initial }` to `RoomLobby`; renders "Room not found." when `findRoom` returns nothing; uses `await connection()` (cacheComponents). Removed the old inline player mapping + `HEARTBEAT_TIMEOUT_MS` import. |
| `components/useRoomStream.ts` | Created | New `useRoomStream(code, initial): { room, connected }` hook. Opens an `EventSource` to `/api/rooms/${code}/stream`, parses `state` frames into `RoomView` state, tracks `connected` on open/error, and closes the source on unmount. |
| `components/RoomLobby.tsx` | Modified | Props are now `{ code, currentPlayerId: string | undefined, initial: RoomView }`. Drives `players`/`playing` from the stream; keeps optimistic `pendingTeam` overlay + `starting` flag; adds `Reconnecting…` hint; replaces the old "Game started" branch with the temporary placeholder branch. Deleted `refresh`/`useCallback`, the poll `useEffect` + `setInterval`, the `mounted` ref, the local `players`/`playing` `useState`, and the now-unused `PlayerRow` helper (its only use was the removed "Game started" branch). |
| `app/api/rooms/[code]/players/route.ts` | Deleted | Poll endpoint is replaced by the SSE stream. Empty `players/` dir removed too. |
| `components/lobby.ts` | Unchanged | No alias needed: `RoomPlayer` and `LobbyPlayer` are structurally identical, so `assignTeam`/`allTeamsPicked`/`seatSlots` accept `RoomView["players"]` directly. |

## 3) Exact commands + key output

```
$ npm run typecheck
npm notice run belote@0.1.0 typecheck
npm notice run tsc --noEmit
(no output — clean)
```

```
$ npm test   # tail
ℹ tests 152
ℹ suites 0
ℹ pass 152
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 403.507292
```
(`MODULE_TYPELESS_PACKAGE_JSON` warnings are the pre-existing noise noted in the brief.)

```
$ npm run build   # tail
▲ Next.js 16.4.0 (Turbopack)
- Cache Components enabled
✓ Compiled successfully in 698ms
  Running TypeScript ...
  Finished TypeScript in 1578ms ...
✓ Generating static pages using 8 workers (5/5) in 497ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/rooms/[code]/actions
├ ƒ /api/rooms/[code]/stream
└   /room/[code]
  └ ◐ /room/[code]
```
`players` is absent from the route list. Note: an initial `npm run typecheck` before the build failed on the **stale generated** `.next/types/validator.ts` (still referencing the deleted route). `next build` regenerates `.next/types`, after which typecheck is clean. Order matters for a fresh checkout: build regenerates types.

## 4) Self-review notes
- **Type-only imports:** `useRoomStream.ts` and `RoomLobby.tsx` import `RoomView`/`Team` with `import type`; nothing from `server/game/**` or `server/rooms/view` is imported as a runtime value into a client component. `useRoomStream` is erased-style safe.
- **`currentPlayerId` stays `string | undefined`:** the page passes the raw `await getPlayerId()` result; no `?? null` coercion. Only `buildRoomView(room, playerId ?? null)` coerces, which is its intended signature.
- **Optimistic behavior preserved:** `pendingTeam` overlay is applied via `assignTeam(room.players, …)` and cleared by an effect once the server echoes the same team; `starting` keeps the "Dealing…" state until the first `match` frame arrives. `playing = room.playing || (starting && room.match === null)`.
- **Unchanged lobby JSX:** seat grid, team picker, Start button, Leave form, and `RoomCodeModal` are byte-for-byte the previous JSX (only the surrounding state derivation changed).
- **Removed dead code:** `PlayerRow` had its only usage in the removed "Game started" branch, so it was deleted rather than left unused.
- **SSE cleanup:** the hook removes the `state` listener and calls `source.close()` in the effect cleanup.
- **No git, no `server/game/**` changes, no tests weakened/deleted.**

## 5) Concerns / deviations
- **GameTable placeholder:** Per the brief, the `playing` branch renders `<p className="text-sm text-zinc-500">The game is starting…</p>` where `room.match` is truthy (and `<p …>Dealing…</p>` when `room.match === null`). `GameTable` is **not** imported. Task 11 must swap the placeholder for `<GameTable code={code} players={players} match={room.match} />` and add its import.
- **`players` type is a structural union** (`LobbyPlayer[] | RoomPlayer[]`) because the optimistic overlay path calls `assignTeam` while the stream path returns `room.players`. This is safe because the two types are identical, but a future divergence between `LobbyPlayer` and `RoomPlayer` would surface here. No `lobby.ts` alias was added since none was needed.
- **`connected` initial value is `false`** (exactly per the plan), so the amber `Reconnecting…` hint is visible for the brief moment between first paint and the SSE `onopen`. This matches the prescribed code; flagging only as a UX observation.
- **Third-party imports removed from the page:** `HEARTBEAT_TIMEOUT_MS` is no longer imported by `page.tsx`; the liveness computation now lives solely in `buildRoomView`.
