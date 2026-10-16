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

