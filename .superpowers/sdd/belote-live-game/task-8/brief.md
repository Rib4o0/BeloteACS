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

