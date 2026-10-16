import { connection } from "next/server";

import {
  findRoom,
  HEARTBEAT_TIMEOUT_MS,
  MAX_PLAYERS,
  sweepStalePlayers,
  touchPlayer,
} from "@/server/Rooms";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  await connection();

  const { code } = await context.params;
  const room = findRoom(code);

  if (!room) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const now = Date.now();

  sweepStalePlayers(room, now);

  const playerId = body?.playerId;

  if (typeof playerId === "string" && playerId) {
    touchPlayer(room, playerId, now);
  }

  return Response.json({
    playing: room.game.playing,
    full: room.game.players.length >= MAX_PLAYERS,
    players: room.game.players.map((player) => ({
      id: player.id,
      name: player.name,
      host: player.host,
      team: player.team ?? null,
      connected: !room.game.playing
        ? true
        : now - (player.lastSeen ?? 0) <= HEARTBEAT_TIMEOUT_MS,
    })),
  });
}