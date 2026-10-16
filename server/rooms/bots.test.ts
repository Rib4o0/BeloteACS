import test from "node:test";
import assert from "node:assert/strict";

import { chooseTeam, createRoom, joinRoom, startGame } from "../Rooms.ts";
import { ADD_BOT_ERRORS, addBot, isBot } from "./bots.ts";
import type { Room } from "../definitions.ts";

/** A room whose only human is the host, on team A. */
function hostRoom(): Room {
  const room = createRoom(11);
  joinRoom(room, "host", "Host");
  chooseTeam(room, "host", "A");
  return room;
}

test("addBot seats a flagged bot and never the host", () => {
  const room = hostRoom();

  const result = addBot(room, "host");

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.player.bot, true);
    assert.equal(result.player.host, false);
    assert.equal(result.player.id, `bot:${room.code}:1`);
    assert.equal(result.player.name, "Bot 1");
    assert.equal(isBot(room, result.player.id), true);
  }
  assert.equal(room.game.players.length, 2);
});

test("addBot balances teams by taking the emptier one", () => {
  const room = hostRoom(); // host on A: A=1, B=0

  const first = addBot(room, "host"); // -> B
  const second = addBot(room, "host"); // -> A
  const third = addBot(room, "host"); // -> B

  assert.equal(first.ok && first.player.team, "B");
  assert.equal(second.ok && second.player.team, "A");
  assert.equal(third.ok && third.player.team, "B");
  assert.equal(room.game.players.filter((p) => p.team === "A").length, 2);
  assert.equal(room.game.players.filter((p) => p.team === "B").length, 2);
});

test("addBot mints unique ids and stops at four players", () => {
  const room = hostRoom();

  addBot(room, "host");
  addBot(room, "host");
  addBot(room, "host");

  const ids = room.game.players.map((player) => player.id);
  assert.equal(new Set(ids).size, ids.length);

  const overflow = addBot(room, "host");
  assert.deepEqual(overflow, { ok: false, reason: "full" });
  assert.equal(room.game.players.length, 4);
});

test("addBot refuses a non-host actor", () => {
  const room = hostRoom();
  joinRoom(room, "guest", "Guest");
  chooseTeam(room, "guest", "B");

  assert.deepEqual(addBot(room, "guest"), { ok: false, reason: "not_host" });
  assert.equal(room.game.players.length, 2);
});

test("addBot refuses once the game has started", () => {
  const room = hostRoom();
  addBot(room, "host");
  addBot(room, "host");
  addBot(room, "host");
  assert.deepEqual(startGame(room, "host"), { ok: true });

  assert.deepEqual(addBot(room, "host"), { ok: false, reason: "started" });
});

test("ADD_BOT_ERRORS pins the spec message for every rejection", () => {
  assert.deepEqual(ADD_BOT_ERRORS, {
    not_host: "Only the host can add bots",
    full: "Room is full",
    started: "The game has already started",
  });
});
