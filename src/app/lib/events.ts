import type { OptionKey } from "./types";

export type Role = "host" | "player";

export type ClientToServerEvents = {
  request_state: () => void;

  set_role: (payload: {
    role: Role;
    clientId: string;
    name?: string;
    icon?: string;
  }) => void;

  choose_game: (payload: { gameId: string }) => void;

  // ✅ lobby ready + start
  set_ready: (payload: { ready: boolean }) => void;
  start_game: () => void;

  answer: (payload: { option: OptionKey }) => void;
  unlock_answer: () => void;

  toggle_pause: () => void;
  restart: () => void;
  force_reset: () => void;

  navigate: (payload: { dir: -1 | 1 }) => void;

  force_reveal: () => void;

  kick_player: (payload: { clientId: string }) => void;
};

export type ServerToClientEvents = {
  state: (state: import("./types").PublicState) => void;
  toast: (payload: { type: "error" | "info"; message: string }) => void;
  force_reset: () => void;
};
