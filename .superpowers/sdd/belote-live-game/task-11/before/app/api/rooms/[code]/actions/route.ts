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
