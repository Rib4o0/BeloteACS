"use client";

import { useEffect, useState, useTransition } from "react";

import {
  addBotAction,
  chooseTeamAction,
  leaveRoomAction,
  startGameAction,
} from "@/server/actions";
import type { Team } from "@/server/definitions";
import type { Contract, PublicMatch, Seat } from "@/server/game/index.ts";
import type { RoomView } from "@/server/rooms/view";
import GameTable from "./GameTable";
import RoomCodeModal from "./RoomCodeModal";
import {
  allTeamsPicked,
  assignTeam,
  seatSlots,
  SEAT_COUNT,
  type LobbyPlayer,
} from "./lobby";
import { contractLabel, isRedSuit, suitSymbol } from "./table";
import { useRoomStream } from "./useRoomStream";

const TEAMS: Team[] = ["A", "B"];

const badgeClass = "rounded px-1.5 py-0.5 text-xs";

function TeamBadge({ team }: { team: Team }) {
  return (
    <span
      className={`${badgeClass} ${
        team === "A"
          ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
          : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
      }`}
    >
      Team {team}
    </span>
  );
}

function hostBadge() {
  return <span className={`${badgeClass} bg-amber-100 dark:bg-amber-900`}>host</span>;
}

function botBadge() {
  return (
    <span className={`${badgeClass} bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300`}>
      bot
    </span>
  );
}

/** Shown whenever the live stream is not connected (lobby or table). */
function Reconnecting() {
  return (
    <p className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
      Reconnecting…
    </p>
  );
}

export default function RoomLobby({
  code,
  currentPlayerId,
  initial,
}: {
  code: string;
  currentPlayerId: string | undefined;
  initial: RoomView;
}) {
  const { room, connected } = useRoomStream(code, initial);
  const [pendingTeam, setPendingTeam] = useState<Team | null>(null);
  const [starting, setStarting] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [teamPending, startTeamTransition] = useTransition();
  const [startPending, startStartTransition] = useTransition();
  const [botError, setBotError] = useState<string | null>(null);
  const [botPending, startBotTransition] = useTransition();

  // Drop the optimistic team pick once the server echoes it back.
  useEffect(() => {
    if (!pendingTeam || !currentPlayerId) return;
    const mine = room.players.find((player) => player.id === currentPlayerId);
    if (mine?.team === pendingTeam) setPendingTeam(null);
  }, [room, pendingTeam, currentPlayerId]);

  const players =
    pendingTeam && currentPlayerId
      ? assignTeam(room.players, currentPlayerId, pendingTeam)
      : room.players;
  // Before the first match frame arrives, keep showing the "dealing" state.
  const playing = room.playing || (starting && room.match === null);
  const me = players.find((player) => player.id === currentPlayerId);
  const amHost = me?.host ?? false;
  const teamsReady = allTeamsPicked(players);
  const canStart = !playing && teamsReady;
  const teamIsFull = (team: Team) =>
    players.filter(
      (player) => player.team === team && player.id !== currentPlayerId,
    ).length >= 2;

  function pickTeam(team: Team) {
    if (!currentPlayerId || teamPending) return;
    setTeamError(null);
    setPendingTeam(team);

    const formData = new FormData();
    formData.set("code", code);
    formData.set("team", team);

    startTeamTransition(async () => {
      const result = await chooseTeamAction(null, formData);
      if (result?.error) {
        setTeamError(result.error);
        setPendingTeam(null);
      }
    });
  }

  function startGame() {
    if (startPending || !canStart) return;
    setStartError(null);
    setStarting(true);

    const formData = new FormData();
    formData.set("code", code);

    startStartTransition(async () => {
      const result = await startGameAction(null, formData);
      if (result?.error) {
        setStartError(result.error);
        setStarting(false);
      }
    });
  }

  function addBot() {
    if (botPending || !amHost || playing || players.length >= SEAT_COUNT) return;
    setBotError(null);

    const formData = new FormData();
    formData.set("code", code);

    startBotTransition(async () => {
      const result = await addBotAction(null, formData);
      if (result?.error) setBotError(result.error);
    });
  }

  function SeatCard({ player }: { player: LobbyPlayer }) {
    const teamTint =
      player.team === "A"
        ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
        : player.team === "B"
          ? "border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
          : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900";

    return (
      <div className={`rounded-xl border p-3 ${teamTint}`}>
        <div className="truncate text-center text-sm font-semibold">
          {player.name}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
          {player.team ? <TeamBadge team={player.team} /> : null}
          {player.host ? hostBadge() : null}
          {player.bot ? botBadge() : null}
          {!player.bot && player.id === currentPlayerId ? (
            <span className="text-xs text-zinc-500">(you)</span>
          ) : null}
        </div>
      </div>
    );
  }

  function EmptySeat() {
    return (
      <div className="flex min-h-[5.5rem] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
        <span className="animate-pulse text-sm text-zinc-400">
          Waiting for a player…
        </span>
      </div>
    );
  }

  const slots = seatSlots(players);
  const status =
    players.length < SEAT_COUNT
      ? `Waiting for players or bots to join (${players.length}/${SEAT_COUNT})`
      : teamsReady
        ? "Teams are set — ready to start"
        : "All 4 players are here — pick your teams";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="rounded-md bg-zinc-200/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600 sm:text-sm dark:bg-zinc-800 dark:text-zinc-300">
          Room {code}
        </span>

        {playing && room.match ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Scoreboard match={room.match} />
            <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
              Hand {room.match.handNumber}
            </span>
            <ContractStatus match={room.match} players={players} />
          </div>
        ) : null}
      </header>

      {connected ? null : <Reconnecting />}

      {playing ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {room.match ? (
            <GameTable code={code} players={players} match={room.match} />
          ) : (
            <p className="text-sm text-zinc-500">Dealing…</p>
          )}
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto pb-4">
          <p className="text-sm text-zinc-500">{status}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {slots.map((player, index) =>
              player ? (
                <SeatCard key={player.id} player={player} />
              ) : (
                <EmptySeat key={`empty-${index}`} />
              ),
            )}
          </div>

          {me ? (
            <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Your team
              </p>
              <div className="flex gap-2">
                {TEAMS.map((team) => {
                  const full = teamIsFull(team) && me.team !== team;

                  return (
                    <button
                      key={team}
                      type="button"
                      onClick={() => pickTeam(team)}
                      disabled={teamPending || full}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        me.team === team
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                          : "border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      }`}
                    >
                      Team {team}
                      {me.team === team ? " ✓" : full ? " (full)" : ""}
                    </button>
                  );
                })}
              </div>
              {teamError ? (
                <p role="alert" className="text-sm text-red-600">
                  {teamError}
                </p>
              ) : null}
            </div>
          ) : null}

          {amHost ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={startGame}
                disabled={startPending || !canStart}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Start game
              </button>

              {players.length < SEAT_COUNT ? (
                <button
                  type="button"
                  onClick={addBot}
                  disabled={botPending}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Add bot
                </button>
              ) : null}

              {!teamsReady ? (
                <p className="text-sm text-zinc-500">
                  {players.length < SEAT_COUNT
                    ? `Need 4 seats filled to start (${players.length}/${SEAT_COUNT})`
                    : "Waiting for players to pick their teams"}
                </p>
              ) : null}
              {startError ? (
                <p role="alert" className="text-sm text-red-600">
                  {startError}
                </p>
              ) : null}
              {botError ? (
                <p role="alert" className="text-sm text-red-600">
                  {botError}
                </p>
              ) : null}
            </div>
          ) : null}

          {me ? (
            <form action={leaveRoomAction}>
              <input type="hidden" name="code" value={code} />
              <button
                type="submit"
                className="text-sm text-zinc-500 underline-offset-2 hover:underline"
              >
                Leave room
              </button>
            </form>
          ) : null}
        </div>
      )}

      {amHost ? <RoomCodeModal code={code} /> : null}
    </div>
  );
}

function Scoreboard({ match }: { match: PublicMatch }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <TeamScore team="A" value={match.scores.A} />
      <span className="text-zinc-300 dark:text-zinc-600">–</span>
      <TeamScore team="B" value={match.scores.B} />
    </div>
  );
}

function TeamScore({ team, value }: { team: Team; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold text-white sm:h-6 sm:w-6 sm:text-xs ${
          team === "A" ? "bg-red-500" : "bg-sky-500"
        }`}
      >
        {team}
      </span>
      <span className="text-xl font-bold tabular-nums text-zinc-900 sm:text-2xl dark:text-zinc-50">
        {value}
      </span>
    </span>
  );
}

/** The live contract (or the current top bid), shown beside the hand number. */
function ContractStatus({
  match,
  players,
}: {
  match: PublicMatch;
  players: { id: string; name: string }[];
}) {
  const nameAt = (seat: Seat) =>
    players.find((player) => player.id === match.seats[seat])?.name ?? "—";

  if (match.hand.phase === "bidding") {
    const { top, topBidder } = match.hand;
    return (
      <span className="text-xs text-zinc-600 sm:text-sm dark:text-zinc-300">
        {top ? (
          <>
            Bidding — top <SuitLabel contract={top} /> by{" "}
            {topBidder === null ? "—" : nameAt(topBidder)}
          </>
        ) : (
          "Bidding"
        )}
      </span>
    );
  }

  return (
    <span className="text-xs text-zinc-600 sm:text-sm dark:text-zinc-300">
      Contract <SuitLabel contract={match.hand.contract} /> by{" "}
      {match.hand.taker === null ? "—" : nameAt(match.hand.taker)}
    </span>
  );
}

function SuitLabel({ contract }: { contract: Contract | null }) {
  if (!contract) return <>—</>;
  if (contract.kind !== "suit") return <>{contractLabel(contract)}</>;

  return (
    <span
      className={`font-semibold ${
        isRedSuit(contract.suit)
          ? "text-red-600 dark:text-red-400"
          : "text-zinc-900 dark:text-zinc-100"
      }`}
    >
      {suitSymbol(contract.suit)} {contractLabel(contract)}
    </span>
  );
}
