import test from "node:test";
import assert from "node:assert/strict";

import type { Card } from "./cards.ts";
import type { Contract } from "./contracts.ts";
import { applyAction, createMatch, legalActions, publicState } from "./engine.ts";
import { SEATS, type Action, type BiddingHand, type Match, type PlayingHand, type Seat } from "./types.ts";
import { seededRng, type Rng } from "./rng.ts";

const SEAT_IDS: [string, string, string, string] = ["p0", "p1", "p2", "p3"];
const clubs: Contract = { kind: "suit", suit: "clubs" };
const hearts: Contract = { kind: "suit", suit: "hearts" };

const c = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });
const key = (card: Card) => `${card.suit}:${card.rank}`;
const play = (seat: Seat, suit: Card["suit"], rank: Card["rank"]) => ({ seat, card: c(suit, rank) });

function mustApply(match: Match, action: Action, rng: Rng): Match {
  const result = applyAction(match, action, rng);
  assert.equal(result.error, undefined, `unexpected error: ${result.error}`);
  return result.match;
}

function toPlaying(rng: Rng): Match {
  let match = createMatch(SEAT_IDS, rng);
  match = mustApply(match, { kind: "bid", playerId: "p1", contract: clubs }, rng);
  match = mustApply(match, { kind: "pass", playerId: "p2" }, rng);
  match = mustApply(match, { kind: "pass", playerId: "p3" }, rng);
  match = mustApply(match, { kind: "pass", playerId: "p0" }, rng);
  return match;
}

const playingHand = (hand: PlayingHand): PlayingHand => hand;

// --- dealing ----------------------------------------------------------------

test("createMatch starts a bidding hand with five cards each and three in reserve", () => {
  const match = createMatch(SEAT_IDS, seededRng(1));
  const hand = match.hand as BiddingHand;

  assert.equal(hand.phase, "bidding");
  assert.equal(hand.dealer, 0);
  assert.equal(hand.turn, 1); // the player after the dealer
  assert.deepEqual(match.scores, { A: 0, B: 0 });
  assert.equal(match.handNumber, 1);
  assert.equal(match.winner, null);

  for (const seat of SEATS) {
    assert.equal(hand.hands[seat].length, 5);
    assert.equal(hand.rest[seat].length, 3);
  }

  const everyCard = SEATS.flatMap((seat) => [...hand.hands[seat], ...hand.rest[seat]]);
  assert.equal(everyCard.length, 32);
  assert.equal(new Set(everyCard.map(key)).size, 32);
});

test("the deal is deterministic for a seed", () => {
  const a = createMatch(SEAT_IDS, seededRng(5));
  const b = createMatch(SEAT_IDS, seededRng(5));

  assert.deepEqual(a.hand, b.hand);
});

// --- bidding ----------------------------------------------------------------

test("legalActions offers every contract plus pass on the opening turn", () => {
  const match = createMatch(SEAT_IDS, seededRng(1));
  const actions = legalActions(match, "p1");

  assert.equal(actions.filter((action) => action.kind === "bid").length, 6);
  assert.equal(actions.filter((action) => action.kind === "pass").length, 1);
});

test("legalActions is empty when it is not the player's turn", () => {
  const match = createMatch(SEAT_IDS, seededRng(1));

  assert.deepEqual(legalActions(match, "p2"), []);
});

test("the auction ends after a bid and three passes, then deals the rest", () => {
  const match = toPlaying(seededRng(1));
  const hand = match.hand as PlayingHand;

  assert.equal(hand.phase, "playing");
  assert.deepEqual(hand.contract, clubs);
  assert.equal(hand.taker, 1);
  assert.equal(hand.turn, 1); // the player after the dealer leads first
  for (const seat of SEATS) {
    assert.equal(hand.hands[seat].length, 8);
  }
});

test("an all-pass auction redeals without scoring", () => {
  const rng = seededRng(3);
  let match = createMatch(SEAT_IDS, rng);
  for (const id of ["p1", "p2", "p3", "p0"]) {
    match = mustApply(match, { kind: "pass", playerId: id }, rng);
  }

  assert.equal(match.hand.phase, "bidding");
  assert.equal(match.handNumber, 1);
  assert.equal((match.hand as BiddingHand).hands[0].length, 5);
});

// --- action validation ------------------------------------------------------

test("applyAction rejects a player who is not in the match", () => {
  const match = createMatch(SEAT_IDS, seededRng(1));

  assert.equal(applyAction(match, { kind: "pass", playerId: "ghost" }, seededRng(0)).error, "not_a_player");
});

test("applyAction rejects acting out of turn", () => {
  const match = createMatch(SEAT_IDS, seededRng(1));

  assert.equal(applyAction(match, { kind: "pass", playerId: "p3" }, seededRng(0)).error, "not_your_turn");
});

test("applyAction rejects a bid that is not stronger than the current top", () => {
  const rng = seededRng(1);
  let match = createMatch(SEAT_IDS, rng);
  match = mustApply(match, { kind: "bid", playerId: "p1", contract: { kind: "suit", suit: "spades" } }, rng);

  const result = applyAction(match, { kind: "bid", playerId: "p2", contract: clubs }, rng);

  assert.equal(result.error, "bid_too_weak");
});

test("applyAction rejects a play in the bidding phase", () => {
  const match = createMatch(SEAT_IDS, seededRng(1));

  assert.equal(applyAction(match, { kind: "play", playerId: "p1", card: c("spades", "7") }, seededRng(0)).error, "wrong_phase");
});

test("applyAction rejects bidding during play", () => {
  const match = toPlaying(seededRng(1));

  assert.equal(applyAction(match, { kind: "bid", playerId: "p1", contract: hearts }, seededRng(0)).error, "wrong_phase");
});

test("applyAction rejects a card the player does not hold", () => {
  const match: Match = {
    ...createMatch(SEAT_IDS, seededRng(1)),
    hand: {
      phase: "playing",
      dealer: 0,
      turn: 1,
      hands: { 0: [], 1: [c("spades", "A")], 2: [c("spades", "K"), c("clubs", "7")], 3: [] },
      contract: hearts,
      taker: 1,
      trick: [],
      tricks: [],
    },
  };

  assert.equal(applyAction(match, { kind: "play", playerId: "p1", card: c("clubs", "7") }, seededRng(0)).error, "card_not_held");
});

test("applyAction rejects a card that is illegal to play", () => {
  const rng = seededRng(1);
  let match: Match = {
    ...createMatch(SEAT_IDS, rng),
    hand: {
      phase: "playing",
      dealer: 0,
      turn: 1,
      hands: { 0: [], 1: [c("spades", "A")], 2: [c("spades", "K"), c("clubs", "7")], 3: [] },
      contract: hearts,
      taker: 1,
      trick: [],
      tricks: [],
    },
  };

  match = mustApply(match, { kind: "play", playerId: "p1", card: c("spades", "A") }, rng); // leads spades

  // seat 2 holds a spade, so discarding the club is illegal
  assert.equal(applyAction(match, { kind: "play", playerId: "p2", card: c("clubs", "7") }, rng).error, "card_not_legal");
});

test("applyAction rejects any action once the game is over", () => {
  const match: Match = { ...createMatch(SEAT_IDS, seededRng(1)), winner: "A" };

  assert.equal(applyAction(match, { kind: "pass", playerId: "p1" }, seededRng(0)).error, "game_over");
});

// --- full hand --------------------------------------------------------------

test("a full hand plays out, scores, and deals the next hand", () => {
  const rng = seededRng(1);
  let match = toPlaying(rng);

  for (let i = 0; i < 32; i++) {
    const hand = match.hand as PlayingHand;
    const action = legalActions(match, match.seats[hand.turn]).find((a) => a.kind === "play");
    assert.ok(action, `no legal play at move ${i}`);
    match = mustApply(match, action, rng);
  }

  assert.equal(match.handNumber, 2);
  assert.equal(match.hand.phase, "bidding");
  assert.ok(match.scores.A + match.scores.B > 0);
  assert.ok(match.lastOutcome);
  assert.equal((match.hand as BiddingHand).hands[0].length, 5);
});

// --- game end ---------------------------------------------------------------

test("a capot hand scores 350 but never ends the game", () => {
  const rng = seededRng(2);
  const aWin = () => [play(0, "hearts", "A"), play(1, "clubs", "7"), play(2, "diamonds", "7"), play(3, "spades", "7")];

  let match: Match = {
    ...createMatch(SEAT_IDS, rng),
    scores: { A: 150, B: 0 },
    hand: {
      phase: "playing",
      dealer: 0,
      turn: 0,
      hands: { 0: [c("hearts", "A")], 1: [c("clubs", "7")], 2: [c("diamonds", "7")], 3: [c("spades", "7")] },
      contract: hearts,
      taker: 0,
      trick: [],
      tricks: Array.from({ length: 7 }, aWin),
    },
  };

  match = mustApply(match, { kind: "play", playerId: "p0", card: c("hearts", "A") }, rng);
  match = mustApply(match, { kind: "play", playerId: "p1", card: c("clubs", "7") }, rng);
  match = mustApply(match, { kind: "play", playerId: "p2", card: c("diamonds", "7") }, rng);
  match = mustApply(match, { kind: "play", playerId: "p3", card: c("spades", "7") }, rng);

  assert.equal(match.winner, null);
  assert.equal(match.scores.A, 185); // 150 + 35
  assert.equal(match.handNumber, 2); // play continues
  assert.equal(match.lastOutcome?.capot, "A");
});

test("reaching 151 on a normal hand ends the game with the higher score", () => {
  const rng = seededRng(2);
  const aWin = () => [play(0, "hearts", "A"), play(1, "clubs", "7"), play(2, "diamonds", "7"), play(3, "spades", "7")];
  const bWin = () => [play(0, "spades", "7"), play(1, "hearts", "A"), play(2, "clubs", "7"), play(3, "diamonds", "7")];

  let match: Match = {
    ...createMatch(SEAT_IDS, rng),
    scores: { A: 145, B: 0 },
    hand: {
      phase: "playing",
      dealer: 0,
      turn: 0,
      hands: { 0: [c("hearts", "A")], 1: [c("clubs", "7")], 2: [c("diamonds", "7")], 3: [c("spades", "7")] },
      contract: hearts,
      taker: 0,
      trick: [],
      tricks: [...Array.from({ length: 6 }, aWin), bWin()], // 7 completed: 6 for A, 1 for B
    },
  };

  match = mustApply(match, { kind: "play", playerId: "p0", card: c("hearts", "A") }, rng);
  match = mustApply(match, { kind: "play", playerId: "p1", card: c("clubs", "7") }, rng);
  match = mustApply(match, { kind: "play", playerId: "p2", card: c("diamonds", "7") }, rng);
  match = mustApply(match, { kind: "play", playerId: "p3", card: c("spades", "7") }, rng);

  assert.equal(match.winner, "A");
  assert.equal(match.scores.A, 154); // 145 + game points for 87 raw
  assert.equal(match.handNumber, 1); // no new hand
});

// --- publicState ------------------------------------------------------------

test("publicState exposes only the viewer's own cards", () => {
  const match = createMatch(SEAT_IDS, seededRng(1));
  const view = publicState(match, "p1");

  assert.equal(view.you, 1);
  assert.equal(view.hand.hand.length, 5);
  assert.deepEqual(view.hand.cardsLeft, { 0: 5, 1: 5, 2: 5, 3: 5 });
  assert.equal("rest" in view.hand, false);
});

test("publicState includes the viewer's legal actions", () => {
  const match = createMatch(SEAT_IDS, seededRng(1));

  assert.equal(publicState(match, "p1").legal.length, 7); // six bids + pass
  assert.deepEqual(publicState(match, "p2").legal, []);
});

test("publicState reveals no cards to a spectator", () => {
  const view = publicState(createMatch(SEAT_IDS, seededRng(1)), "ghost");

  assert.equal(view.you, null);
  assert.deepEqual(view.hand.hand, []);
});

test("publicState carries the contract and trick state during play", () => {
  const view = publicState(toPlaying(seededRng(1)), "p1");

  assert.equal(view.hand.phase, "playing");
  assert.deepEqual(view.hand.contract, clubs);
  assert.equal(view.hand.taker, 1);
  assert.equal(view.hand.hand.length, 8);
  assert.equal(view.hand.tricksPlayed, 0);
});
