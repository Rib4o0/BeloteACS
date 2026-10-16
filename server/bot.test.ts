import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAction,
  createMatch,
  publicState,
  seededRng,
  type Card,
  type Contract,
  type Match,
  type Play,
  type PlayingHand,
} from "./game/index.ts";
import { chooseAction } from "./bot.ts";

const SEATS: [string, string, string, string] = ["p0", "p1", "p2", "p3"];
const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });

/** A fresh match in the bidding phase with seat 1 on turn holding `hand`. */
function biddingAt(hand: Card[]): Match {
  const match = createMatch(SEATS, seededRng(1));
  const bidding = match.hand as Extract<Match["hand"], { phase: "bidding" }>;
  bidding.hands = { 0: [], 1: hand, 2: [], 3: [] };
  bidding.rest = { 0: [], 1: [], 2: [], 3: [] };
  bidding.top = null;
  bidding.turn = 1;
  return match;
}

/** A match in trick play with seat 1 on turn holding `hand` over `trick`. */
function playingAt(
  hand: Card[],
  trick: Play[],
  contract: Contract = { kind: "suit", suit: "hearts" },
): Match {
  const match = createMatch(SEATS, seededRng(1));
  const playing: PlayingHand = {
    phase: "playing",
    dealer: 0,
    turn: 1,
    hands: { 0: [], 1: hand, 2: [], 3: [] },
    contract,
    taker: 1,
    trick,
    tricks: [],
  };
  match.hand = playing;
  return match;
}

function choose(match: Match, seatId = "p1") {
  return chooseAction(publicState(match, seatId));
}

test("bids the strongest suit on a strong hand", () => {
  const match = biddingAt([
    card("hearts", "J"),
    card("hearts", "9"),
    card("hearts", "A"),
    card("hearts", "10"),
    card("hearts", "K"),
  ]);

  const action = choose(match);

  assert.equal(action?.kind, "bid");
  if (action?.kind === "bid") {
    assert.deepEqual(action.contract, { kind: "suit", suit: "hearts" });
  }
});

test("passes on a worthless hand", () => {
  const match = biddingAt([
    card("clubs", "7"),
    card("diamonds", "8"),
    card("hearts", "7"),
    card("spades", "8"),
    card("diamonds", "7"),
  ]);

  assert.equal(choose(match)?.kind, "pass");
});

test("leads a plain ace when it holds one", () => {
  const match = playingAt(
    [
      card("clubs", "A"),
      card("diamonds", "7"),
      card("diamonds", "8"),
      card("diamonds", "9"),
      card("spades", "10"),
    ],
    [],
  );

  const action = choose(match);

  assert.equal(action?.kind, "play");
  if (action?.kind === "play") {
    assert.deepEqual(action.card, card("clubs", "A"));
  }
});

test("follows suit when it must", () => {
  const match = playingAt(
    [card("diamonds", "7"), card("diamonds", "K"), card("clubs", "A")],
    [{ seat: 0, card: card("diamonds", "10") }],
  );

  const action = choose(match);

  assert.equal(action?.kind, "play");
  if (action?.kind === "play") {
    assert.equal(action.card.suit, "diamonds");
  }
});

test("dumps the lowest card when the partner is winning", () => {
  // Seat 3 is the bot's partner (partnerSeat(1)) and currently holds the best card.
  const match = playingAt(
    [card("clubs", "K"), card("clubs", "9"), card("spades", "A")],
    [
      { seat: 3, card: card("diamonds", "A") },
      { seat: 0, card: card("diamonds", "7") },
    ],
  );

  const action = choose(match);

  assert.equal(action?.kind, "play");
  if (action?.kind === "play") {
    assert.deepEqual(action.card, card("clubs", "9"));
  }
});

test("beats an opponent with the cheapest winning card", () => {
  const match = playingAt(
    [card("diamonds", "8"), card("diamonds", "K"), card("diamonds", "A")],
    [{ seat: 0, card: card("diamonds", "7") }],
  );

  const action = choose(match);

  assert.equal(action?.kind, "play");
  if (action?.kind === "play") {
    assert.deepEqual(action.card, card("diamonds", "8"));
  }
});

test("discards low when it cannot beat the trick", () => {
  const match = playingAt(
    [card("diamonds", "K"), card("diamonds", "7")],
    [{ seat: 0, card: card("diamonds", "A") }],
  );

  const action = choose(match);

  assert.equal(action?.kind, "play");
  if (action?.kind === "play") {
    assert.deepEqual(action.card, card("diamonds", "7"));
  }
});

test("returns null when it is not the bot's turn", () => {
  const match = playingAt([card("diamonds", "7")], []);

  assert.equal(choose(match, "p0"), null);
});

test("only ever returns actions the engine accepts (full game)", () => {
  const rng = seededRng(2026);
  let match = createMatch(SEATS, rng);

  for (let guard = 0; guard < 20000 && !match.winner; guard++) {
    const onTurn = match.seats[match.hand.turn];
    const action = chooseAction(publicState(match, onTurn));

    assert.ok(action, `no action at guard ${guard}`);

    const result = applyAction(match, action, rng);

    assert.equal(result.error, undefined, `engine rejected ${JSON.stringify(action)}`);
    match = result.match;
  }

  assert.ok(match.winner, "game did not finish within the guard");
});
