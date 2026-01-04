"use client";

import { useEffect, useMemo, useState } from "react";
import type { OptionKey, PublicState } from "./lib/types";
import { getSocket, onState } from "./lib/socket";
import { safeParseJSON, pickOne } from "./lib/utils";
import { ICONS } from "./lib/icons";
import HostView from "./components/HostView";
import PlayerView from "./components/PlayerView";
import GamePicker from "./components/GamePicker";
import { FiMonitor, FiUser } from "react-icons/fi";
import { uuid } from "./lib/uuid";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./lib/events";

type Role = "none" | "host" | "player";

type Identity = {
  clientId: string;
  name: string;
  icon: string;
};

const LS_KEY = "quiz_identity_v1";
const NAME_OPTIONS = [
  "chungus",
  "mongus",
  "mingus",
  "numbo",
  "nimbo",
  "nimbus",
  "linus",
  "sinus",
  "binus",
  "bonis",
  "lingus",
  "langus",
  "venus",
  "vinus",
  "vanos",
  "rinus",
  "ronis",
  "ranos",
  "tanos",
  "tunis",
  "tinus",
  "gonus",
  "ginus",
  "ganos",
  "janos",
  "jenos",
  "jinus",
  "kekos",
  "kinos",
  "kanos",
  "fanos",
  "finus",
  "funis",
  "dinos",
  "dinus",
  "danos",
  "donis",
  "donus",
];

function capitalizeName(value: string) {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function makeIdentity(): Identity {
  const clientId = uuid();
  const name = capitalizeName(pickOne(NAME_OPTIONS));
  const icon = pickOne(ICONS);
  return { clientId, name, icon };
}

async function setReady(ready: boolean) {
  const s = await getSocket();
  s.emit("set_ready", { ready });
}

async function startGame() {
  const s = await getSocket();
  s.emit("start_game");
}

export default function Page() {
  const [role, setRole] = useState<Role>("none");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [showPlayerSetup, setShowPlayerSetup] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftIcon, setDraftIcon] = useState("");
  const [state, setState] = useState<PublicState>({
    hasHost: false,
    hostConnected: false,
    phase: "lobby",
    currentQuestionIndex: 0,
    questionDurationMs: 20000,
    remainingMs: 0,
    paused: false,
    readyCount: 0,
    allPlayersReady: false,
    players: [],
    answersCount: 0,
    playersCount: 0,
  });

  const canBeHost = useMemo(() => {
    // host button disabled for anyone else if a host exists
    if (!state.hasHost) return true;
    if (state.hostClientId && identity?.clientId === state.hostClientId) return true;
    return !state.hostConnected && state.phase === "lobby";
  }, [state.hasHost, state.hostClientId, state.hostConnected, state.phase, identity?.clientId]);

  const canPrev = useMemo(() => state.currentQuestionIndex > 0, [state.currentQuestionIndex]);
  const canNext = useMemo(() => {
    const total = state.game?.questionCount ?? 0;
    return total > 0 && state.currentQuestionIndex < total - 1;
  }, [state.currentQuestionIndex, state.game?.questionCount]);
  const gameInProgress = state.phase !== "lobby";
  const isKnownHost = Boolean(identity?.clientId && state.hostClientId === identity.clientId);
  const isKnownPlayer = Boolean(identity?.clientId && state.players.some((p) => p.clientId === identity.clientId));
  const isReturningToGame = gameInProgress && Boolean(isKnownHost || isKnownPlayer);

  useEffect(() => {
    // Run after hydration to avoid server/client HTML mismatch
    const t = setTimeout(() => {
      const cached = safeParseJSON<Identity>(localStorage.getItem(LS_KEY));
      const id =
        cached?.clientId && cached?.name && cached?.icon ? cached : makeIdentity();

      localStorage.setItem(LS_KEY, JSON.stringify(id));
      setIdentity(id);
    }, 0);

    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!identity) return;
    localStorage.setItem(LS_KEY, JSON.stringify(identity));
  }, [identity]);

  useEffect(() => {
    if (!identity || role !== "none") return;
    if (!isKnownHost && !isKnownPlayer) return;

    (async () => {
      const s = await getSocket();
      if (isKnownHost) {
        setRole("host");
        s.emit("set_role", { role: "host", clientId: identity.clientId });
        return;
      }

      setRole("player");
      s.emit("set_role", {
        role: "player",
        clientId: identity.clientId,
        name: identity.name,
        icon: identity.icon,
      });
    })();
  }, [identity, isKnownHost, isKnownPlayer, role]);

  useEffect(() => {
    let off: (() => void) | null = null;
    let s: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

    (async () => {
      s = await getSocket();
      off = onState(s, setState);
      s.on("force_reset", () => {
        setRole("none");
        setShowPlayerSetup(false);
      });
      s.emit("request_state");
    })();

    return () => {
      off?.();
      s?.off?.("state");
      s?.off?.("force_reset");
    };
  }, []);

  async function enterAsHost() {
    if (!identity) return;
    setShowPlayerSetup(false);
    const s = await getSocket();
    setRole("host");
    s.emit("set_role", { role: "host", clientId: identity.clientId });
  }

  function openPlayerSetup() {
    if (!identity) return;
    setDraftName(identity.name);
    setDraftIcon(identity.icon);
    setShowPlayerSetup(true);
  }

  async function confirmPlayerSetup() {
    if (!identity) return;
    const nextName = draftName.trim() ? capitalizeName(draftName.trim()) : identity.name;
    const nextIcon = draftIcon || identity.icon;
    const nextIdentity = { ...identity, name: nextName, icon: nextIcon };
    setIdentity(nextIdentity);
    const s = await getSocket();
    setRole("player");
    setShowPlayerSetup(false);
    s.emit("set_role", {
      role: "player",
      clientId: nextIdentity.clientId,
      name: nextIdentity.name,
      icon: nextIdentity.icon,
    });
  }

  async function pickGame(gameId: string) {
    const s = await getSocket();
    s.emit("choose_game", { gameId });
  }

  async function answer(option: OptionKey) {
    const s = await getSocket();
    s.emit("answer", { option });
  }

  async function unlockAnswer() {
    const s = await getSocket();
    s.emit("unlock_answer");
  }

  async function prev() {
    const s = await getSocket();
    s.emit("navigate", { dir: -1 });
  }

  async function next() {
    const s = await getSocket();
    s.emit("navigate", { dir: 1 });
  }

  async function togglePause() {
    const s = await getSocket();
    s.emit("toggle_pause");
  }

  async function restart() {
    const s = await getSocket();
    s.emit("restart");
  }

  async function forceReveal() {
    const s = await getSocket();
    s.emit("force_reveal");
  }

  async function forceReset() {
    const s = await getSocket();
    s.emit("force_reset");
  }

  async function kickPlayer(clientId: string) {
    const s = await getSocket();
    s.emit("kick_player", { clientId });
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-4 sm:p-8">
      <div
        className={[
          "mx-auto w-full",
          role === "host" ? "max-w-[1600px]" : "max-w-6xl",
        ].join(" ")}
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 text-white">
          <div>
            <div className="text-sm opacity-80">Quiz em tempo real</div>
            <div className="flex space-x-3 items-center">
              <img src="logo.svg" alt="Logo" className="h-10 w-10" />
              <div className="text-3xl font-bold tracking-tight">Macaquiz</div>
            </div>
          </div>
          {identity && role !== "host" && (
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 backdrop-blur">
              <img src={identity.icon} alt="" className="h-10 w-10 rounded-lg" />
              <div className="text-sm">
                <div className="opacity-80">Você</div>
                <div className="font-semibold">{identity.name}</div>
              </div>
            </div>
          )}
        </div>

        {role === "none" &&
          (isReturningToGame ? (
            <div className="rounded-3xl bg-white/10 p-6 text-white backdrop-blur">
              <div className="text-2xl font-semibold">Entrando novamente no seu jogo…</div>
              <div className="mt-2 opacity-80">Aguarde enquanto reconectamos você.</div>
            </div>
          ) : gameInProgress ? (
            <div className="rounded-3xl bg-white/10 p-6 text-white backdrop-blur">
              <div className="text-2xl font-semibold">Um jogo já está acontecendo.</div>
              <div className="mt-2 opacity-80">
                Aguarde o jogo atual terminar antes de entrar.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                onClick={enterAsHost}
                disabled={!canBeHost}
                className="rounded-3xl bg-white/10 p-6 text-left text-white backdrop-blur hover:bg-white/15 disabled:opacity-40 transition"
              >
                <div className="flex items-center gap-3">
                  <FiMonitor className="text-2xl" />
                  <div className="text-2xl font-semibold">Entrar como Anfitrião</div>
                </div>
                <div className="mt-2 opacity-80">
                  Visão da TV/notebook: controles, cronômetro, navegação de perguntas e pontos dos jogadores.
                </div>
                {!canBeHost && (
                  <div className="mt-2 text-sm text-rose-200">Já existe um anfitrião.</div>
                )}
              </button>

              {!showPlayerSetup ? (
                <button
                  onClick={openPlayerSetup}
                  className="rounded-3xl bg-white/10 p-6 text-left text-white backdrop-blur hover:bg-white/15 transition"
                >
                  <div className="flex items-center gap-3">
                    <FiUser className="text-2xl" />
                    <div className="text-2xl font-semibold">Entrar como Jogador</div>
                  </div>
                  <div className="mt-2 opacity-80">Visão do celular: toque em A/B/C/D/E para responder.</div>
                </button>
              ) : (
                <div className="rounded-3xl bg-white/10 p-6 text-white backdrop-blur sm:col-span-2">
                  <div className="text-2xl font-semibold">Escolha seu nome e ícone</div>
                  <div className="mt-2 text-sm opacity-80">
                    Isso aparecerá na tela do anfitrião e no placar.
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                    <div>
                      <label className="text-sm opacity-80">Nome</label>
                      <input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                        placeholder="Digite seu nome"
                        maxLength={24}
                      />
                    </div>

                    <div>
                      <div className="text-sm opacity-80">Ícone</div>
                      <div className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-3">
                        <div className="grid max-h-44 grid-cols-6 gap-2 overflow-y-auto pr-1 sm:grid-cols-8">
                          {ICONS.map((icon) => (
                            <button
                              key={icon}
                              type="button"
                              onClick={() => setDraftIcon(icon)}
                              className={[
                                "rounded-xl border p-1 transition",
                                draftIcon === icon
                                  ? "border-emerald-300/70 bg-emerald-500/15"
                                  : "border-white/10 bg-white/5 hover:border-white/20",
                              ].join(" ")}
                            >
                              <img src={icon} alt="" className="h-9 w-9 rounded-lg" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={draftIcon || identity?.icon || ICONS[0]}
                        alt=""
                        className="h-12 w-12 rounded-xl"
                      />
                      <div>
                        <div className="text-sm opacity-70">Prévia</div>
                        <div className="text-lg font-semibold">
                          {draftName.trim() ? capitalizeName(draftName.trim()) : identity?.name}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={confirmPlayerSetup}
                      className="self-center rounded-2xl bg-emerald-500/20 px-4 mt-1 py-2 font-semibold hover:bg-emerald-500/30 transition"
                    >
                      Já editei meu nome e ícone ✅
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

        {role === "host" && (
          <div className="space-y-4">
            {!state.game && (
              <div className="flex justify-center">
                <GamePicker onPick={pickGame} />
              </div>
            )}

            {state.game && (
              <HostView
                state={state}
                canPrev={canPrev}
                canNext={canNext}
                onPrev={prev}
                onNext={next}
                onTogglePause={togglePause}
                onRestart={restart}
                onForceReveal={forceReveal}
                onForceReset={forceReset}
                onStartGame={startGame}
                onKickPlayer={kickPlayer}
                onPickGame={pickGame}
              />
            )}
          </div>
        )}

        {role === "player" && identity && (
          <PlayerView
            state={state}
            myClientId={identity.clientId}
            onAnswer={answer}
            onUnlockAnswer={unlockAnswer}
            onSetReady={setReady}
          />
        )}
      </div>
    </main>
  );
}
