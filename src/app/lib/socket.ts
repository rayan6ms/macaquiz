import type { ClientToServerEvents, ServerToClientEvents } from "./events";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import type { PublicState } from "./types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export async function getSocket(): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  if (socket) return socket;

  // ensure server is initialized
  await fetch("/api/socket");

  socket = io({
    path: "/api/socket",
  });

  return socket;
}

export function onState(s: Socket, cb: (state: PublicState) => void) {
  s.on("state", cb);
  return () => s.off("state", cb);
}
