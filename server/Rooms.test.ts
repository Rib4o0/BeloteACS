import test from "node:test";
import assert from "node:assert/strict";

import {
  createRoom,
  findRoom,
  joinRoom,
  chooseTeam,
  startGame,
  touchPlayer,
  sweepStalePlayers,
  leaveRoom,
  applyGameAction,
  HEARTBEAT_TIMEOUT_MS,
} from "./Rooms.ts";
import { addBot } from "./rooms/bots.ts";

/** Fills a room to its 4-player capacity and returns the four player ids. */
function fillRoom() {
  const room = createRoom();
  const ids = ["player-1", "player-2", "player-3", "player-4"];

  for (const [index, id] of ids.entries()) {
    const result = joinRoom(room, id, `Player ${index + 1}`);
    assert.equal(result.ok, true);
  }

  return { room, ids };
}

test("findRoom finds a room that was created", () => {
  const room = createRoom();

  assert.equal(findRoom(room.code)?.code, room.code);
});

test("findRoom returns undefined for an unknown code", () => {
  assert.equal(findRoom("nope-not-a-room"), undefined);
});

test("findRoom trims surrounding whitespace", () => {
  const room = createRoom();

  assert.equal(findRoom(`  ${room.code}  `)?.code, room.code);
});

test("findRoom ignores case", () => {
  const room = createRoom();

  assert.equal(findRoom(room.code.toUpperCase())?.code, room.code);
});

test("the first player to join is the host", () => {
  const room = createRoom();

  const first = joinRoom(room, "player-1", "Alice");
  const second = joinRoom(room, "player-2", "Bob");

  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.player.host, true);
  }
  assert.equal(second.ok, true);
  if (second.ok) {
    assert.equal(second.player.host, false);
  }
});

test("joining twice does not add a duplicate player", () => {
  const room = createRoom();

  joinRoom(room, "player-1", "Alice");
  joinRoom(room, "player-1", "Alice");

  assert.equal(room.game.players.length, 1);
});

test("joining a fifth player is rejected when the room is full", () => {
  const { room } = fillRoom();

  const fifth = joinRoom(room, "player-5", "Eve");

  assert.deepEqual(fifth, { ok: false, reason: "full" });
  assert.equal(room.game.players.length, 4);
});

test("an existing player can rejoin a full room without duplicating", () => {
  const { room } = fillRoom();
  room.game.players[0].lastSeen = 0;

  const result = joinRoom(room, "player-1", "Alice");

  assert.equal(result.ok, true);
  assert.equal(room.game.players.length, 4);
  assert.equal(result.ok && result.player.lastSeen! > 0, true);
});

test("chooseTeam assigns a player to a team", () => {
  const { room, ids } = fillRoom();

  const result = chooseTeam(room, ids[0], "A");

  assert.deepEqual(result, { ok: true });
  assert.equal(room.game.players[0].team, "A");
});

test("chooseTeam is rejected when the team already has two players", () => {
  const { room, ids } = fillRoom();

  chooseTeam(room, ids[0], "A");
  chooseTeam(room, ids[1], "A");

  const third = chooseTeam(room, ids[2], "A");

  assert.deepEqual(third, { ok: false, reason: "full" });
  assert.equal(room.game.players[2].team, undefined);
});

test("a player can switch teams before the game starts", () => {
  const { room, ids } = fillRoom();
  chooseTeam(room, ids[0], "A");
  chooseTeam(room, ids[1], "B");

  const result = chooseTeam(room, ids[1], "A");

  assert.deepEqual(result, { ok: true });
  assert.equal(room.game.players[1].team, "A");
});

test("chooseTeam is rejected for a player who is not in the room", () => {
  const { room } = fillRoom();

  const result = chooseTeam(room, "ghost-player", "A");

  assert.deepEqual(result, { ok: false, reason: "not_player" });
});

test("chooseTeam is rejected after the game has started", () => {
  const { room, ids } = fillRoom();
  chooseTeam(room, ids[0], "A");
  chooseTeam(room, ids[1], "B");
  chooseTeam(room, ids[2], "A");
  chooseTeam(room, ids[3], "B");
  assert.deepEqual(startGame(room, ids[0]), { ok: true });

  const result = chooseTeam(room, ids[0], "B");

  assert.deepEqual(result, { ok: false, reason: "started" });
});

test("only the host can start the game", () => {
  const { room, ids } = fillRoom();

  const result = startGame(room, ids[1]);

  assert.deepEqual(result, { ok: false, reason: "not_host" });
  assert.equal(room.game.playing, false);
});

test("starting requires exactly four players", () => {
  const room = createRoom();
  joinRoom(room, "player-1", "Alice");
  joinRoom(room, "player-2", "Bob");
  joinRoom(room, "player-3", "Carol");

  const result = startGame(room, "player-1");

  assert.deepEqual(result, { ok: false, reason: "need_four" });
});

test("starting requires every player to have chosen a team", () => {
  const { room, ids } = fillRoom();
  chooseTeam(room, ids[0], "A");
  chooseTeam(room, ids[1], "B");
  chooseTeam(room, ids[2], "A");

  const result = startGame(room, ids[0]);

  assert.deepEqual(result, { ok: false, reason: "teams_incomplete" });
});

test("startGame marks the game as playing once the room is ready", () => {
  const { room, ids } = fillRoom();
  chooseTeam(room, ids[0], "A");
  chooseTeam(room, ids[1], "B");
  chooseTeam(room, ids[2], "A");
  chooseTeam(room, ids[3], "B");

  const result = startGame(room, ids[0]);

  assert.deepEqual(result, { ok: true });
  assert.equal(room.game.playing, true);
});

test("joinRoom records a lastSeen timestamp for a new player", () => {
  const room = createRoom();

  const result = joinRoom(room, "player-1", "Alice");

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(typeof result.player.lastSeen, "number");
  }
});

test("touchPlayer refreshes the player's lastSeen", () => {
  const room = createRoom();
  joinRoom(room, "player-1", "Alice");
  room.game.players[0].lastSeen = 0;

  const now = Date.now();

  assert.equal(touchPlayer(room, "player-1", now), true);
  assert.equal(room.game.players[0].lastSeen, now);
});

test("touchPlayer returns false for a player not in the room", () => {
  const room = createRoom();

  assert.equal(touchPlayer(room, "ghost", Date.now()), false);
});

test("sweepStalePlayers removes players whose heartbeat is stale before the game starts", () => {
  const room = createRoom();
  joinRoom(room, "player-1", "Alice");
  joinRoom(room, "player-2", "Bob");
  room.game.players[0].lastSeen = 0;

  sweepStalePlayers(room, Date.now());

  assert.equal(room.game.players.length, 1);
  assert.equal(room.game.players[0].id, "player-2");
});

test("sweepStalePlayers keeps players whose heartbeat is fresh", () => {
  const room = createRoom();
  joinRoom(room, "player-1", "Alice");
  room.game.players[0].lastSeen = Date.now();

  sweepStalePlayers(room, Date.now());

  assert.equal(room.game.players.length, 1);
});

test("sweepStalePlayers keeps stale players once the game has started", () => {
  const { room, ids } = fillRoom();
  chooseTeam(room, ids[0], "A");
  chooseTeam(room, ids[1], "B");
  chooseTeam(room, ids[2], "A");
  chooseTeam(room, ids[3], "B");
  assert.deepEqual(startGame(room, ids[0]), { ok: true });
  for (const player of room.game.players) {
    player.lastSeen = 0;
  }

  sweepStalePlayers(room, Date.now());

  assert.equal(room.game.players.length, 4);
});

test("sweepStalePlayers hands the host role to the next player when the host is removed", () => {
  const room = createRoom();
  joinRoom(room, "host-id", "Alice");
  joinRoom(room, "player-2", "Bob");
  room.game.players[0].lastSeen = 0;

  sweepStalePlayers(room, Date.now());

  assert.equal(room.game.players.length, 1);
  assert.equal(room.game.players[0].id, "player-2");
  assert.equal(room.game.players[0].host, true);
});

test("leaveRoom removes the player from the room", () => {
  const room = createRoom();
  joinRoom(room, "player-1", "Alice");
  joinRoom(room, "player-2", "Bob");

  const result = leaveRoom(room, "player-1");

  assert.deepEqual(result, { ok: true });
  assert.equal(room.game.players.length, 1);
  assert.equal(room.game.players[0].id, "player-2");
});

test("leaveRoom hands the host role to the next player when the host leaves", () => {
  const room = createRoom();
  joinRoom(room, "player-1", "Alice");
  joinRoom(room, "player-2", "Bob");

  const result = leaveRoom(room, "player-1");

  assert.equal(result.ok, true);
  assert.equal(room.game.players[0].host, true);
});

test("leaveRoom rejects a player who is not in the room", () => {
  const room = createRoom();
  joinRoom(room, "player-1", "Alice");

  assert.deepEqual(leaveRoom(room, "ghost"), {
    ok: false,
    reason: "not_player",
  });
});

test("createRoom starts with no match and a seeded rng", () => {
  const room = createRoom();

  assert.equal(room.match, null);
  assert.equal(typeof room.rng, "function");
});

test("createRoom accepts a seed for a reproducible rng", () => {
  const a = createRoom(1234);
  const b = createRoom(1234);

  assert.equal(a.rng(), b.rng());
  assert.equal(a.rng(), b.rng());
});

/** Starts a seeded four-player room with teams A B A B in join order. */
function startedRoom(seed = 1) {
  const room = createRoom(seed);
  const ids = ["p0", "p1", "p2", "p3"];
  const teams = ["A", "B", "A", "B"] as const;

  ids.forEach((id, index) => {
    joinRoom(room, id, id.toUpperCase());
    chooseTeam(room, id, teams[index]);
  });
  assert.deepEqual(startGame(room, "p0"), { ok: true });

  return { room, ids };
}

test("startGame deals a fresh match seated by team", () => {
  const { room } = startedRoom();

  assert.ok(room.match);
  assert.equal(room.match!.hand.phase, "bidding");
  assert.deepEqual(room.match!.seats, ["p0", "p1", "p2", "p3"]);
  assert.equal(room.match!.scores.A, 0);
});

test("the same seed deals the same opening hand", () => {
  const a = startedRoom(99);
  const b = startedRoom(99);

  assert.deepEqual(a.room.match!.hand, b.room.match!.hand);
});

test("applyGameAction rejects an action before the game starts", () => {
  const room = createRoom();

  const result = applyGameAction(room, { kind: "pass", playerId: "p0" });

  assert.deepEqual(result, { ok: false, error: "not_started" });
});

test("applyGameAction records a legal bid and advances the turn", () => {
  const { room } = startedRoom();
  const opener = room.match!.seats[1]; // the player after the dealer

  const result = applyGameAction(room, {
    kind: "bid",
    playerId: opener,
    contract: { kind: "suit", suit: "clubs" },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual((room.match!.hand as { top: unknown }).top, {
    kind: "suit",
    suit: "clubs",
  });
});

test("a second action out of turn is rejected without corrupting the match", () => {
  const { room } = startedRoom();
  const opener = room.match!.seats[1];

  applyGameAction(room, { kind: "pass", playerId: opener });
  const before = room.match;
  const snapshot = structuredClone(before);
  const second = applyGameAction(room, { kind: "pass", playerId: opener });

  assert.deepEqual(second, { ok: false, error: "not_your_turn" });
  assert.equal(room.match, before); // same reference
  assert.deepEqual(room.match, snapshot); // and unchanged in place
});

test("sweepStalePlayers keeps bots but drops a stale human", () => {
  const room = createRoom();
  const host = joinRoom(room, "host", "Host");
  assert.equal(host.ok, true);
  const bot = addBot(room, "host");
  assert.equal(bot.ok, true);

  // Far in the future: the human is long stale, the bot never heartbeats.
  sweepStalePlayers(room, Date.now() + HEARTBEAT_TIMEOUT_MS + 1);

  assert.deepEqual(
    room.game.players.map((player) => player.id),
    [bot.ok ? bot.player.id : "?"],
  );
});

test("ensureHost never promotes a bot", () => {
  const room = createRoom();
  joinRoom(room, "host", "Host");
  const bot = addBot(room, "host");
  assert.equal(bot.ok, true);

  leaveRoom(room, "host");

  assert.equal(room.game.players.some((player) => player.host), false);
  assert.equal(room.game.players.length, 1);
});