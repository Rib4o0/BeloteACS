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

