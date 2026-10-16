"use client";

import { useEffect, useState, useTransition } from "react";

import { chooseTeamAction, leaveRoomAction, startGameAction } from "@/server/actions";
import type { Team } from "@/server/definitions";
import type { RoomView } from "@/server/rooms/view";
import RoomCodeModal from "./RoomCodeModal";
import {
  allTeamsPicked,
  assignTeam,
  seatSlots,
  SEAT_COUNT,
  type LobbyPlayer,
} from "./lobby";
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

  function SeatCard({ player }: { player: LobbyPlayer }) {
    const teamTint =
      player.team === "A"
        ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
        : player.team === "B"
          ? "border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
          : "border-zinc-300 dark:border-zinc-700";

    return (
      <div className={`rounded-md border p-3 ${teamTint}`}>
        <div className="text-center text-sm font-medium">{player.name}</div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
          {player.team ? <TeamBadge team={player.team} /> : null}
          {player.host ? hostBadge() : null}
          {player.id === currentPlayerId ? (
            <span className="text-xs text-zinc-500">(you)</span>
          ) : null}
        </div>
      </div>
    );
  }

  function EmptySeat() {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-3 text-center dark:border-zinc-700">
        <span className="animate-pulse text-sm text-zinc-400">
          Waiting for a player…
        </span>
      </div>
    );
  }

  if (playing) {
    return room.match ? (
      // GameTable arrives in Task 11; placeholder until then.
      <p className="text-sm text-zinc-500">The game is starting…</p>
    ) : (
      <p className="text-sm text-zinc-500">Dealing…</p>
    );
  }

  const slots = seatSlots(players);
  const status =
    players.length < SEAT_COUNT
      ? `Waiting for players to join (${players.length}/${SEAT_COUNT})`
      : teamsReady
        ? "Teams are set — ready to start"
        : "All 4 players are here — pick your teams";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">{status}</p>

      {connected ? null : (
        <p className="text-xs text-amber-600">Reconnecting…</p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {slots.map((player, index) =>
          player ? (
            <SeatCard key={player.id} player={player} />
          ) : (
            <EmptySeat key={`empty-${index}`} />
          ),
        )}
      </div>

      {me ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-zinc-500">Your team</p>
          <div className="flex gap-2">
            {TEAMS.map((team) => {
              const full = teamIsFull(team) && me.team !== team;

              return (
                <button
                  key={team}
                  type="button"
                  onClick={() => pickTeam(team)}
                  disabled={teamPending || full}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
                    me.team === team
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                      : "border border-zinc-300 dark:border-zinc-700"
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
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Start game
          </button>
          {!teamsReady ? (
            <p className="text-sm text-zinc-500">
              {players.length < SEAT_COUNT
                ? `Need 4 players to start (${players.length}/${SEAT_COUNT})`
                : "Waiting for players to pick their teams"}
            </p>
          ) : null}
          {startError ? (
            <p role="alert" className="text-sm text-red-600">
              {startError}
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

      {amHost ? <RoomCodeModal code={code} /> : null}
    </div>
  );
}
