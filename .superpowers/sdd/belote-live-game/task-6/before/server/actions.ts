"use server";

import { redirect } from "next/navigation";

import {
  chooseTeam,
  createRoom,
  findRoom,
  joinRoom,
  leaveRoom,
  startGame,
  sweepStalePlayers,
} from "@/server/Rooms";
import type { Team } from "@/server/definitions";
import { getOrCreatePlayerId } from "@/server/player";

const MAX_NAME_LENGTH = 24;

function cleanName(formData: FormData) {
  return String(formData.get("username") ?? "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

export type JoinRoomState = { error: string } | null;

export async function joinRoomAction(
  _prevState: JoinRoomState,
  formData: FormData,
): Promise<JoinRoomState> {
  const name = cleanName(formData);

  if (!name) {
    return { error: "Enter a username" };
  }

  const code = String(formData.get("code") ?? "").trim();

  if (!code) {
    return { error: "Enter a room code" };
  }

  const room = findRoom(code);

  if (!room) {
    return { error: "Room not found" };
  }

  // Free seats held by players whose tabs went silent.
  sweepStalePlayers(room);

  const playerId = await getOrCreatePlayerId();
  const result = joinRoom(room, playerId, name);

  if (!result.ok) {
    return { error: "Room is full" };
  }

  redirect(`/room/${room.code}`);
}

export type CreateRoomState = { error: string } | null;

export async function createRoomAction(
  _prevState: CreateRoomState,
  formData: FormData,
): Promise<CreateRoomState> {
  const name = cleanName(formData);

  if (!name) {
    return { error: "Enter a username" };
  }

  const playerId = await getOrCreatePlayerId();
  const room = createRoom();

  joinRoom(room, playerId, name);

  redirect(`/room/${room.code}`);
}

export type TeamChoiceState = { error: string } | null;

export async function chooseTeamAction(
  _prevState: TeamChoiceState,
  formData: FormData,
): Promise<TeamChoiceState> {
  const teamValue = String(formData.get("team") ?? "");
  const team: Team | null =
    teamValue === "A" ? "A" : teamValue === "B" ? "B" : null;

  if (!team) {
    return { error: "Pick a team" };
  }

  const code = String(formData.get("code") ?? "").trim();
  const room = findRoom(code);

  if (!room) {
    return { error: "Room not found" };
  }

  const playerId = await getOrCreatePlayerId();
  const result = chooseTeam(room, playerId, team);

  if (!result.ok) {
    if (result.reason === "full") {
      return { error: `Team ${team} is full` };
    }
    if (result.reason === "started") {
      return { error: "The game has already started" };
    }
    return { error: "You are not in this room" };
  }

  return null;
}

export type StartGameState = { error: string } | null;

export async function startGameAction(
  _prevState: StartGameState,
  formData: FormData,
): Promise<StartGameState> {
  const code = String(formData.get("code") ?? "").trim();
  const room = findRoom(code);

  if (!room) {
    return { error: "Room not found" };
  }

  const playerId = await getOrCreatePlayerId();
  const result = startGame(room, playerId);

  if (!result.ok) {
    if (result.reason === "not_host") {
      return { error: "Only the host can start the game" };
    }
    if (result.reason === "need_four") {
      return { error: "Need 4 players to start" };
    }
    return { error: "All players must choose a team first" };
  }

  return null;
}

export async function leaveRoomAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  const room = findRoom(code);

  if (room) {
    const playerId = await getOrCreatePlayerId();
    leaveRoom(room, playerId);
  }

  redirect("/");
}