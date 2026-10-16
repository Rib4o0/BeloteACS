import test from "node:test";
import assert from "node:assert/strict";

import { chooseTeam, createRoom, joinRoom } from "../Rooms.ts";
import type { Room, Team } from "../definitions.ts";
import { buildRoomView, seatPlayers } from "./view.ts";
import { createMatch } from "../game/index.ts";

/** A room with four players whose teams follow `teams`, in join order. */
function roomWithTeams(teams: [Team, Team, Team, Team]): { room: Room; ids: string[] } {
  const room = createRoom(7);
  const ids = ["p0", "p1", "p2", "p3"];

  ids.forEach((id, index) => {
    joinRoom(room, id, id.toUpperCase());
    chooseTeam(room, id, teams[index]);
  });

  return { room, ids };
}

/** Builds the match directly — `startGame` wiring lands in Task 3. */
function startPlaying(room: Room) {
  room.match = createMatch(seatPlayers(room.game.players), room.rng);
  room.game.playing = true;
}

test("seatPlayers seats team A at 0/2 and team B at 1/3 in join order", () => {
  const { room } = roomWithTeams(["B", "A", "B", "A"]);
  const seats = seatPlayers(room.game.players);

  assert.deepEqual(seats, ["p1", "p0", "p3", "p2"]);
  // partners are opposite
  assert.equal(room.game.players.find((p) => p.id === seats[0])?.team, "A");
  assert.equal(room.game.players.find((p) => p.id === seats[2])?.team, "A");
  assert.equal(room.game.players.find((p) => p.id === seats[1])?.team, "B");
  assert.equal(room.game.players.find((p) => p.id === seats[3])?.team, "B");
});

test("buildRoomView reports the lobby before the game starts", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  const view = buildRoomView(room, "p0");

  assert.equal(view.playing, false);
  assert.equal(view.match, null);
  assert.equal(view.you, "p0");
  assert.deepEqual(view.players.map((p) => p.id), ["p0", "p1", "p2", "p3"]);
  assert.equal(view.players[0].team, "A");
  assert.equal(view.players.every((p) => p.connected), true);
});

test("buildRoomView treats a non-member as a spectator", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  const view = buildRoomView(room, "ghost");

  assert.equal(view.you, null);
});

test("buildRoomView exposes only the viewer's own cards once playing", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  startPlaying(room);
  const viewerId = room.match!.seats[0];

  const view = buildRoomView(room, viewerId);

  assert.equal(view.playing, true);
  assert.equal(view.you, viewerId);
  assert.equal(view.match?.hand.phase, "bidding");
  assert.equal(view.match?.hand.hand.length, 5);       // your own five cards
  assert.equal("rest" in (view.match?.hand ?? {}), false);
  assert.deepEqual(view.match?.hand.cardsLeft, { 0: 5, 1: 5, 2: 5, 3: 5 });
});

test("buildRoomView hands a late-joining viewer the current state", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  startPlaying(room);

  // A fresh subscriber (same player, new connection) still gets a full snapshot.
  const view = buildRoomView(room, room.match!.seats[0]);
  assert.equal(view.match?.hand.hand.length, 5);
});

test("buildRoomView reveals no cards to a spectator", () => {
  const { room } = roomWithTeams(["A", "B", "A", "B"]);
  startPlaying(room);

  const view = buildRoomView(room, "ghost");
  assert.equal(view.you, null);
  assert.deepEqual(view.match?.hand.hand, []);
});
