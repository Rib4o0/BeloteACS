import type { Room } from "../definitions.ts";
import { buildRoomView, type RoomView } from "./view.ts";

export type Sink = (view: RoomView) => void;

type Entry = { playerId: string | null; sink: Sink };

const globalForBus = globalThis as unknown as {
  roomSubscribers?: Map<string, Set<Entry>>;
};
const buses = (globalForBus.roomSubscribers ??= new Map<string, Set<Entry>>());

function busFor(code: string): Set<Entry> {
  let bus = buses.get(code);
  if (!bus) {
    bus = new Set();
    buses.set(code, bus);
  }
  return bus;
}

/** Registers a stream sink for one viewer. Returns an unsubscribe function. */
export function subscribe(room: Room, playerId: string | null, sink: Sink): () => void {
  const entry: Entry = { playerId, sink };
  busFor(room.code).add(entry);

  return () => {
    const bus = busFor(room.code);
    bus.delete(entry);
    if (bus.size === 0) {
      buses.delete(room.code);
    }
  };
}

/** Pushes the current tailored view to every subscriber of the room. */
export function broadcast(room: Room): void {
  const bus = buses.get(room.code);
  if (!bus) return;

  for (const entry of bus) {
    entry.sink(buildRoomView(room, entry.playerId));
  }
}

export function subscriberCount(room: Room): number {
  return buses.get(room.code)?.size ?? 0;
}
