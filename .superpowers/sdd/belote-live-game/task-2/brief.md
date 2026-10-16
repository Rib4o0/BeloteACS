### Task 2: Presence constants + the view module (`seatPlayers`, `buildRoomView`)

**Files:**
- Create: `server/rooms/constants.ts`
- Create: `server/rooms/view.ts`
- Test: `server/rooms/view.test.ts`
- Modify: `server/Rooms.ts` (re-export constants)

**Interfaces:**
- Consumes: `Room`, `Player`, `Team` (definitions); `publicState`, `Match`, `PublicMatch`, `PlayerId` (engine).
- Produces:
  - `HEARTBEAT_TIMEOUT_MS`, `MAX_PLAYERS`, `MAX_PLAYERS_PER_TEAM` (constants).
  - `RoomPlayer = { id; name; team: Team | null; host; connected }`.
  - `RoomView = { playing: boolean; players: RoomPlayer[]; you: string | null; match: PublicMatch | null }`.
  - `seatPlayers(players: Player[]): [PlayerId, PlayerId, PlayerId, PlayerId]`.
  - `buildRoomView(room: Room, playerId: string | null): RoomView`.

- [ ] **Step 1: Write the failing tests** — create `server/rooms/view.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { chooseTeam, createRoom, joinRoom } from "../Rooms.ts";
import type { Room, Team } from "../definitions.ts";
import { buildRoomView, seatPlayers } from "./view.ts";
import { createMatch } from "../game/index.ts";

/** A room with four players whose teams follow `teams`, in join order. */
function roomWithTeams(teams: [Team, Team, Team, Team]): { room: Room; ids: string[] } {
  const room = createRoom(7);
  const ids = ["p0", "p1", "p2", "p3"];

  ids.forEach((id, index) => {
    joinRoom(room, id, id.toUpperCase());
    chooseTeam(room, id, teams[index]);
  });

  return { room, ids };
}

/** Builds the match directly — `startGame` wiring lands in Task 3. */
function startPlaying(room: Room) {
  room.match = createMatch(seatPlayers(room.game.players), room.rng);
  room.game.playing = true;
}

test("seatPlayers seats team A at 0/2 and team B at 1/3 in join order", () => {
  const { room } = roomWithTeams(["B", "A", "B", "A"]);
  const seats = seatPlayers(room.game.players);

  assert.deepEqual(seats, ["p1", "p0", "p3", "p2"]);
  // partners are opposite
  assert.equal(room.game.players.find((p) => p.id === seats[0])?.team, "A");
  assert.equal(room.game.players.find((p) => p.id === seats[2])?.team, "A");
  assert.equal(room.game.players.find((p) => p.id === seats[1])?.team, "B");
  assert.equal(room.game.players.find((p) => p.id === seats[3])?.team, "B");
});

test("buildRoomView reports the lobby before the game starts", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  const view = buildRoomView(room, "p0");

  assert.equal(view.playing, false);
  assert.equal(view.match, null);
  assert.equal(view.you, "p0");
  assert.deepEqual(view.players.map((p) => p.id), ["p0", "p1", "p2", "p3"]);
  assert.equal(view.players[0].team, "A");
  assert.equal(view.players.every((p) => p.connected), true);
});

test("buildRoomView treats a non-member as a spectator", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  const view = buildRoomView(room, "ghost");

  assert.equal(view.you, null);
});

test("buildRoomView exposes only the viewer's own cards once playing", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  startPlaying(room);
  const viewerId = room.match!.seats[0];

  const view = buildRoomView(room, viewerId);

  assert.equal(view.playing, true);
  assert.equal(view.you, viewerId);
  assert.equal(view.match?.hand.phase, "bidding");
  assert.equal(view.match?.hand.hand.length, 5);       // your own five cards
  assert.equal("rest" in (view.match?.hand ?? {}), false);
  assert.deepEqual(view.match?.hand.cardsLeft, { 0: 5, 1: 5, 2: 5, 3: 5 });
});

test("buildRoomView hands a late-joining viewer the current state", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  startPlaying(room);

  // A fresh subscriber (same player, new connection) still gets a full snapshot.
  const view = buildRoomView(room, room.match!.seats[0]);
  assert.equal(view.match?.hand.hand.length, 5);
});

test("buildRoomView reveals no cards to a spectator", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  startPlaying(room);

  const view = buildRoomView(room, "ghost");
  assert.equal(view.you, null);
  assert.deepEqual(view.match?.hand.hand, []);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --test --conditions=react-server server/rooms/view.test.ts`
Expected: FAIL — cannot find module `./view.ts`.

- [ ] **Step 3: Create `server/rooms/constants.ts`**

```ts
export const MAX_PLAYERS = 4;
export const MAX_PLAYERS_PER_TEAM = 2;
export const HEARTBEAT_TIMEOUT_MS = 15_000;
```

- [ ] **Step 4: Create `server/rooms/view.ts`**

```ts
import { publicState, type PublicMatch } from "../game/index.ts";
import type { Player, Room, Team } from "../definitions.ts";
import { HEARTBEAT_TIMEOUT_MS } from "./constants.ts";

export type RoomPlayer = {
  id: string;
  name: string;
  team: Team | null;
  host: boolean;
  connected: boolean;
};

export type RoomView = {
  playing: boolean;
  players: RoomPlayer[];
  you: string | null;
  match: PublicMatch | null;
};

/**
 * Maps the four rostered players to engine seats: team A occupies seats 0 and
 * 2, team B seats 1 and 3, each in join order. Partners are always opposite.
 */
export function seatPlayers(
  players: Player[],
): [string, string, string, string] {
  const teamA = players.filter((player) => player.team === "A").map((p) => p.id);
  const teamB = players.filter((player) => player.team === "B").map((p) => p.id);

  return [teamA[0], teamB[0], teamA[1], teamB[1]];
}

/** Builds the per-viewer state sent over the stream and rendered by the page. */
export function buildRoomView(room: Room, playerId: string | null): RoomView {
  const now = Date.now();
  const member =
    playerId !== null && room.game.players.some((player) => player.id === playerId);

  const players: RoomPlayer[] = room.game.players.map((player) => ({
    id: player.id,
    name: player.name,
    team: player.team ?? null,
    host: player.host,
    connected:
      !room.game.playing || now - (player.lastSeen ?? 0) <= HEARTBEAT_TIMEOUT_MS,
  }));

  return {
    playing: room.game.playing,
    players,
    you: member ? playerId : null,
    match: room.match ? publicState(room.match, playerId ?? "") : null,
  };
}
```

- [ ] **Step 5: Point `server/Rooms.ts` at the constants**

In `server/Rooms.ts`, replace the three `export const …` declarations for `MAX_PLAYERS`, `MAX_PLAYERS_PER_TEAM`, and `HEARTBEAT_TIMEOUT_MS` with a re-export so existing importers (`Rooms.test.ts`, `app/room/[code]/page.tsx`, the poll route) keep working:

```ts
import { HEARTBEAT_TIMEOUT_MS, MAX_PLAYERS, MAX_PLAYERS_PER_TEAM } from "./rooms/constants.ts";
export { HEARTBEAT_TIMEOUT_MS, MAX_PLAYERS, MAX_PLAYERS_PER_TEAM };
```

(Remove the now-duplicated constant definitions. `startGame` will import `seatPlayers` in Task 3.)

- [ ] **Step 6: Run the view tests, the suite and typecheck**

Run: `node --test --conditions=react-server server/rooms/view.test.ts` → PASS.
Run: `npm test` → PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 7: Checkpoint.**

---

