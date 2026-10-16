import test from "node:test";
import assert from "node:assert/strict";

import { chooseTeam, createRoom, joinRoom, startGame, applyGameAction } from "../Rooms.ts";
import { chooseAction } from "../bot.ts";
import { publicState } from "../game/index.ts";
import { addBot } from "./bots.ts";
import {
  botDriverRunning,
  ensureBotDriver,
  pumpRoom,
  stopBotDriver,
} from "./botDriver.ts";
import type { Room } from "../definitions.ts";

/** A room with a human host on team A and three bots filling the rest. */
function hostPlusBots(seed = 5): Room {
  const room = createRoom(seed);
  joinRoom(room, "host", "Host");
  chooseTeam(room, "host", "A");

  for (let i = 0; i < 3; i++) {
    assert.equal(addBot(room, "host").ok, true);
  }

  assert.deepEqual(startGame(room, "host"), { ok: true });
  return room;
}

test("pumpRoom applies exactly one bot move", () => {
  const room = hostPlusBots();
  const before = room.match;

  assert.equal(pumpRoom(room), true);
  assert.notEqual(room.match, before); // a new match object was stored
});

test("pumpRoom does nothing on a human's turn", () => {
  const room = createRoom(5);
  const ids = ["p0", "p1", "p2", "p3"];
  const teams = ["A", "B", "A", "B"] as const;

  ids.forEach((id, index) => {
    joinRoom(room, id, id);
    chooseTeam(room, id, teams[index]);
  });
  assert.deepEqual(startGame(room, "p0"), { ok: true });

  const before = room.match;
  assert.equal(pumpRoom(room), false); // seat 1 (the deal opener) is a human
  assert.equal(room.match, before);
});

test("pumpRoom does nothing once the game is won", () => {
  const room = hostPlusBots();
  room.match = { ...room.match!, winner: "A" };

  assert.equal(pumpRoom(room), false);
});

test("pumpRoom does nothing before the game starts", () => {
  const room = createRoom(5);
  joinRoom(room, "host", "Host");

  assert.equal(pumpRoom(room), false);
});

test("ensureBotDriver registers a single ticker and can be stopped", () => {
  stopBotDriver();
  ensureBotDriver();
  ensureBotDriver();
  assert.equal(botDriverRunning(), true);
  stopBotDriver();
  assert.equal(botDriverRunning(), false);
});

test("a table of bots plays a whole game to a winner without stalling", () => {
  const room = hostPlusBots(2026);

  let guard = 0;
  while (room.match && !room.match.winner && guard < 20000) {
    const onTurn = room.match.seats[room.match.hand.turn];

    if (!pumpRoom(room)) {
      // Nothing to auto-play: the only seat that can do this is the human host.
      // Drive it with the same heuristic so the run needs no browser.
      assert.equal(onTurn, "host", `stuck on ${onTurn} at guard ${guard}`);

      const action = chooseAction(publicState(room.match, onTurn));
      assert.ok(action, `no host action at guard ${guard}`);

      const result = applyGameAction(room, action);
      assert.equal(result.ok, true, `engine rejected ${JSON.stringify(action)}`);
    }

    guard += 1;
  }

  assert.ok(guard < 20000, "game did not finish within the guard");
  assert.ok(room.match?.winner);
});
