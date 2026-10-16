import test from "node:test";
import assert from "node:assert/strict";

import { chooseTeam, createRoom, joinRoom, startGame } from "../Rooms.ts";
import { broadcast, subscribe, subscriberCount } from "./broadcast.ts";
import type { RoomView } from "./view.ts";

function startedRoom() {
  const room = createRoom(3);
  const ids = ["p0", "p1", "p2", "p3"];
  const teams = ["A", "B", "A", "B"] as const;
  ids.forEach((id, index) => {
    joinRoom(room, id, id.toUpperCase());
    chooseTeam(room, id, teams[index]);
  });
  startGame(room, "p0");
  return room;
}

test("broadcast delivers the current view to each subscriber", () => {
  const room = startedRoom();
  const seen: RoomView[] = [];
  const unsubscribe = subscribe(room, room.match!.seats[0], (view) => seen.push(view));

  broadcast(room);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].you, room.match!.seats[0]);
  assert.equal(seen[0].match?.hand.hand.length, 5);

  unsubscribe();
  broadcast(room);
  assert.equal(seen.length, 1); // no delivery after unsubscribe
});

test("each subscriber receives only its own hand", () => {
  const room = startedRoom();
  const bySeat: Record<string, RoomView> = {};
  const a = subscribe(room, room.match!.seats[0], (v) => (bySeat.a = v));
  const b = subscribe(room, room.match!.seats[1], (v) => (bySeat.b = v));

  broadcast(room);

  const cards = (view: RoomView) =>
    (view.match?.hand.hand ?? []).map((c) => `${c.suit}:${c.rank}`).sort();

  assert.notDeepEqual(cards(bySeat.a), cards(bySeat.b));
  a();
  b();
});

test("broadcast is scoped to its own room", () => {
  const room1 = startedRoom();
  const room2 = startedRoom();
  let hits = 0;
  const unsubscribe = subscribe(room1, null, () => (hits += 1));

  broadcast(room2);

  assert.equal(hits, 0);
  unsubscribe();
});

test("broadcast with no subscribers is a no-op", () => {
  const room = startedRoom();
  assert.equal(subscriberCount(room), 0);
  broadcast(room); // must not throw
});
