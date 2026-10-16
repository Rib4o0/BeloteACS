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
