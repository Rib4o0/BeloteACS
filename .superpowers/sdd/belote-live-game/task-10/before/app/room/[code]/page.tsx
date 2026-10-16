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
