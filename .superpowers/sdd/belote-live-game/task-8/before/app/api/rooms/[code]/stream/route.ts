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
