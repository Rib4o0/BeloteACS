import test from "node:test";
import assert from "node:assert/strict";

import type { Team } from "../server/definitions";
import { allTeamsPicked, assignTeam, seatSlots, SEAT_COUNT, type LobbyPlayer } from "./lobby.ts";

function player(id: string, team: Team | null = null): LobbyPlayer {
  return { id, name: `Player ${id}`, host: false, team, connected: true, bot: false };
}

test("assignTeam sets the team on the matching player", () => {
  const players = [player("p1"), player("p2")];

  const updated = assignTeam(players, "p1", "A");

  assert.equal(updated[0].team, "A");
  assert.equal(updated[1].team, null);
});

test("assignTeam returns a new array and does not mutate the input", () => {
  const players = [player("p1")];

  const updated = assignTeam(players, "p1", "B");

  assert.notEqual(updated, players);
  assert.equal(players[0].team, null);
});

test("assignTeam leaves unrelated players untouched", () => {
  const players = [player("p1", "A"), player("p2")];

  const updated = assignTeam(players, "p2", "B");

  assert.deepEqual(updated[0], player("p1", "A"));
  assert.equal(updated[1].team, "B");
});

test("assignTeam with an unknown player id changes nothing", () => {
  const players = [player("p1", "A")];

  const updated = assignTeam(players, "nobody", "B");

  assert.deepEqual(updated[0], player("p1", "A"));
});

test("seatSlots keeps join order and pads with empty seats", () => {
  const slots = seatSlots([player("p1"), player("p2")]);

  assert.equal(slots.length, SEAT_COUNT);
  assert.equal(slots[0]?.id, "p1");
  assert.equal(slots[1]?.id, "p2");
  assert.equal(slots[2], null);
  assert.equal(slots[3], null);
});

test("seatSlots fills every slot once the room is full", () => {
  const slots = seatSlots(["p1", "p2", "p3", "p4"].map((id) => player(id)));

  assert.equal(slots.length, SEAT_COUNT);
  assert.ok(slots.every((slot) => slot !== null));
});

test("seatSlots never exceeds the seat count", () => {
  const slots = seatSlots(["p1", "p2", "p3", "p4", "p5"].map((id) => player(id)));

  assert.equal(slots.length, SEAT_COUNT);
});

test("allTeamsPicked is false while seats are open", () => {
  assert.equal(allTeamsPicked([player("p1", "A"), player("p2", "B")]), false);
});

test("allTeamsPicked is false when a player has not picked a team", () => {
  const players = [player("p1", "A"), player("p2", "B"), player("p3", "A"), player("p4")];

  assert.equal(allTeamsPicked(players), false);
});

test("allTeamsPicked is true with four players all on a team", () => {
  const players = [player("p1", "A"), player("p2", "B"), player("p3", "A"), player("p4", "B")];

  assert.equal(allTeamsPicked(players), true);
});