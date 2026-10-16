# Belote Live Game (SSE + Table UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let four players who are already in a room start and play a full belote hand live — the server runs the pure engine authoritatively and pushes each player's tailored view over SSE.

**Architecture:** The engine (`server/game/`) stays pure. `Room` gains a `match` and a persistent `rng`. A per-room subscriber registry fans out a tailored `RoomView` to each open SSE connection. Game actions POST to a route that resolves identity from the cookie, calls `applyGameAction`, and broadcasts. The client is a pure renderer of the pushed view (`LobbyView` or `GameTable`).

**Tech Stack:** Next.js 16 (App Router, Turbopack, `cacheComponents`), React 19, in-memory `globalThis` stores, Server-Sent Events, Node's built-in test runner (`node --test`, TypeScript type-stripping).

**Spec:** `docs/superpowers/specs/2026-10-14-belote-live-game-design.md`

## Global Constraints

- **Node ESM import rule.** Any `server/…` module that is executed by `node --test` (i.e. has a sibling `.test.ts`) must import engine **values** with a **relative path and explicit `.ts` extension** (e.g. `import { createMatch } from "../game/index.ts"`). Extensionless and `@/` imports fail under `node --test`.
- **App/route/client code** may use the `@/…` alias. Both `@/server/game` and `@/server/game/index.ts` compile under Turbopack (verified).
- **Client components** (`components/…`) must import **types only** from the engine (`import type { … } from "../server/game/index.ts"`), never engine values — type imports are erased and safe in the browser bundle.
- **`_`-prefixed folders under `app/` are private** and are not routed. Do not use them for endpoints.
- **Presence.** Keep `HEARTBEAT_TIMEOUT_MS = 15_000` semantics: a player is stale when `now - lastSeen > HEARTBEAT_TIMEOUT_MS`. The SSE stream refreshes `lastSeen` on connect and on a 5s keepalive, so a live connection never goes stale and a closed one is removed pre-start after ~15s (this is the reconnect grace). This replaces the spec's "5s grace" — same intent, reuses tested code.
- **Verification gates.** After every task: `npm test` (all suites) and `npm run typecheck` must pass.
- **No git repository** exists in this workspace. Do not run `git` commands; each task ends with a **Checkpoint** step instead of a commit. (If you want history, run `git init` once before starting — then convert Checkpoints to commits.)
- **Do not delete** `server/game/**` — it is the finished engine.

## Review Focus

Input classes / failure modes the spec implies but no single task's happy-path test covers. Each is pinned to a test in its owning task (noted in brackets).

1. **A player opens the stream mid-hand** (fresh tab after the game started) — must receive the *current* tailored snapshot immediately, not a blank table. [Task 2 test]
2. **Two rapid actions from the same player** (double-click a bid or card) — the second must be rejected (`not_your_turn`) and must not corrupt the match. [Task 3 test]
3. **A player's stream drops mid-hand and returns** — the seat is kept, their hand is intact on reconnect, others see them "away". [Task 2 + Task 5; browser-verified in Task 12]
4. **Server restart / room gone** — a client holding an open stream must not crash; the stream 404s and the page shows a notice. [Task 5 + Task 8]
5. **Hostile/spoofed action body** — an unknown/extra `playerId` in the body must be ignored (cookie wins), malformed shapes rejected with 400, no crash. [Task 4 test]

---

### Task 1: Unify card types and extend the Room model

**Files:**
- Modify: `server/definitions.ts`
- Modify: `server/Rooms.ts` (imports, `createRoom`, `joinRoom`)
- Test: `server/Rooms.test.ts`

**Interfaces:**
- Consumes: engine `seededRng`, types `Match`, `Rng` from `./game/index.ts`.
- Produces: `Room = { code; game; match: Match | null; rng: Rng }`; `Player` without `cards`; `createRoom(seed?: number): Room`.

- [ ] **Step 1: Write the failing test** — append to `server/Rooms.test.ts`:

```ts
test("createRoom starts with no match and a seeded rng", () => {
  const room = createRoom();

  assert.equal(room.match, null);
  assert.equal(typeof room.rng, "function");
});

test("createRoom accepts a seed for a reproducible rng", () => {
  const a = createRoom(1234);
  const b = createRoom(1234);

  assert.equal(a.rng(), b.rng());
  assert.equal(a.rng(), b.rng());
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test --conditions=react-server server/Rooms.test.ts`
Expected: FAIL — `room.match` is `undefined`, `room.rng` is `undefined`.

- [ ] **Step 3: Replace `server/definitions.ts`**

```ts
import type { Match, Rng } from "./game/index.ts";

export type Team = "A" | "B";

export type Player = {
  id: string;
  name: string;
  host: boolean;
  team?: Team;
  lastSeen?: number;
};

export type Game = {
  playing: boolean;
  players: Player[];
};

export type Room = {
  code: string;
  /** The live match once the game has started; null in the lobby. */
  match: Match | null;
  /** Persistent rng so every deal in the match is deterministic and distinct. */
  rng: Rng;
  game: Game;
};
```

- [ ] **Step 4: Update `server/Rooms.ts`**

Add the import at the top (value import — relative, explicit `.ts`):

```ts
import { seededRng } from "./game/index.ts";
import type { Player, Room, Team } from "./definitions";
```

Replace `createRoom` with:

```ts
function randomSeed(): number {
  return (Math.random() * 0x1_0000_0000) >>> 0;
}

export function createRoom(seed?: number) {
  let code = "";

  do {
    code = Math.random().toString(36).substring(2, 6);
  } while (rooms.some((room) => room.code === code));

  const room: Room = {
    code,
    match: null,
    rng: seededRng(seed ?? randomSeed()),
    game: { playing: false, players: [] },
  };
  rooms.push(room);
  return room;
}
```

In `joinRoom`, delete the `cards: []` line so the new player object is:

```ts
  const player: Player = {
    id: playerId,
    name,
    host: room.game.players.length === 0,
    lastSeen: Date.now(),
  };
```

- [ ] **Step 5: Run the suite and typecheck**

Run: `node --test --conditions=react-server server/Rooms.test.ts` → PASS.
Run: `npm run typecheck` → no errors.

- [ ] **Step 6: Checkpoint** — `npm test` green, `npm run typecheck` clean.

---

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

### Task 3: `startGame` builds the match; `applyGameAction`

**Files:**
- Modify: `server/Rooms.ts` (`startGame`, add `applyGameAction`)
- Test: `server/Rooms.test.ts`

**Interfaces:**
- Consumes: `createMatch`, `applyAction`, `Action`, `Reason` (engine); `seatPlayers` (view); `Room`, `Match`.
- Produces:
  - `startGame(room, actorId)` now sets `room.match` and `room.game.playing`.
  - `GameActionError = Reason | "not_started"`.
  - `GameActionResult = { ok: true } | { ok: false; error: GameActionError }`.
  - `applyGameAction(room: Room, action: Action): GameActionResult`.

- [ ] **Step 1: Write the failing tests** — append to `server/Rooms.test.ts`:

```ts
// (`applyGameAction` is added to the existing import list from "./Rooms.ts".)

/** Starts a seeded four-player room with teams A B A B in join order. */
function startedRoom(seed = 1) {
  const room = createRoom(seed);
  const ids = ["p0", "p1", "p2", "p3"];
  const teams = ["A", "B", "A", "B"] as const;

  ids.forEach((id, index) => {
    joinRoom(room, id, id.toUpperCase());
    chooseTeam(room, id, teams[index]);
  });
  assert.deepEqual(startGame(room, "p0"), { ok: true });

  return { room, ids };
}

test("startGame deals a fresh match seated by team", () => {
  const { room } = startedRoom();

  assert.ok(room.match);
  assert.equal(room.match!.hand.phase, "bidding");
  assert.deepEqual(room.match!.seats, ["p0", "p1", "p2", "p3"]);
  assert.equal(room.match!.scores.A, 0);
});

test("the same seed deals the same opening hand", () => {
  const a = startedRoom(99);
  const b = startedRoom(99);

  assert.deepEqual(a.room.match!.hand, b.room.match!.hand);
});

test("applyGameAction rejects an action before the game starts", () => {
  const room = createRoom();

  const result = applyGameAction(room, { kind: "pass", playerId: "p0" });

  assert.deepEqual(result, { ok: false, error: "not_started" });
});

test("applyGameAction records a legal bid and advances the turn", () => {
  const { room } = startedRoom();
  const opener = room.match!.seats[1]; // the player after the dealer

  const result = applyGameAction(room, {
    kind: "bid",
    playerId: opener,
    contract: { kind: "suit", suit: "clubs" },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual((room.match!.hand as { top: unknown }).top, {
    kind: "suit",
    suit: "clubs",
  });
});

test("a second action out of turn is rejected without corrupting the match", () => {
  const { room } = startedRoom();
  const opener = room.match!.seats[1];

  applyGameAction(room, { kind: "pass", playerId: opener });
  const before = room.match;
  const snapshot = structuredClone(before);
  const second = applyGameAction(room, { kind: "pass", playerId: opener });

  assert.deepEqual(second, { ok: false, error: "not_your_turn" });
  assert.equal(room.match, before); // same reference
  assert.deepEqual(room.match, snapshot); // and unchanged in place
});
```

Also add `applyGameAction` to the existing top-of-file import list from `./Rooms.ts`.

- [ ] **Step 2: Run and watch it fail**

Run: `node --test --conditions=react-server server/Rooms.test.ts`
Expected: FAIL — `room.match` is null / `applyGameAction` is not exported.

- [ ] **Step 3: Implement in `server/Rooms.ts`**

Add to the engine import:

```ts
import { applyAction, createMatch, type Action, type Reason } from "./game/index.ts";
import { seatPlayers } from "./rooms/view.ts";
```

In `startGame`, replace `room.game.playing = true;` with:

```ts
  room.match = createMatch(seatPlayers(room.game.players), room.rng);
  room.game.playing = true;
  return { ok: true };
```

Add near the other result types and functions:

```ts
export type GameActionError = Reason | "not_started";

export type GameActionResult =
  | { ok: true }
  | { ok: false; error: GameActionError };

/**
 * Applies a validated engine action to the room's match and stores the result.
 * The caller is responsible for having resolved `action.playerId` from the
 * player's cookie.
 */
export function applyGameAction(room: Room, action: Action): GameActionResult {
  if (!room.match) {
    return { ok: false, error: "not_started" };
  }

  const result = applyAction(room.match, action, room.rng);

  if (result.error) {
    return { ok: false, error: result.error };
  }

  room.match = result.match;
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `node --test --conditions=react-server server/Rooms.test.ts` → PASS (including the pre-existing start-game tests).
Run: `npm run typecheck` → clean.

- [ ] **Step 5: Checkpoint.**

---

### Task 4: Action-body parser + the broadcast registry

**Files:**
- Create: `server/rooms/actionBody.ts`
- Test: `server/rooms/actionBody.test.ts`
- Create: `server/rooms/broadcast.ts`
- Test: `server/rooms/broadcast.test.ts`

**Interfaces:**
- Produces:
  - `parseAction(raw: unknown, playerId: string): Action | null` — builds an engine `Action` from an untrusted body, **always** using the supplied `playerId`.
  - `Sink = (view: RoomView) => void`.
  - `subscribe(room: Room, playerId: string | null, sink: Sink): () => void`.
  - `broadcast(room: Room): void`.
  - `subscriberCount(room: Room): number`.

- [ ] **Step 1: Write the failing `parseAction` tests** — create `server/rooms/actionBody.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { parseAction } from "./actionBody.ts";

test("parses a pass and stamps the cookie player id", () => {
  assert.deepEqual(parseAction({ kind: "pass" }, "me"), {
    kind: "pass",
    playerId: "me",
  });
});

test("parses a play with a valid card", () => {
  assert.deepEqual(parseAction({ kind: "play", card: { suit: "hearts", rank: "A" } }, "me"), {
    kind: "play",
    playerId: "me",
    card: { suit: "hearts", rank: "A" },
  });
});

test("parses a bid with a valid contract", () => {
  assert.deepEqual(parseAction({ kind: "bid", contract: { kind: "nt" } }, "me"), {
    kind: "bid",
    playerId: "me",
    contract: { kind: "nt" },
  });
});

test("ignores a playerId supplied in the body", () => {
  const action = parseAction({ kind: "pass", playerId: "someone-else" }, "me");

  assert.equal(action?.playerId, "me");
});

test("rejects unknown kinds and malformed payloads", () => {
  assert.equal(parseAction({ kind: "dance" }, "me"), null);
  assert.equal(parseAction({ kind: "play", card: { suit: "hearts" } }, "me"), null);
  assert.equal(parseAction({ kind: "bid", contract: { kind: "suit" } }, "me"), null);
  assert.equal(parseAction(null, "me"), null);
  assert.equal(parseAction("nonsense", "me"), null);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --test --conditions=react-server server/rooms/actionBody.test.ts`
Expected: FAIL — cannot find module `./actionBody.ts`.

- [ ] **Step 3: Create `server/rooms/actionBody.ts`**

```ts
import type { Action, Card, Contract } from "../game/index.ts";

const SUITS = ["clubs", "diamonds", "hearts", "spades"];
const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.suit === "string" &&
    SUITS.includes(card.suit) &&
    typeof card.rank === "string" &&
    RANKS.includes(card.rank)
  );
}

function isContract(value: unknown): value is Contract {
  if (!value || typeof value !== "object") return false;
  const contract = value as Record<string, unknown>;

  if (contract.kind === "nt" || contract.kind === "at") return true;
  return contract.kind === "suit" && typeof contract.suit === "string" && SUITS.includes(contract.suit);
}

/**
 * Turns an untrusted request body into an engine Action, always attributing it
 * to `playerId` (the authenticated cookie), never to any id in the body.
 */
export function parseAction(raw: unknown, playerId: string): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;

  if (body.kind === "pass") {
    return { kind: "pass", playerId };
  }
  if (body.kind === "play" && isCard(body.card)) {
    return { kind: "play", playerId, card: body.card };
  }
  if (body.kind === "bid" && isContract(body.contract)) {
    return { kind: "bid", playerId, contract: body.contract };
  }

  return null;
}
```

- [ ] **Step 4: Run and pass**

Run: `node --test --conditions=react-server server/rooms/actionBody.test.ts` → PASS.

- [ ] **Step 5: Write the failing broadcast tests** — create `server/rooms/broadcast.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { chooseTeam, createRoom, joinRoom, startGame } from "../Rooms.ts";
import { broadcast, subscribe, subscriberCount } from "./broadcast.ts";
import type { RoomView } from "./view.ts";

function startedRoom() {
  const room = createRoom(3);
  const ids = ["p0", "p1", "p2", "p3"];
  const teams = ["A", "B", "A", "B"] as const;
  ids.forEach((id, index) => {
    joinRoom(room, id, id.toUpperCase());
    chooseTeam(room, id, teams[index]);
  });
  startGame(room, "p0");
  return room;
}

test("broadcast delivers the current view to each subscriber", () => {
  const room = startedRoom();
  const seen: RoomView[] = [];
  const unsubscribe = subscribe(room, room.match!.seats[0], (view) => seen.push(view));

  broadcast(room);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].you, room.match!.seats[0]);
  assert.equal(seen[0].match?.hand.hand.length, 5);

  unsubscribe();
  broadcast(room);
  assert.equal(seen.length, 1); // no delivery after unsubscribe
});

test("each subscriber receives only its own hand", () => {
  const room = startedRoom();
  const bySeat: Record<string, RoomView> = {};
  const a = subscribe(room, room.match!.seats[0], (v) => (bySeat.a = v));
  const b = subscribe(room, room.match!.seats[1], (v) => (bySeat.b = v));

  broadcast(room);

  const cards = (view: RoomView) =>
    (view.match?.hand.hand ?? []).map((c) => `${c.suit}:${c.rank}`).sort();

  assert.notDeepEqual(cards(bySeat.a), cards(bySeat.b));
  a();
  b();
});

test("broadcast is scoped to its own room", () => {
  const room1 = startedRoom();
  const room2 = startedRoom();
  let hits = 0;
  const unsubscribe = subscribe(room1, null, () => (hits += 1));

  broadcast(room2);

  assert.equal(hits, 0);
  unsubscribe();
});

test("broadcast with no subscribers is a no-op", () => {
  const room = startedRoom();
  assert.equal(subscriberCount(room), 0);
  broadcast(room); // must not throw
});
```

- [ ] **Step 6: Run and watch it fail**

Run: `node --test --conditions=react-server server/rooms/broadcast.test.ts`
Expected: FAIL — cannot find module `./broadcast.ts`.

- [ ] **Step 7: Create `server/rooms/broadcast.ts`**

```ts
import type { Room } from "../definitions.ts";
import { buildRoomView, type RoomView } from "./view.ts";

export type Sink = (view: RoomView) => void;

type Entry = { playerId: string | null; sink: Sink };

const globalForBus = globalThis as unknown as {
  roomSubscribers?: Map<string, Set<Entry>>;
};
const buses = (globalForBus.roomSubscribers ??= new Map<string, Set<Entry>>());

function busFor(code: string): Set<Entry> {
  let bus = buses.get(code);
  if (!bus) {
    bus = new Set();
    buses.set(code, bus);
  }
  return bus;
}

/** Registers a stream sink for one viewer. Returns an unsubscribe function. */
export function subscribe(room: Room, playerId: string | null, sink: Sink): () => void {
  const entry: Entry = { playerId, sink };
  busFor(room.code).add(entry);

  return () => {
    const bus = busFor(room.code);
    bus.delete(entry);
    if (bus.size === 0) {
      buses.delete(room.code);
    }
  };
}

/** Pushes the current tailored view to every subscriber of the room. */
export function broadcast(room: Room): void {
  const bus = buses.get(room.code);
  if (!bus) return;

  for (const entry of bus) {
    entry.sink(buildRoomView(room, entry.playerId));
  }
}

export function subscriberCount(room: Room): number {
  return buses.get(room.code)?.size ?? 0;
}
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `node --test --conditions=react-server server/rooms/broadcast.test.ts` → PASS.
Run: `npm test` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 9: Checkpoint.**

---

### Task 5: SSE stream route

**Files:**
- Create: `app/api/rooms/[code]/stream/route.ts`

**Interfaces:**
- Consumes: `findRoom`, `sweepStalePlayers`, `touchPlayer` (`@/server/Rooms`); `buildRoomView`; `subscribe`, `broadcast`; `getPlayerId`.
- Produces: `GET /api/rooms/[code]/stream` → `text/event-stream` of `event: state` frames carrying a `RoomView`.

- [ ] **Step 1: Implement the route** — create `app/api/rooms/[code]/stream/route.ts`:

```ts
import { connection } from "next/server";

import { findRoom, sweepStalePlayers, touchPlayer } from "@/server/Rooms";
import { getPlayerId } from "@/server/player";
import { broadcast, subscribe } from "@/server/rooms/broadcast";
import { buildRoomView } from "@/server/rooms/view";

const KEEPALIVE_MS = 5000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  await connection();

  const { code } = await context.params;
  const room = findRoom(code);

  if (!room) {
    return new Response("Room not found", { status: 404 });
  }

  const playerId = (await getPlayerId()) ?? null;
  const encoder = new TextEncoder();

  let unsubscribe = () => {};
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (view: ReturnType<typeof buildRoomView>) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: state\ndata: ${JSON.stringify(view)}\n\n`),
        );
      };

      if (playerId) {
        touchPlayer(room, playerId);
      }
      sweepStalePlayers(room);

      // Tell everyone already connected that the roster changed...
      broadcast(room);

      // ...then attach this viewer and hand them the current snapshot.
      unsubscribe = subscribe(room, playerId, send);
      send(buildRoomView(room, playerId));

      keepalive = setInterval(() => {
        if (playerId) {
          touchPlayer(room, playerId);
        }
        if (!closed) {
          controller.enqueue(encoder.encode(":keepalive\n\n"));
        }
      }, KEEPALIVE_MS);
    },
    cancel() {
      closed = true;
      if (keepalive) {
        clearInterval(keepalive);
      }
      unsubscribe();
      sweepStalePlayers(room);
      broadcast(room);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 2: Compile-check the route**

Run: `npm run build`
Expected: build succeeds and lists `ƒ /api/rooms/[code]/stream`.

- [ ] **Step 3: Checkpoint.**

---

### Task 6: Game action route

**Files:**
- Create: `app/api/rooms/[code]/actions/route.ts`

**Interfaces:**
- Consumes: `findRoom`, `applyGameAction`, `sweepStalePlayers`, `touchPlayer`; `parseAction`; `broadcast`; `getPlayerId`.
- Produces: `POST /api/rooms/[code]/actions` with body `{ action }` → `{ ok: true }` | `{ ok: false, error }`.

- [ ] **Step 1: Implement the route** — create `app/api/rooms/[code]/actions/route.ts`:

```ts
import { connection } from "next/server";

import { applyGameAction, findRoom, sweepStalePlayers, touchPlayer } from "@/server/Rooms";
import { getPlayerId } from "@/server/player";
import { parseAction } from "@/server/rooms/actionBody";
import { broadcast } from "@/server/rooms/broadcast";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  await connection();

  const { code } = await context.params;
  const room = findRoom(code);

  if (!room) {
    return Response.json({ ok: false, error: "room_not_found" }, { status: 404 });
  }

  // Identity always comes from the cookie, never from the request body.
  const playerId = await getPlayerId();

  if (!playerId) {
    return Response.json({ ok: false, error: "not_a_player" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const action = parseAction(body?.action, playerId);

  if (!action) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  touchPlayer(room, playerId);
  sweepStalePlayers(room);

  const result = applyGameAction(room, action);

  if (!result.ok) {
    // `not_started` is a transport/state conflict (no match yet); everything
    // else is a rejected move carrying the engine Reason.
    const status = result.error === "not_started" ? 409 : 400;
    return Response.json({ ok: false, error: result.error }, { status });
  }

  broadcast(room);
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Compile-check the route**

Run: `npm run build`
Expected: build succeeds and lists `ƒ /api/rooms/[code]/actions`.

- [ ] **Step 3: Checkpoint.**

---

### Task 7: Broadcast after lobby mutations

**Files:**
- Modify: `server/actions.ts`

**Interfaces:**
- Consumes: `broadcast`, `createRoom(seed?)`.

- [ ] **Step 1: Add the import and dev seed helper** — in `server/actions.ts`:

```ts
import { broadcast } from "@/server/rooms/broadcast";
```

```ts
/** A seed may be supplied for reproducible local games; ignored in production. */
function devSeed(formData: FormData): number | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const raw = String(formData.get("seed") ?? "").trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
```

- [ ] **Step 2: Broadcast after each mutation.**

- `createRoomAction`: `const room = createRoom(devSeed(formData));` then after `joinRoom(room, playerId, name);` add `broadcast(room);` (before `redirect`).
- `joinRoomAction`: after the successful `joinRoom`, add `broadcast(room);` (before `redirect`).
- `chooseTeamAction`: in the `if (!result.ok)` success path, i.e. just before `return null;`, add `broadcast(room);`.
- `startGameAction`: the same — just before `return null;`, add `broadcast(room);`.
- `leaveRoomAction`: inside `if (room) { … }` after `leaveRoom(...)`, add `broadcast(room);`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` → clean.

- [ ] **Step 4: Checkpoint.**

---

### Task 8: Server-render the initial view on the room page

**Files:**
- Modify: `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: `findRoom`; `buildRoomView`; `getPlayerId`.
- Produces: `<RoomLobby code currentPlayerId initial />` where `initial: RoomView`.

- [ ] **Step 1: Replace the page body**

```tsx
import { Suspense } from "react";
import { connection } from "next/server";

import RoomLobby from "@/components/RoomLobby";
import { findRoom } from "@/server/Rooms";
import { getPlayerId } from "@/server/player";
import { buildRoomView } from "@/server/rooms/view";

type RoomPageProps = {
  params: Promise<{ code: string }>;
};

export default function RoomPage(props: RoomPageProps) {
  return (
    <Suspense fallback={<div>Loading</div>}>
      <RoomContent params={props.params} />
    </Suspense>
  );
}

async function RoomContent(props: RoomPageProps) {
  // Render at request time: this page reads the live in-memory room state.
  await connection();

  const { code } = await props.params;
  const playerId = await getPlayerId();
  const room = findRoom(code);
  const initial = room ? buildRoomView(room, playerId ?? null) : null;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Room {code}</h1>
      <div className="mt-4">
        {initial ? (
          <RoomLobby code={code} currentPlayerId={playerId} initial={initial} />
        ) : (
          <p className="text-sm text-red-600">Room not found.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Compile-check** (RoomLobby's props change is completed in Task 9; expect a type error here until then)

Run: `npm run typecheck`
Expected: one error that `RoomLobby` does not accept `initial`. Proceed to Task 9, then re-run.

- [ ] **Step 3: Checkpoint** after Task 9 is complete.

---

### Task 9: Stream hook, container refactor, remove the poll route

**Files:**
- Create: `components/useRoomStream.ts`
- Modify: `components/RoomLobby.tsx`
- Modify: `components/lobby.ts` (add a thin `RoomPlayer`-compatible alias if needed)
- Delete: `app/api/rooms/[code]/players/route.ts`

**Interfaces:**
- Consumes: `RoomView` (type), `chooseTeamAction`, `startGameAction`, `leaveRoomAction`, `broadcast`-driven push.
- Produces: `useRoomStream(code: string, initial: RoomView): { room: RoomView; connected: boolean }`; `RoomLobby({ code, currentPlayerId, initial })`.

- [ ] **Step 1: Create `components/useRoomStream.ts`**

```ts
"use client";

import { useEffect, useState } from "react";

import type { RoomView } from "@/server/rooms/view";

/** Subscribes to the room's SSE stream, seeded with the server-rendered view. */
export function useRoomStream(
  code: string,
  initial: RoomView,
): { room: RoomView; connected: boolean } {
  const [room, setRoom] = useState<RoomView>(initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/rooms/${code}/stream`);

    const onState = (event: MessageEvent) => {
      try {
        setRoom(JSON.parse(event.data) as RoomView);
      } catch {
        // Ignore a malformed frame; the next one will correct us.
      }
    };

    source.addEventListener("state", onState as EventListener);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    return () => {
      source.removeEventListener("state", onState as EventListener);
      source.close();
    };
  }, [code]);

  return { room, connected };
}
```

- [ ] **Step 2: Refactor `components/RoomLobby.tsx`.**

State no longer lives in the component (it streams in), so keep the same optimistic behaviour with an explicit local **overlay**: a `pendingTeam` while a team pick is in flight, and a `starting` flag until the first match frame arrives. Replace the top of the file with:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";

import { chooseTeamAction, leaveRoomAction, startGameAction } from "@/server/actions";
import type { Team } from "@/server/definitions";
import type { RoomView } from "@/server/rooms/view";
import RoomCodeModal from "./RoomCodeModal";
import { allTeamsPicked, assignTeam, seatSlots, SEAT_COUNT } from "./lobby";
import { useRoomStream } from "./useRoomStream";

const TEAMS: Team[] = ["A", "B"];

export default function RoomLobby({
  code,
  currentPlayerId,
  initial,
}: {
  code: string;
  currentPlayerId: string | undefined;
  initial: RoomView;
}) {
  const { room, connected } = useRoomStream(code, initial);
  const [pendingTeam, setPendingTeam] = useState<Team | null>(null);
  const [starting, setStarting] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [teamPending, startTeamTransition] = useTransition();
  const [startPending, startStartTransition] = useTransition();

  // Drop the optimistic team pick once the server echoes it back.
  useEffect(() => {
    if (!pendingTeam || !currentPlayerId) return;
    const mine = room.players.find((player) => player.id === currentPlayerId);
    if (mine?.team === pendingTeam) setPendingTeam(null);
  }, [room, pendingTeam, currentPlayerId]);

  const players =
    pendingTeam && currentPlayerId
      ? assignTeam(room.players, currentPlayerId, pendingTeam)
      : room.players;
  // Before the first match frame arrives, keep showing the "dealing" state.
  const playing = room.playing || (starting && room.match === null);
  const me = players.find((player) => player.id === currentPlayerId);
  const amHost = me?.host ?? false;
  const teamsReady = allTeamsPicked(players);
  const canStart = !playing && teamsReady;
  const teamIsFull = (team: Team) =>
    players.filter(
      (player) => player.team === team && player.id !== currentPlayerId,
    ).length >= 2;

  function pickTeam(team: Team) {
    if (!currentPlayerId || teamPending) return;
    setTeamError(null);
    setPendingTeam(team);

    const formData = new FormData();
    formData.set("code", code);
    formData.set("team", team);

    startTeamTransition(async () => {
      const result = await chooseTeamAction(null, formData);
      if (result?.error) {
        setTeamError(result.error);
        setPendingTeam(null);
      }
    });
  }

  function startGame() {
    if (startPending || !canStart) return;
    setStartError(null);
    setStarting(true);

    const formData = new FormData();
    formData.set("code", code);

    startStartTransition(async () => {
      const result = await startGameAction(null, formData);
      if (result?.error) {
        setStartError(result.error);
        setStarting(false);
      }
    });
  }
```

Keep the rest of the existing lobby JSX **unchanged** — the seat grid, team picker, Start button, Leave form and `RoomCodeModal` already read from `players`, `playing`, `me`, `amHost`, `teamsReady`, `canStart`, `teamIsFull`. Add a connection hint near the status line:

```tsx
{connected ? null : (
  <p className="text-xs text-amber-600">Reconnecting…</p>
)}
```

Replace the old `if (playing) { … "Game started" … }` branch with:

```tsx
if (playing) {
  return room.match ? (
    <GameTable code={code} players={players} match={room.match} />
  ) : (
    <p className="text-sm text-zinc-500">Dealing…</p>
  );
}
```

Finally delete: the `refresh` `useCallback`, the polling `useEffect` + `setInterval`, the `mounted` ref, and the local `players`/`playing` `useState` (and any imports left unused).

(`GameTable` is created in Task 11. Until then, render `<p className="text-sm text-zinc-500">The game is starting…</p>` in its place and do **not** import it, so Task 9 compiles on its own. Task 11 swaps in the component and its import.)

- [ ] **Step 3: Delete the poll route**

```bash
rm app/api/rooms/[code]/players/route.ts
rmdir app/api/rooms/[code]/players 2>/dev/null || true
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck` → clean.
Run: `npm run build` → succeeds; the route list no longer contains `players`.

- [ ] **Step 5: Checkpoint.**

---

### Task 10: Pure table helpers

> **Update (2026-10-15):** the `screenSlot` direction was reversed after the UI redesign — offset 1 now maps to `"right"` (the player after the viewer sits on the right, counter-clockwise). See the "Post-plan: UI redesign" ruling in `.superpowers/sdd/belote-live-game/progress.md`. The block below is the original, as-built record.

**Files:**
- Create: `components/table.ts`
- Test: `components/table.test.ts`

**Interfaces:**
- Consumes (types only): `Action`, `Card`, `Contract`, `Seat` from `../server/game/index.ts`.
- Produces:
  - `screenSlot(you: Seat, seat: Seat): "bottom" | "left" | "top" | "right"`.
  - `isPlayable(card: Card, legal: Action[]): boolean`.
  - `contractLabel(contract: Contract | null): string`.
  - `rankLabel(rank: Card["rank"]): string`.
  - `suitSymbol(suit: Card["suit"]): string`.
  - `cardLabel(card: Card): string`.

- [ ] **Step 1: Write the failing tests** — create `components/table.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import type { Action, Card, Seat } from "../server/game/index.ts";
import { cardLabel, contractLabel, isPlayable, screenSlot, suitSymbol } from "./table.ts";

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });

test("screenSlot places you bottom, partner top, opponents on the sides", () => {
  assert.equal(screenSlot(0, 0), "bottom");
  assert.equal(screenSlot(0, 1), "left");
  assert.equal(screenSlot(0, 2), "top");
  assert.equal(screenSlot(0, 3), "right");

  assert.equal(screenSlot(2, 2), "bottom");
  assert.equal(screenSlot(2, 3), "left");
  assert.equal(screenSlot(2, 0), "top");
  assert.equal(screenSlot(2, 1), "right");
});

test("isPlayable is true only for a legal play of the matching card", () => {
  const legal: Action[] = [
    { kind: "play", playerId: "me", card: card("hearts", "A") },
    { kind: "pass", playerId: "me" },
  ];

  assert.equal(isPlayable(card("hearts", "A"), legal), true);
  assert.equal(isPlayable(card("hearts", "K"), legal), false);
  assert.equal(isPlayable(card("hearts", "A"), []), false);
});

test("labels a contract", () => {
  assert.equal(contractLabel({ kind: "suit", suit: "clubs" }), "Clubs");
  assert.equal(contractLabel({ kind: "nt" }), "No-trump");
  assert.equal(contractLabel({ kind: "at" }), "All-trumps");
  assert.equal(contractLabel(null), "—");
});

test("formats a card as rank plus suit symbol", () => {
  assert.equal(suitSymbol("hearts"), "♥");
  assert.equal(cardLabel(card("spades", "10")), "10♠");
  assert.equal(cardLabel(card("diamonds", "A")), "A♦");
});

test("a Seat type is accepted", () => {
  const seat: Seat = 3;
  assert.equal(screenSlot(0, seat), "right");
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --test --conditions=react-server components/table.test.ts`
Expected: FAIL — cannot find module `./table.ts`.

- [ ] **Step 3: Create `components/table.ts`**

```ts
import type { Action, Card, Contract, Seat, Suit } from "../server/game/index.ts";

export type ScreenSlot = "bottom" | "left" | "top" | "right";

/** Where a seat sits on the viewer's screen, relative to the viewer's seat. */
const SCREEN_SLOTS = ["bottom", "left", "top", "right"] as const;

export function screenSlot(you: Seat, seat: Seat): ScreenSlot {
  // A literal index stays well-typed even under noUncheckedIndexedAccess.
  const offset = ((seat - you + 4) % 4) as 0 | 1 | 2 | 3;
  return SCREEN_SLOTS[offset];
}

/** True when the card appears among the viewer's legal plays. */
export function isPlayable(card: Card, legal: Action[]): boolean {
  return legal.some(
    (action) =>
      action.kind === "play" &&
      action.card.suit === card.suit &&
      action.card.rank === card.rank,
  );
}

const CONTRACT_LABEL: Record<Suit, string> = {
  clubs: "Clubs",
  diamonds: "Diamonds",
  hearts: "Hearts",
  spades: "Spades",
};

export function contractLabel(contract: Contract | null): string {
  if (!contract) return "—";
  if (contract.kind === "nt") return "No-trump";
  if (contract.kind === "at") return "All-trumps";
  return CONTRACT_LABEL[contract.suit];
}

const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOL[suit];
}

export function rankLabel(rank: Card["rank"]): string {
  return rank;
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${suitSymbol(card.suit)}`;
}
```

- [ ] **Step 4: Run and pass**

Run: `node --test --conditions=react-server components/table.test.ts` → PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 5: Checkpoint.**

---

### Task 11: The `GameTable` component

**Files:**
- Create: `components/GameTable.tsx`
- Modify: `components/RoomLobby.tsx` (swap the placeholder for `<GameTable/>`)

**Interfaces:**
- Consumes: `RoomPlayer`, `PublicMatch`, `useRoomStream` (via the container), `table.ts` helpers, `POST /api/rooms/[code]/actions`.
- Produces: `GameTable({ code, players, match })`.

- [ ] **Step 1: Create `components/GameTable.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

import type { Card, PublicMatch, Seat } from "@/server/game/index.ts";
import type { RoomPlayer } from "@/server/rooms/view";
import { cardLabel, contractLabel, isPlayable } from "./table";

// Kept local so the client bundle never imports engine *values*.
const SEATS: Seat[] = [0, 1, 2, 3];

export default function GameTable({
  code,
  players,
  match,
}: {
  code: string;
  players: RoomPlayer[];
  match: PublicMatch;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [optimisticCard, setOptimisticCard] = useState<Card | null>(null);

  // Clear any optimistic echo as soon as fresh server state arrives.
  useEffect(() => {
    setOptimisticCard(null);
    setPending(false);
  }, [match]);

  const you = match.you;
  const nameOf = (seat: Seat) =>
    players.find((player) => player.id === match.seats[seat])?.name ?? "—";
  const awayOf = (seat: Seat) =>
    players.find((player) => player.id === match.seats[seat])?.connected === false;

  async function send(action: unknown, optimistic?: Card) {
    if (pending) return;
    setError(null);
    setPending(true);
    if (optimistic) setOptimisticCard(optimistic);

    try {
      const response = await fetch(`/api/rooms/${code}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(describe(data.error));
        setOptimisticCard(null);
      }
    } catch {
      setError("Could not reach the server");
      setOptimisticCard(null);
    } finally {
      setPending(false);
    }
  }

  const isYourTurn = you !== null && match.hand.turn === you;
  const bidding = match.hand.phase === "bidding";

  return (
    <div className="flex flex-col gap-4">
      <Scoreboard match={match} />

      {match.winner ? (
        <p className="rounded-md bg-emerald-100 p-3 text-sm font-medium text-emerald-800">
          Game over — Team {match.winner} wins.
        </p>
      ) : null}

      <div className="rounded-md border border-zinc-300 p-3 dark:border-zinc-700">
        <div className="text-xs text-zinc-500">
          {bidding
            ? `Bidding — top: ${contractLabel(match.hand.top)}${
                match.hand.topBidder !== null
                  ? ` by ${nameOf(match.hand.topBidder)}`
                  : ""
              }`
            : `Contract: ${contractLabel(match.hand.contract)} by ${
                match.hand.taker !== null ? nameOf(match.hand.taker) : "—"
              }`}
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          {(match.hand.trick ?? []).map((play) => (
            <span
              key={`${play.seat}-${play.card.suit}-${play.card.rank}`}
              className="rounded border px-2 py-1 text-sm"
            >
              {nameOf(play.seat)}: {cardLabel(play.card)}
            </span>
          ))}
          {optimisticCard ? (
            <span className="rounded border border-dashed px-2 py-1 text-sm text-zinc-400">
              you: {cardLabel(optimisticCard)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        {SEATS.filter((seat) => seat !== you).map((seat) => (
          <div key={seat} className="rounded border p-2 dark:border-zinc-700">
            <div className="font-medium">{nameOf(seat)}</div>
            <div className="text-xs text-zinc-500">
              {match.hand.cardsLeft[seat]} cards
              {awayOf(seat) ? " · away" : ""}
              {match.hand.turn === seat ? " · to play" : ""}
            </div>
          </div>
        ))}
      </div>

      {bidding && isYourTurn ? (
        <div className="flex flex-wrap gap-2">
          {match.legal
            .filter((action) => action.kind === "bid")
            .map((action) => (
              <button
                key={action.contract.kind === "suit" ? action.contract.suit : action.contract.kind}
                type="button"
                disabled={pending}
                onClick={() => send({ kind: "bid", contract: action.contract })}
                className="rounded-md border px-3 py-1.5 text-sm dark:border-zinc-700"
              >
                {contractLabel(action.contract)}
              </button>
            ))}
          <button
            type="button"
            disabled={pending}
            onClick={() => send({ kind: "pass" })}
            className="rounded-md border px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Pass
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(match.hand.hand ?? [])
          .filter(
            (card) =>
              !optimisticCard ||
              card.suit !== optimisticCard.suit ||
              card.rank !== optimisticCard.rank,
          )
          .map((card) => {
            const playable = isYourTurn && !bidding && isPlayable(card, match.legal);
            return (
              <button
                key={`${card.suit}-${card.rank}`}
                type="button"
                disabled={!playable || pending}
                onClick={() =>
                  send({ kind: "play", card }, card)
                }
                className={`rounded border px-3 py-2 text-sm ${
                  playable
                    ? "border-zinc-400 dark:border-zinc-500"
                    : "opacity-40"
                }`}
              >
                {cardLabel(card)}
              </button>
            );
          })}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Scoreboard({ match }: { match: PublicMatch }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <span className="font-medium">Team A {match.scores.A}</span>
      <span className="font-medium">Team B {match.scores.B}</span>
      <span className="text-zinc-500">Hand {match.handNumber}</span>
      {match.lastOutcome ? (
        <span className="text-zinc-500">
          Last hand: A {match.lastOutcome.raw.A} · B {match.lastOutcome.raw.B}
          {match.lastOutcome.capot ? ` · capot ${match.lastOutcome.capot}` : ""}
          {match.lastOutcome.dedans ? " · dedans" : ""}
        </span>
      ) : null}
    </div>
  );
}

function describe(error: string): string {
  const messages: Record<string, string> = {
    not_your_turn: "It's not your turn",
    card_not_held: "You don't hold that card",
    card_not_legal: "That card can't be played",
    bid_too_weak: "That bid is too low",
    wrong_phase: "Not allowed right now",
    game_over: "The game is over",
    not_a_player: "You are not in this game",
    not_started: "The game has not started",
    bad_request: "That move was rejected",
    room_not_found: "This room no longer exists",
  };
  return messages[error] ?? "That move was rejected";
}
```

- [ ] **Step 2: Swap in the table** — in `components/RoomLobby.tsx`, replace the temporary "Game started" placeholder with:

```tsx
if (playing) {
  return room.match ? (
    <GameTable code={code} players={players} match={room.match} />
  ) : (
    <p className="text-sm text-zinc-500">Dealing…</p>
  );
}
```

and add `import GameTable from "./GameTable";`.

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck` → clean.
Run: `npm run build` → succeeds.

- [ ] **Step 4: Checkpoint.**

---

### Task 12: Browser verification

**Files:** none (manual / browser-driven).

- [ ] **Step 1: Restart the dev server** (the running instance's watcher is stale):

```bash
kill 5547 2>/dev/null || true
npm run dev
```

- [ ] **Step 2: Four players.** Using four browser sessions (separate cookie jars), each creates/joins the same room, picks teams (two A, two B), and the host presses **Start**.

Verify: all four move to the table at once; each sees only its own eight cards; the other three seats show names, teams and **8 cards**.

- [ ] **Step 3: Bidding.** The player after the dealer bids **Clubs**; a later player bids **Spades**; the rest pass. Verify the legal-bid buttons only ever offer strictly stronger contracts, and that the contract + taker show once three passes land.

- [ ] **Step 4: Play.** Play several tricks. Verify:
  - trick 1 is led by the player after the dealer;
  - the winner of each trick leads the next;
  - a player who can follow suit cannot play off-suit;
  - a player who cannot follow and whose partner is not master is forced to trump;
  - **Reconnecting…** shows on a dropped tab and clears on reconnection.

- [ ] **Step 5: Full hand → score.** Play the hand to the end. Verify the scoreboard updates, hand number increments, the dealer rotates, and the next hand is dealt.

- [ ] **Step 6: Reconnect mid-hand.** Close one player's tab during play, reopen the room URL. Verify the seat and hand are intact and the others briefly show **away**.

- [ ] **Step 7: Pre-start grace.** Before starting, close a lobby tab and reopen within ~15s → the seat is kept. Close and wait longer → the seat is freed.

- [ ] **Step 8: Spectator.** Open the room URL in an incognito window (no player cookie). Verify no cards are visible.

- [ ] **Step 9: End condition.** Play on until a team reaches 151; verify the game-over banner names the winner and inputs disable.

- [ ] **Step 10: Checkpoint.** `npm test` green, `npm run typecheck` clean.
