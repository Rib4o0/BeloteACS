# Belote — Live Game (SSE transport + table UI) — Design

Date: 2026-10-14
Status: approved for implementation planning
Depends on: `server/game/` engine (complete, 130 tests green)

## 1. Context

The lobby is done: players join a room by code, pick a team, and the host starts
the game. Room state lives in memory on `globalThis.rooms` (`server/Rooms.ts`)
and the client polls `POST /api/rooms/[code]/players` every 2s.

The pure, deterministic rules engine is also done (`server/game/`): it exposes
`createMatch`, `applyAction`, `legalActions`, and `publicState`, with all rules
and scoring tested. It has no I/O and no transport.

This spec covers the missing middle: **getting the engine into four players'
browsers, live**, and a first **functional table UI**. It replaces the polling
transport with a single Server-Sent Events (SSE) channel and wires the engine
into the room.

## 2. Goal

Four players already in a room, having picked teams, press **Start** and play a
full hand: deal → bidding → 8 tricks → scoring, with each opponent's move
appearing live. Reconnecting keeps your seat. A second device/browser sees the
same table. The server is authoritative over the rules at all times.

### Success criteria

- Start deals a hand and every client moves to the table.
- Bid, pass, and card plays are validated server-side; illegal actions are
  rejected with the engine's reason.
- All four players see consistent state; only your own cards are visible.
- A full hand scores correctly and the running score updates; capot and the
  151-win rule apply.
- Refreshing or reconnecting returns you to the table with your hand intact.
- Verified in a real browser across multiple player sessions (not just
  compilation).

### Non-goals (this iteration)

- Declarations (belote/royal, sequences, carrés) — deferred engine layer.
- Bots / AI players.
- Persistence (rooms and matches stay in memory; a restart clears them).
- Card art, animations, sound.
- Reconnecting under a *different* cookie, rich spectating, or chat.

## 3. Current state (what we build on)

- `server/Rooms.ts` — `joinRoom`, `chooseTeam`, `startGame`, `leaveRoom`,
  `touchPlayer`, `sweepStalePlayers`, `findRoom`, `createRoom`. Source of truth
  for roster and teams.
- `server/definitions.ts` — `Room { code, game }`, `Game { playing, players }`,
  `Player { id, name, host, team?, cards, lastSeen? }`, legacy
  `Card { suit: string, rank: number }`.
- `server/actions.ts` — server actions for join / create / team / start / leave.
- `components/RoomLobby.tsx` — client lobby, 2s poll + optimistic updates.
- `app/api/rooms/[code]/players/route.ts` — the poll endpoint (to be removed).
- `app/room/[code]/page.tsx` — room page, `await connection()`.
- `server/player.ts` — `getPlayerId` / `getOrCreatePlayerId` via httpOnly cookie.
- `server/game/` — the engine.

## 4. Decisions (agreed)

1. **SSE is the single live channel.** It carries presence, the lobby roster,
   and game state. The 2s poll is removed.
2. **Seat mapping by join order within team.** Team A → seats 0, 2; team B →
   seats 1, 3, in each team's join order.
3. **Functional table UI** — clarity over polish; no card art or animation.
4. **Push each player's tailored state** (approach A). The server computes
   `publicState(match, playerId)` per subscriber and pushes it; the client is a
   pure renderer. Actions POST; the resulting broadcast updates everyone.

## 5. Data model

### 5.1 Engine types are authoritative

The legacy `definitions.Card` is removed. `server/definitions.ts` no longer
declares card types; the engine's `Card` (`server/game/cards.ts`) is the only
one. `Player.cards` is deleted (hands are private state inside the `Match`).

### 5.2 Room

```ts
import type { Match, Rng } from "@/server/game";

export type Room = {
  code: string;
  game: Game;
  /** The live match once started; null in the lobby. */
  match: Match | null;
  /** Persistent RNG so every deal in the match is deterministic and distinct. */
  rng: Rng;
};

export type Game = {
  playing: boolean;   // true once the match is created
  players: Player[];
};
```

`rng` is a mulberry32 closure held in memory (never serialized). `room.rng` is
created once when the room is created, so successive deals advance the stream.
`match` and `rng` are server-only.

### 5.3 Player

```ts
export type Player = {
  id: string;
  name: string;
  host: boolean;
  team?: Team;
  lastSeen?: number;
};
```

(`cards` removed.)

## 6. Seat mapping

```ts
// server/rooms/view.ts
export function seatPlayers(
  players: Player[],
): [PlayerId, PlayerId, PlayerId, PlayerId];
```

- Team A players, in roster (join) order → seat 0 then seat 2.
- Team B players, in roster order → seat 1 then seat 3.
- Precondition: exactly four players, each with a team (guaranteed by
  `startGame`'s existing checks). Called only at start; the mapping is then
  frozen for the match.

Partners are always opposite (0↔2, 1↔3, matching `teamOf`). Turn order runs
counter-clockwise through seats 0→1→2→3.

## 7. Room manager (`server/Rooms.ts`)

Existing functions keep their behavior. Changes:

- `createRoom()` also creates `match: null` and `rng: seededRng(...)`.
- `startGame(room, actorId)` keeps its checks, then on success:
  `room.match = createMatch(seatPlayers(room.game.players), room.rng)` and
  `room.game.playing = true`.
- New:

```ts
export type GameActionResult =
  | { ok: true }
  | { ok: false; reason: Reason };

export function applyGameAction(
  room: Room,
  playerId: PlayerId,
  action: Action,
): GameActionResult;
```

It requires `room.match`, calls
`applyAction(room.match, action, room.rng)`, stores the returned match, and
reports `{ ok: false, reason }` when the engine returns an error.

- `sweepStalePlayers` is generalized to the new presence model (§9).

## 8. The `RoomView` envelope

One shape, sent on connect and on every change, tailored per viewer:

```ts
// server/rooms/view.ts
export type RoomPlayer = {
  id: string;
  name: string;
  team: Team | null;
  host: boolean;
  connected: boolean;
};

export type RoomView = {
  playing: boolean;
  players: RoomPlayer[];       // roster: id, name, team, host, connected
  you: string | null;          // the viewer's playerId (or null = spectator)
  match: PublicMatch | null;   // null in the lobby; hand hidden except your own
};

export function buildRoomView(room: Room, playerId: string | null): RoomView;
```

`RoomPlayer` is defined server-side (rather than reusing the client's
`LobbyPlayer`) so the server modules never depend on `components/`; the client's
`LobbyPlayer` keeps the same shape and stays a client concern.

`buildRoomView` is the **single** function used by both the SSE stream and the
room page's server render, so there is one source of the view. It reuses
`publicState(room.match, playerId)` for the match portion and the existing
roster shaping for the lobby portion.

## 9. Presence and lifecycle

- A **subscriber registry** lives on `globalThis`, keyed by room code:
  `Map<string, Set<Subscriber>>`, `Subscriber = { playerId, send(view) }`.
- **Connection lifetime = presence.** On SSE connect the player's `lastSeen` is
  set; on disconnect it is set again (so a reconnect within the grace window is
  seamless).
- **Grace:** `PRESENCE_GRACE_MS = 5000`. A pre-start player with no open
  subscriber and `lastSeen` older than the grace is removed (survives a
  refresh). Once `playing`, seats are never freed — a disconnected player shows
  **away** and keeps their seat (existing rule).
- Sweeping happens lazily whenever the room is touched (connect, disconnect,
  action), as today.

## 10. SSE stream

`GET /api/rooms/[code]/stream` (`await connection()`):

- 404 when the room is unknown.
- Resolves `playerId` from the httpOnly cookie (`getPlayerId`); an unknown
  player is a read-only spectator (`you: null`).
- Responds `Content-Type: text/event-stream`, `Cache-Control: no-cache,
  no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- Registers the subscriber, then immediately writes the current view as
  `event: state`.
- Keepalive comment (`:\n\n`) every ~15s to hold intermediaries open.
- On stream cancel/abort: unregister, update `lastSeen`, sweep, broadcast.
- `broadcast(room)` computes `buildRoomView` for each subscriber and writes it.
  It is called after every mutation: connect, disconnect, join, team, start,
  leave, and game action.

## 11. Actions

`POST /api/rooms/[code]/actions`:

- Body: `{ action: Action }` (an engine `bid` / `pass` / `play`). The
  `playerId` is taken from the **cookie**, never the body.
- 404 unknown room; 409/400 when the match hasn't started or the body is
  malformed.
- Calls `applyGameAction`, broadcasts on success, and returns
  `{ ok: true }` or `{ ok: false, error: Reason }`.

Lobby mutations (join / team / start / leave) remain **server actions**; each
calls `broadcast(room)` after mutating so all clients update immediately. The
actor's optimistic UI already covers the round-trip.

## 12. Client

### 12.1 Stream hook

```ts
// components/useRoomStream.ts
function useRoomStream(code: string, initial: RoomView): {
  room: RoomView;
  connected: boolean;
};
```

- Opens `new EventSource(/api/rooms/${code}/stream)`; applies `state` events to
  `room`; reports `connected` from the open/error lifecycle.
- `EventSource` reconnects automatically; the server re-snapshots on connect, so
  recovery needs no client logic.
- The page server-renders the initial `RoomView`, passed as `initial`, so there
  is no blank flash before the first event.

### 12.2 Container and views

- `RoomLobby` becomes a container: `useRoomStream`, then render `<LobbyView>` or
  `<GameTable>` from `room` (`playing` / `match`).
- `LobbyView` is today's lobby UI, now driven by pushed state (no polling),
  keeping the existing optimistic team/start handling.
- `GameTable` (new) arranges seats relative to `match.you`:
  - you at the bottom, partner (you+2) at the top, opponents (you+1, you+3) at
    the sides;
  - each non-you seat shows name, team, **away** marker, and card count;
  - your hand renders as clickable cards; a card is playable iff it appears in
    `match.legal` (matched by suit+rank); disabled otherwise or when it isn't
    your turn;
  - the current trick is centred, with trump, contract, taker, and the
    active-seat highlight; completed-trick count is shown;
  - bidding: when `phase === "bidding"` and it's your turn, show a button per
    legal bid plus **Pass**, and show the current top bid and bidder;
  - a scoreboard: Team A / Team B running scores, hand number, dealer;
  - a banner for the last hand's outcome and, once `winner` is set, the final
    result with input disabled.

### 12.3 Pure helpers

Screen-position mapping, card formatting, and "is this card playable" live in
`components/table.ts` (pure, tested) — mirroring the existing
`components/lobby.ts` + `lobby.test.ts` pattern. Cards render as text
(rank + suit symbol); no art.

## 13. Errors and edge cases

- Rejected action → transient message from the engine `Reason` (wrong turn,
  illegal card, too-weak bid); the next broadcast reconciles the view.
- Room gone → the stream 404s; the client shows a notice.
- Game over (`match.winner` set) → final scores and winner, all input disabled.
- Disconnect mid-game → seat kept, player shown **away**; reconnect restores the
  hand from the on-connect snapshot.
- A reconnect with a **different** cookie cannot claim a seat (spectator) —
  documented limitation.

## 14. Files

**New**

- `server/rooms/view.ts` — `RoomView`, `buildRoomView`, `seatPlayers` (+ test).
- `server/rooms/broadcast.ts` — subscriber registry, `subscribe`, `broadcast`
  (+ test).
- `app/api/rooms/[code]/stream/route.ts` — SSE.
- `app/api/rooms/[code]/actions/route.ts` — game actions.
- `components/useRoomStream.ts` — client stream hook.
- `components/GameTable.tsx` — table UI.
- `components/table.ts` (+ test) — pure view helpers.

**Changed**

- `server/definitions.ts` — `Room` gains `match`/`rng`; `Player` drops `cards`;
  legacy `Card` removed.
- `server/Rooms.ts` (+ test) — match creation, `applyGameAction`, presence sweep.
- `server/actions.ts` — broadcast after lobby mutations.
- `components/RoomLobby.tsx` — container + `LobbyView`, driven by the stream.
- `app/room/[code]/page.tsx` — pass the server-rendered initial `RoomView`.

**Removed**

- `app/api/rooms/[code]/players/route.ts` (the poll endpoint).

## 15. Testing and verification

- **TDD** for the room manager, `view`, `broadcast`, and `table` helpers, in the
  existing Node test style (`node --test --conditions=react-server`).
  - `seatPlayers`: join order within teams, partners opposite.
  - `startGame`: creates a match, sets `playing`, seats four players.
  - `applyGameAction`: routes to the engine; rejects unknown player / not
    started.
  - `buildRoomView`: hides `rest` and other hands; exposes only the viewer's
    cards; `you: null` for spectators; lobby view when `match` is null.
  - `broadcast`: two fake sinks receive their own tailored payload.
  - `table.ts`: position mapping and playability from `match.legal`.
- **Engine suite** stays green (`npm test`); **`npm run typecheck`** clean.
- **Browser verification** (required): drive the full start → bid → play → score
  flow across multiple player sessions and confirm consistent tables, correct
  turn order, hidden hands, live updates, and reconnect-with-intact-hand.

## 16. Risks and mitigations

- **Long-lived connections on the host.** SSE needs a long-running Node server
  (the user's setup already is one). Mitigation: keepalive comments and
  `X-Accel-Buffering: no`.
- **In-memory state on restart.** Accepted; rooms and matches clear on restart
  (already true for the lobby).
- **Broadcast fan-out cost.** Trivial at four subscribers; `buildRoomView` is
  cheap and only runs on mutation.
- **Remove-then-readd flaps on refresh.** Mitigated by `PRESENCE_GRACE_MS`.
