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

