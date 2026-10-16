"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { chooseTeamAction, leaveRoomAction, startGameAction } from "@/server/actions";
import type { Team } from "@/server/definitions";
import RoomCodeModal from "./RoomCodeModal";
import {
  allTeamsPicked,
  assignTeam,
  seatSlots,
  SEAT_COUNT,
  type LobbyPlayer,
} from "./lobby";

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
  initialPlaying,
  initialPlayers,
}: {
  code: string;
  currentPlayerId: string | undefined;
  initialPlaying: boolean;
  initialPlayers: LobbyPlayer[];
}) {
  const [players, setPlayers] = useState<LobbyPlayer[]>(initialPlayers);
  const [playing, setPlaying] = useState<boolean>(initialPlaying);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [teamPending, startTeamTransition] = useTransition();
  const [startPending, startStartTransition] = useTransition();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${code}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: currentPlayerId ?? null }),
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      if (mounted.current) {
        setPlayers(data.players);
        setPlaying(data.playing);
      }
    } catch {
      // Transient polling failure; try again on the next tick.
    }
  }, [code, currentPlayerId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);

    return () => clearInterval(interval);
  }, [refresh]);

  const me = players.find((player) => player.id === currentPlayerId);
  // Host role follows the live player list so a transferred host picks up the
  // role (Start button + room code) as soon as the poll reports the change.
  const amHost = me?.host ?? false;
  const teamsReady = allTeamsPicked(players);
  const canStart = !playing && teamsReady;
  const teamIsFull = (team: Team) =>
    players.filter(
      (player) => player.team === team && player.id !== currentPlayerId,
    ).length >= 2;

  function pickTeam(team: Team) {
    if (!currentPlayerId || teamPending) {
      return;
    }

    // Optimistic: reflect the choice immediately, then persist.
    setTeamError(null);
    setPlayers((current) => assignTeam(current, currentPlayerId, team));

    const formData = new FormData();
    formData.set("code", code);
    formData.set("team", team);

    startTeamTransition(async () => {
      const result = await chooseTeamAction(null, formData);

      if (result?.error) {
        setTeamError(result.error);
      }

      await refresh();
    });
  }

  function startGame() {
    if (startPending || !canStart) {
      return;
    }

    // Optimistic: show the started screen immediately, then persist.
    setStartError(null);
    setPlaying(true);

    const formData = new FormData();
    formData.set("code", code);

    startStartTransition(async () => {
      const result = await startGameAction(null, formData);

      if (result?.error) {
        setStartError(result.error);
        setPlaying(false);
      }

      await refresh();
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

  function PlayerRow({ player }: { player: LobbyPlayer }) {
    return (
      <li key={player.id} className="flex items-center gap-2 text-sm">
        <span>{player.name}</span>
        {player.host ? hostBadge() : null}
        {player.team ? <TeamBadge team={player.team} /> : null}
        {player.connected ? null : (
          <span className="text-xs text-zinc-400">away</span>
        )}
        {player.id === currentPlayerId ? (
          <span className="text-zinc-500">(you)</span>
        ) : null}
      </li>
    );
  }

  if (playing) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Game started</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {TEAMS.map((team) => (
            <div
              key={team}
              className="rounded-md border border-zinc-300 p-3 dark:border-zinc-700"
            >
              <h3 className="mb-2 text-sm font-semibold">
                {team === "A" ? "Team A" : "Team B"}
              </h3>
              <ul className="flex flex-col gap-1">
                {players
                  .filter((player) => player.team === team)
                  .map((player) => (
                    <PlayerRow key={player.id} player={player} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-sm text-zinc-500">The game engine is coming soon.</p>
      </div>
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