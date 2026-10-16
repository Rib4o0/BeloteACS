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

