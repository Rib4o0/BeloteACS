import { Suspense } from "react";
import { connection } from "next/server";

import RoomLobby from "@/components/RoomLobby";
import { findRoom, HEARTBEAT_TIMEOUT_MS } from "@/server/Rooms";
import { getPlayerId } from "@/server/player";

type RoomPageProps = {
    params: Promise<{code: string}>;
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

    const params = await props.params;
    const code = params.code;

    const playerId = await getPlayerId();
    const room = findRoom(code);
    const players = room?.game.players ?? [];

    return (
        <>
            <div className="p-4">
                <h1 className="text-xl font-bold">Room {code}</h1>
                <div className="mt-4">
                    <RoomLobby
                        code={code}
                        currentPlayerId={playerId}
                        initialPlaying={room?.game.playing ?? false}
                        initialPlayers={players.map((player) => ({
                            id: player.id,
                            name: player.name,
                            host: player.host,
                            team: player.team ?? null,
                            connected:
                                Date.now() - (player.lastSeen ?? 0) <=
                                HEARTBEAT_TIMEOUT_MS,
                        }))}
                    />
                </div>
            </div>
        </>
    );
}