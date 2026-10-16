"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import type {
  Card,
  Contract,
  HandOutcome,
  PublicMatch,
  Seat,
  Team,
} from "@/server/game/index.ts";
import type { RoomPlayer } from "@/server/rooms/view";
import { CardBack, CardFace } from "./Card";
import {
  cardLabel,
  contractKey,
  contractLabel,
  fanAngle,
  fanLift,
  isPlayable,
  isRedSuit,
  screenSlot,
  sortHand,
  suitSymbol,
  type ScreenSlot,
} from "./table";

const SEATS: Seat[] = [0, 1, 2, 3];

/** The six bids, suits first then the two special contracts. */
const BIDS: Contract[] = [
  { kind: "suit", suit: "clubs" },
  { kind: "suit", suit: "diamonds" },
  { kind: "suit", suit: "hearts" },
  { kind: "suit", suit: "spades" },
  { kind: "nt" },
  { kind: "at" },
];

type OuterSlot = Exclude<ScreenSlot, "bottom">;

/** Placement of a seat panel in the table grid. */
const SEAT_AREA: Record<OuterSlot, string> = {
  top: "col-start-2 row-start-1 justify-self-center self-start",
  left: "col-start-1 row-start-2 justify-self-start self-center",
  right: "col-start-3 row-start-2 justify-self-end self-center",
};

/** Placement of a played card in the central trick grid. */
const TRICK_AREA: Record<OuterSlot, string> = {
  top: "col-start-2 row-start-1",
  left: "col-start-1 row-start-2",
  right: "col-start-3 row-start-2",
};

export default function GameTable({
  code,
  players,
  match,
}: {
  code: string;
  players: RoomPlayer[];
  match: PublicMatch;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [optimisticCard, setOptimisticCard] = useState<Card | null>(null);

  // Clear any optimistic echo as soon as fresh server state arrives.
  useEffect(() => {
    setOptimisticCard(null);
    setPending(false);
  }, [match]);

  const you = match.you;
  // A spectator is shown the table from seat 0's point of view.
  const viewer: Seat = you ?? 0;
  const others = SEATS.filter((seat) => seat !== viewer);

  const playerAt = (seat: Seat) => players.find((player) => player.id === match.seats[seat]);
  const nameOf = (seat: Seat) => playerAt(seat)?.name ?? "—";
  const teamOf = (seat: Seat) => playerAt(seat)?.team ?? null;
  const awayOf = (seat: Seat) => playerAt(seat)?.connected === false;

  const bidding = match.hand.phase === "bidding";
  const isYourTurn = you !== null && match.hand.turn === you;
  const viewerTeam = teamOf(viewer);
  const hand = sortHand(match.hand.hand ?? [], match.hand.contract);

  // The contract of the hand currently in play, kept so the hand-end summary can
  // name it after the engine has already dealt the next (bidding) hand.
  const [contractInPlay, setContractInPlay] = useState<Contract | null>(null);
  useEffect(() => {
    if (match.hand.phase === "playing") setContractInPlay(match.hand.contract);
  }, [match.hand.phase, match.hand.contract]);

  // How many hands have been scored. It only advances when a hand ends, so it is
  // a clean trigger for the summary; the initial value suppresses the popup for
  // anyone who joins or reloads after a hand has already finished.
  const completedHands = match.lastOutcome
    ? match.winner
      ? match.handNumber
      : match.handNumber - 1
    : 0;
  const [acknowledgedHand, setAcknowledgedHand] = useState(completedHands);
  const showSummary = match.lastOutcome !== null && completedHands > acknowledgedHand;

  const legalBidKeys = new Set(
    match.legal
      .filter((action) => action.kind === "bid")
      .map((action) => contractKey(action.contract)),
  );

  async function send(action: unknown, optimistic?: Card) {
    if (pending) return;
    setError(null);
    setPending(true);
    if (optimistic) setOptimisticCard(optimistic);

    try {
      const response = await fetch(`/api/rooms/${code}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(describe(data.error));
        setOptimisticCard(null);
      }
    } catch {
      setError("Could not reach the server");
      setOptimisticCard(null);
    } finally {
      setPending(false);
    }
  }

  /** The card in a seat's trick position, including the viewer's optimistic echo. */
  function trickAt(seat: Seat): { card: Card; ghost: boolean } | null {
    const played = match.hand.trick.find((play) => play.seat === seat);
    if (played) return { card: played.card, ghost: false };
    if (seat === you && optimisticCard) return { card: optimisticCard, ghost: true };
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {match.winner ? (
        <p className="rounded-xl bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.25)] sm:text-base">
          Game over — Team {match.winner} wins.
        </p>
      ) : null}

      <div className="felt flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-emerald-950/40 p-3 text-emerald-50 sm:p-5">
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-3 sm:gap-x-4">
          {others.map((seat) => {
            const slot = screenSlot(viewer, seat) as OuterSlot;
            return (
              <div key={seat} className={SEAT_AREA[slot]}>
                <SeatPanel
                  name={nameOf(seat)}
                  team={teamOf(seat)}
                  active={match.hand.turn === seat}
                  away={awayOf(seat)}
                />
              </div>
            );
          })}

          <div className="col-start-2 row-start-2 grid h-full w-full grid-cols-3 grid-rows-3 place-items-center gap-1">
            {others.map((seat) => {
              const slot = screenSlot(viewer, seat) as OuterSlot;
              return (
                <div key={seat} className={TRICK_AREA[slot]}>
                  <TrickCard play={trickAt(seat)} />
                </div>
              );
            })}
            <div className="col-start-2 row-start-3">
              <TrickCard play={trickAt(viewer)} />
            </div>
          </div>

          <div
            className="col-span-3 col-start-1 row-start-3 flex flex-col items-center gap-2"
            // The bow drops the outer cards past the hand's layout box, so lift
            // the whole block by that same amount to keep the lowest corners off
            // the felt edge. A short hand bows less, so the lift follows it.
            style={{ paddingBottom: fanLift(0, hand.length) + 6 }}
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm font-semibold text-emerald-50 sm:text-base">
                {nameOf(viewer)}
                {you !== null ? " (you)" : ""}
              </span>
              {viewerTeam ? <TeamChip team={viewerTeam} /> : null}
              {you !== null && match.hand.turn === you ? <TurnBadge /> : null}
            </div>

            {you !== null ? (
              <div className="flex items-end justify-center">
                {hand.map((card, idx) => {
                  const playable = isYourTurn && !bidding && isPlayable(card, match.legal);
                  return (
                    <div
                      key={`${match.handNumber}-${card.suit}-${card.rank}`}
                      className={`hand-fan-card shrink-0 ${idx > 0 ? "-ml-10 sm:-ml-14" : ""}`}
                      style={
                        {
                          "--fan-angle": `${fanAngle(idx, hand.length)}deg`,
                          "--fan-lift": `${fanLift(idx, hand.length)}px`,
                          "--fan-z": idx,
                        } as CSSProperties
                      }
                    >
                      <button
                        type="button"
                        disabled={!playable || pending}
                        aria-label={`Play ${cardLabel(card)}`}
                        onClick={() => send({ kind: "play", card }, card)}
                        style={{ animationDelay: `${idx * 40}ms` }}
                        className={`deal-card group block rounded-md transition-transform duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900 ${
                          playable
                            ? "cursor-pointer hover:-translate-y-3 focus-visible:-translate-y-3 active:translate-y-0"
                            : "cursor-not-allowed"
                        }`}
                      >
                        <CardFace
                          card={card}
                          size="lg"
                          className={
                            playable
                              ? "transition-shadow group-hover:shadow-[0_10px_18px_-6px_rgba(0,0,0,0.5)]"
                              : "opacity-45"
                          }
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-emerald-200/80 sm:text-sm">
                Spectating — you can watch but not play.
              </p>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-center text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {showSummary && match.lastOutcome ? (
        <HandSummary
          handNumber={completedHands}
          outcome={match.lastOutcome}
          contract={contractInPlay}
          scores={match.scores}
          winner={match.winner}
          takerName={nameOf(match.lastOutcome.taker)}
          onClose={() => setAcknowledgedHand(completedHands)}
        />
      ) : bidding && isYourTurn ? (
        <BiddingModal
          hand={hand}
          top={match.hand.top}
          topBidderName={match.hand.topBidder === null ? null : nameOf(match.hand.topBidder)}
          legalBidKeys={legalBidKeys}
          pending={pending}
          onBid={(contract) => send({ kind: "bid", contract })}
          onPass={() => send({ kind: "pass" })}
        />
      ) : null}
    </div>
  );
}

function SeatPanel({
  name,
  team,
  active,
  away,
}: {
  name: string;
  team: Team | null;
  active: boolean;
  away: boolean;
}) {
  return (
    <div
      className={`w-full max-w-[13rem] rounded-xl border px-3 py-2 transition-colors sm:max-w-[15rem] sm:px-4 sm:py-2.5 ${
        active
          ? "border-amber-300/80 bg-black/40 ring-2 ring-amber-300/50"
          : "border-white/10 bg-black/25"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-emerald-50 sm:text-base">
          {name}
        </span>
        {team ? <TeamChip team={team} /> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="flex -space-x-2" aria-hidden="true">
          <CardBack size="xs" />
          <CardBack size="xs" />
          <CardBack size="xs" />
        </span>
        {away ? (
          <span className="rounded bg-zinc-700/80 px-1.5 py-0.5 text-[10px] text-zinc-200 sm:text-xs">
            away
          </span>
        ) : null}
        {active ? <TurnBadge /> : null}
      </div>
    </div>
  );
}

function TrickCard({ play }: { play: { card: Card; ghost: boolean } | null }) {
  if (!play) {
    return (
      <span className="block h-16 w-11 rounded-md border border-dashed border-white/15 sm:h-[5.5rem] sm:w-16" />
    );
  }

  return (
    <CardFace
      card={play.card}
      size="md"
      className={`card-in ${play.ghost ? "opacity-60 ring-2 ring-amber-300/70" : ""}`}
    />
  );
}

function TeamChip({ team }: { team: Team }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white sm:text-xs ${
        team === "A" ? "bg-red-500/90" : "bg-sky-500/90"
      }`}
    >
      TEAM {team}
    </span>
  );
}

function TurnBadge() {
  return (
    <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 sm:text-xs">
      to play
    </span>
  );
}

function BiddingModal({
  hand,
  top,
  topBidderName,
  legalBidKeys,
  pending,
  onBid,
  onPass,
}: {
  hand: Card[];
  top: Contract | null;
  topBidderName: string | null;
  legalBidKeys: Set<string>;
  pending: boolean;
  onBid: (contract: Contract) => void;
  onPass: () => void;
}) {
  const topLabel = top
    ? `Top: ${contractLabel(top)}${topBidderName ? ` by ${topBidderName}` : ""}`
    : "No bid yet";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bid-title"
        tabIndex={-1}
        autoFocus
        className="slide-up w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="bid-title"
            className="text-lg font-semibold text-zinc-900 sm:text-xl dark:text-zinc-50"
          >
            Your turn to bid
          </h2>
          <span className="text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">{topLabel}</span>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-1.5 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
          {hand.map((card) => (
            <CardFace key={`${card.suit}-${card.rank}`} card={card} size="md" />
          ))}
        </div>

        {/* Suits down the left column; the special contracts down the right. */}
        <div className="mt-4 grid grid-flow-col grid-cols-2 grid-rows-4 gap-2">
          {BIDS.map((contract) => {
            const legal = legalBidKeys.has(contractKey(contract));
            const red = contract.kind === "suit" && isRedSuit(contract.suit);
            return (
              <button
                key={contractKey(contract)}
                type="button"
                disabled={!legal || pending}
                onClick={() => onBid(contract)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed sm:text-base ${
                  legal
                    ? "border-zinc-300 bg-white text-zinc-900 hover:border-emerald-500 hover:bg-emerald-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                    : "border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
                }`}
              >
                {contract.kind === "suit" ? (
                  <span className={`text-base sm:text-lg ${red ? "text-red-600" : ""}`}>
                    {suitSymbol(contract.suit)}
                  </span>
                ) : null}
                <span>{contractLabel(contract)}</span>
              </button>
            );
          })}

          <PlaceholderBid label="Contre" multiplier="×2" />
          <PlaceholderBid label="Surcontre" multiplier="×4" />
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={onPass}
          className="mt-3 w-full rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-60 sm:text-base dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          Pass
        </button>
      </div>
    </div>
  );
}

function PlaceholderBid({ label, multiplier }: { label: string; multiplier: string }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-400 sm:text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600"
    >
      <span>{label}</span>
      <span className="rounded bg-zinc-200 px-1 text-[10px] font-bold text-zinc-500 sm:text-xs dark:bg-zinc-800 dark:text-zinc-400">
        {multiplier}
      </span>
    </button>
  );
}

/** The hand-end result: how many points each team took, and the running score. */
function HandSummary({
  handNumber,
  outcome,
  contract,
  scores,
  winner,
  takerName,
  onClose,
}: {
  handNumber: number;
  outcome: HandOutcome;
  contract: Contract | null;
  scores: Record<Team, number>;
  winner: Team | null;
  takerName: string;
  onClose: () => void;
}) {
  const caption = [
    contract
      ? `${contractLabel(contract)} by ${takerName}`
      : `Taken by ${takerName}`,
    outcome.capot ? `capot by Team ${outcome.capot}` : null,
    outcome.dedans ? "dedans" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // React's `autoFocus` is unreliable on a non-form element, so focus the dialog
  // explicitly once it mounts.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hand-summary-title"
        tabIndex={-1}
        ref={dialogRef}
        className="fade-in w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2
          id="hand-summary-title"
          className="text-lg font-semibold text-zinc-900 sm:text-xl dark:text-zinc-50"
        >
          Hand {handNumber} complete
        </h2>
        <p className="mt-1 text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">{caption}</p>

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div className="grid grid-cols-[1fr_3.5rem_4.5rem] items-center gap-x-3 bg-zinc-50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <span>Team</span>
            <span className="text-right">Hand</span>
            <span className="text-right">Gained</span>
          </div>
          {(["A", "B"] as Team[]).map((team) => (
            <div
              key={team}
              className="grid grid-cols-[1fr_3.5rem_4.5rem] items-center gap-x-3 border-t border-zinc-100 px-3 py-2 text-sm tabular-nums dark:border-zinc-800"
            >
              {/* justify-start keeps the chip at its own width instead of
                  stretching across the column like a bar. */}
              <span className="flex justify-start">
                <TeamChip team={team} />
              </span>
              <span className="text-right text-zinc-600 dark:text-zinc-300">
                {outcome.raw[team]}
              </span>
              <span className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                +{outcome.gamePoints[team]}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
          <span className="text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">New score</span>
          <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            A {scores.A} – B {scores.B}
          </span>
        </div>

        {winner ? (
          <p className="mt-3 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            Team {winner} wins the game!
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 sm:text-base dark:focus-visible:ring-offset-zinc-900"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function describe(error: string): string {
  const messages: Record<string, string> = {
    not_your_turn: "It's not your turn",
    card_not_held: "You don't hold that card",
    card_not_legal: "That card can't be played",
    bid_too_weak: "That bid is too low",
    wrong_phase: "Not allowed right now",
    game_over: "The game is over",
    not_a_player: "You are not in this game",
    not_started: "The game has not started",
    bad_request: "That move was rejected",
    room_not_found: "This room no longer exists",
  };
  return messages[error] ?? "That move was rejected";
}
