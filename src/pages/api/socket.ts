import type { NextApiRequest, NextApiResponse } from "next";
import { Server as IOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import { GAMES } from "../../app/lib/games";
import { computeAwardForCorrect, nextStreakAfterAnswer } from "../../app/lib/scoring";
import type { OptionKey, Phase, PublicState, ServerPlayer } from "../../app/lib/types";
import type { ClientToServerEvents, ServerToClientEvents } from "../../app/lib/events";
import type { Socket } from "socket.io";

export const config = {
  api: { bodyParser: false },
};

type NextApiResponseWithSocket = NextApiResponse & {
  socket: NextApiResponse["socket"] & {
    server: HTTPServer & {
      io?: IOServer;
    };
  };
};

type AnswerRecord = {
  option: OptionKey;
  answeredAt: number; // epoch ms
  elapsedMs: number; // ✅ ms since question start, excluding paused time
};

type ServerState = {
  hostClientId?: string;
  hostConnected: boolean;
  gameId?: string;
  phase: Phase;
  currentQuestionIndex: number;

  // timing
  questionDurationMs: number;
  questionStartedAt?: number; // epoch ms
  questionEndsAt?: number; // epoch ms
  remainingMs: number;
  paused: boolean;

  // pause accounting (so answers aren’t penalized by pause duration)
  pauseAccumMs: number; // ✅ total paused ms so far in this question
  pausedAt?: number;

  // reveal
  correctOption?: OptionKey;

  players: Record<string, ServerPlayer>;
  answers: Record<string, AnswerRecord>;
};

const STATE: ServerState = {
  phase: "lobby",
  currentQuestionIndex: 0,
  questionDurationMs: 20000,
  remainingMs: 0,
  paused: false,
  pauseAccumMs: 0, // ✅
  hostConnected: false,
  players: {},
  answers: {},
};

let TICKER: NodeJS.Timeout | null = null;
let NEXT_QUESTION_TIMEOUT: NodeJS.Timeout | null = null;
let IDLE_TIMEOUT: NodeJS.Timeout | null = null;

const IDLE_TIMEOUT_MS = 10000;
const NEXT_QUESTION_DELAY_MS = 14000;
const LOCKIN_DELAY_MS = 4000;

function getGame() {
  return GAMES.find((g) => g.id === STATE.gameId);
}

function connectedPlayers() {
  return Object.values(STATE.players).filter((p) => p.connected);
}

function readyPlayersCount() {
  return connectedPlayers().filter((p) => p.ready).length;
}

function allConnectedPlayersReady() {
  const needed = connectedPlayers().length;
  return needed > 0 && readyPlayersCount() === needed;
}

function playersWhoMustAnswerCount() {
  if (STATE.phase === "question" || STATE.phase === "lockin") {
    return Object.keys(STATE.players).length;
  }
  return connectedPlayers().length;
}

function connectedPlayerIds() {
  return Object.values(STATE.players)
    .filter((p) => p.connected)
    .map((p) => p.clientId);
}

function answersCount() {
  return Object.keys(STATE.answers).length;
}

function clampIndex(idx: number, len: number) {
  return Math.max(0, Math.min(len - 1, idx));
}

function clearTimers() {
  if (NEXT_QUESTION_TIMEOUT) {
    clearTimeout(NEXT_QUESTION_TIMEOUT);
    NEXT_QUESTION_TIMEOUT = null;
  }
}

function resetRoundData() {
  STATE.answers = {};
  STATE.correctOption = undefined;
}

function clearIdleTermination() {
  if (IDLE_TIMEOUT) {
    clearTimeout(IDLE_TIMEOUT);
    IDLE_TIMEOUT = null;
  }
}

function terminateMatch(io: IOServer) {
  clearTimers();
  clearIdleTermination();
  STATE.phase = "lobby";
  STATE.currentQuestionIndex = 0;
  STATE.gameId = undefined;
  STATE.remainingMs = 0;
  STATE.paused = false;
  STATE.pauseAccumMs = 0;
  STATE.pausedAt = undefined;
  STATE.questionStartedAt = undefined;
  STATE.questionEndsAt = undefined;
  STATE.hostClientId = undefined;
  STATE.hostConnected = false;
  STATE.players = {};
  resetRoundData();
  broadcast(io);
}

function scheduleIdleTermination(io: IOServer) {
  if (IDLE_TIMEOUT) return;
  IDLE_TIMEOUT = setTimeout(() => {
    terminateMatch(io);
  }, IDLE_TIMEOUT_MS);
}

function buildPublicState(): PublicState {
  const game = getGame();
  const question = game?.questions[STATE.currentQuestionIndex];

  const playersSorted = Object.values(STATE.players)
    .slice()
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const readyCount = readyPlayersCount();
  const allReady = allConnectedPlayersReady();

  return {
    hostClientId: STATE.hostClientId,
    hasHost: Boolean(STATE.hostClientId),
    hostConnected: STATE.hostConnected,
    game: game
      ? { id: game.id, title: game.title, questionCount: game.questions.length }
      : undefined,
    phase: STATE.phase,
    currentQuestionIndex: STATE.currentQuestionIndex,
    questionDurationMs: STATE.questionDurationMs,
    remainingMs: STATE.remainingMs,
    paused: STATE.paused,

    // ✅ lobby fields
    readyCount,
    allPlayersReady: allReady,

    // ✅ don’t reveal question until game starts
    question:
      STATE.phase === "lobby" || !question
        ? undefined
        : {
          id: question.id,
          title: question.title,
          options: question.options,
          image: question.image,
        },

    correctOption:
      STATE.phase === "reveal" || STATE.phase === "scoreboard"
        ? STATE.correctOption
        : undefined,

    players: playersSorted.map((p) => ({
      clientId: p.clientId,
      name: p.name,
      icon: p.icon,
      points: p.points,
      streak: p.streak,
      correctCount: p.correctCount,
      wrongCount: p.wrongCount,
      ready: p.ready, // ✅
      lastAnswer: STATE.answers[p.clientId]?.option,
      hasAnswered: Boolean(STATE.answers[p.clientId]),
      connected: p.connected,
    })),

    answersCount: answersCount(),
    playersCount: playersWhoMustAnswerCount(),
  };
}

function broadcast(io: IOServer) {
  io.emit("state", buildPublicState());
}

function disconnectClient(io: IOServer, clientId: string) {
  for (const s of io.sockets.sockets.values()) {
    if (s.data.clientId === clientId) {
      s.disconnect(true);
    }
  }
}

function startQuestion(io: IOServer) {
  clearTimers();
  resetRoundData();

  const game = getGame();
  if (!game) return;

  const idx = clampIndex(STATE.currentQuestionIndex, game.questions.length);
  STATE.currentQuestionIndex = idx;

  STATE.phase = "question";
  STATE.paused = false;
  STATE.pauseAccumMs = 0;
  STATE.pausedAt = undefined;

  const now = Date.now();
  STATE.questionStartedAt = now;
  STATE.questionEndsAt = undefined;
  STATE.remainingMs = 0;

  broadcast(io);
}

function startLockinCountdown(io: IOServer) {
  if (STATE.phase !== "question") return;

  const now = Date.now();
  STATE.phase = "lockin";
  STATE.paused = false;
  STATE.questionEndsAt = now + LOCKIN_DELAY_MS;
  STATE.remainingMs = LOCKIN_DELAY_MS;

  broadcast(io);
}

function advanceToNextQuestion(io: IOServer) {
  clearTimers();
  const game = getGame();
  if (!game) return;

  const next = STATE.currentQuestionIndex + 1;
  if (next >= game.questions.length) {
    STATE.phase = "scoreboard";
    STATE.questionEndsAt = undefined;
    STATE.remainingMs = 0;
    broadcast(io);
    return;
  }

  STATE.currentQuestionIndex = next;
  startQuestion(io);
}

function scheduleNextQuestion(io: IOServer) {
  clearTimers();
  const now = Date.now();
  STATE.questionEndsAt = now + NEXT_QUESTION_DELAY_MS;
  STATE.remainingMs = NEXT_QUESTION_DELAY_MS;
  NEXT_QUESTION_TIMEOUT = setTimeout(() => {
    NEXT_QUESTION_TIMEOUT = null;
    advanceToNextQuestion(io);
  }, NEXT_QUESTION_DELAY_MS);
}


function reveal(io: IOServer) {
  const game = getGame();
  if (!game) return;

  const q = game.questions[STATE.currentQuestionIndex];
  if (!q) return;

  STATE.phase = "reveal";
  STATE.correctOption = q.correct;
  STATE.paused = false;

  // award points
  const start = STATE.questionStartedAt ?? Date.now();
  const duration = STATE.questionDurationMs;

  for (const pid of Object.keys(STATE.players)) {
    const p = STATE.players[pid];
    const ans = STATE.answers[pid];

    const wasCorrect = Boolean(ans && ans.option === q.correct);
    const answerMs = ans ? Math.max(0, ans.elapsedMs) : duration;

    const nextStreak = nextStreakAfterAnswer(p.streak, wasCorrect);

    if (wasCorrect) {
      // comeback bonus based on previous negative streak magnitude
      const prevNeg = p.streak < 0 ? Math.abs(p.streak) : 0;
      const award = computeAwardForCorrect({
        answerMs,
        durationMs: duration,
        nextPositiveStreak: nextStreak > 0 ? nextStreak : 1,
        previousNegativeStreak: prevNeg,
      });
      p.points += award;
      p.correctCount += 1;
    } else {
      p.wrongCount += 1;
    }

    p.streak = nextStreak;
  }

  const hasNext = STATE.currentQuestionIndex < game.questions.length - 1;
  if (hasNext) {
    scheduleNextQuestion(io);
  } else {
    STATE.phase = "scoreboard";
    STATE.questionEndsAt = undefined;
    STATE.remainingMs = 0;
    clearTimers();
  }

  broadcast(io);
}

function maybeAutoReveal(io: IOServer) {
  if (STATE.phase !== "question") return;
  if (STATE.paused) return;

  // all connected players answered
  const needed = playersWhoMustAnswerCount();
  if (needed > 0 && answersCount() >= needed) {
    startLockinCountdown(io);
  }
}

function tick(io: IOServer) {
  if (STATE.phase !== "reveal" && STATE.phase !== "lockin") return;

  const now = Date.now();
  const ends = STATE.questionEndsAt ?? now;
  const remaining = Math.max(0, ends - now);
  STATE.remainingMs = remaining;

  // broadcast at low frequency for smooth-ish timer without spamming
  // (still fine for 5 clients)
  broadcast(io);

  if (remaining <= 0) {
    if (STATE.phase === "lockin") {
      reveal(io);
      return;
    }
    advanceToNextQuestion(io);
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (!res.socket.server.io) {
    const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(res.socket.server, {
      path: "/api/socket",
      addTrailingSlash: false,
    });
    res.socket.server.io = io;

    io.on(
      "connection",
      (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
        socket.on("request_state", () => {
          socket.emit("state", buildPublicState());
        });

        socket.on("set_role", (payload) => {
          const { role, clientId, name, icon } = payload;
          if (!clientId) return;

          socket.data.clientId = clientId;
          clearIdleTermination();

          if (role === "host") {
            const canClaimHost =
              !STATE.hostClientId ||
              STATE.hostClientId === clientId ||
              (STATE.phase === "lobby" && !STATE.hostConnected);

            if (canClaimHost) {
              STATE.hostClientId = clientId;
              STATE.hostConnected = true;
            } else {
              socket.emit("toast", { type: "error", message: "Já existe um anfitrião." });
            }
          }

          if (role === "player") {
            const existing = STATE.players[clientId];
            const safeName = name?.trim() ? name.trim() : "Jogador";
            const safeIcon = icon?.trim() ? icon.trim() : "/icons/icon-1.svg";

            STATE.players[clientId] = {
              clientId,
              name: existing?.name ?? safeName,
              icon: existing?.icon ?? safeIcon,
              points: existing?.points ?? 0,
              streak: existing?.streak ?? 0,
              correctCount: existing?.correctCount ?? 0,
              wrongCount: existing?.wrongCount ?? 0,
              connected: true,
              ready: existing?.ready ?? false,
            };
          }

          broadcast(io);
        });

        socket.on("choose_game", (payload) => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId || clientId !== STATE.hostClientId) return;

          const { gameId } = payload;
          const found = GAMES.find((g) => g.id === gameId);
          if (!found) return;

          clearTimers();
          STATE.gameId = found.id;
          STATE.phase = "lobby";
          STATE.currentQuestionIndex = 0;
          STATE.remainingMs = 0;
          STATE.paused = false;
          STATE.questionEndsAt = undefined;
          resetRoundData();

          for (const p of Object.values(STATE.players)) {
            p.points = 0;
            p.streak = 0;
            p.correctCount = 0;
            p.wrongCount = 0;
          }

          for (const p of Object.values(STATE.players)) {
            p.points = 0;
            p.streak = 0;
            p.ready = false;
            p.correctCount = 0;
            p.wrongCount = 0;
          }

          broadcast(io);
        });

        socket.on("answer", (payload) => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId) return;
          if (STATE.phase !== "question") return;
          if (STATE.paused) return;

          const p = STATE.players[clientId];
          if (!p || !p.connected) return;

          const { option } = payload;

          if (STATE.answers[clientId]) return;

          const now = Date.now();
          const start = STATE.questionStartedAt ?? now;
          const elapsedMs = Math.max(0, now - start - STATE.pauseAccumMs);

          STATE.answers[clientId] = {
            option,
            answeredAt: now,
            elapsedMs,
          };

          broadcast(io);
          maybeAutoReveal(io);
        });

        socket.on("unlock_answer", () => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId) return;
          if (STATE.phase !== "question" && STATE.phase !== "lockin") return;
          if (STATE.paused) return;

          if (!STATE.answers[clientId]) return;

          delete STATE.answers[clientId];

          if (STATE.phase === "lockin") {
            STATE.phase = "question";
            STATE.questionEndsAt = undefined;
            STATE.remainingMs = 0;
          }
          broadcast(io);
        });

        socket.on("navigate", (payload) => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId || clientId !== STATE.hostClientId) return;

          const { dir } = payload;
          const game = getGame();
          if (!game) return;

          const next = clampIndex(STATE.currentQuestionIndex + dir, game.questions.length);
          if (next === STATE.currentQuestionIndex) return;

          STATE.currentQuestionIndex = next;
          startQuestion(io);
        });

        socket.on("force_reveal", () => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId || clientId !== STATE.hostClientId) return;
          if (STATE.phase !== "question") return;
          const needed = playersWhoMustAnswerCount();
          if (needed === 0 || answersCount() < needed) return;
          reveal(io);
        });

        socket.on("kick_player", (payload) => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId || clientId !== STATE.hostClientId) return;

          const targetId = payload.clientId;
          const target = STATE.players[targetId];
          if (!target) return;

          disconnectClient(io, targetId);
          delete STATE.players[targetId];
          delete STATE.answers[targetId];

          broadcast(io);
          maybeAutoReveal(io);
        });

        socket.on("disconnect", () => {
          const clientId = socket.data.clientId as string | undefined;
          if (clientId) {
            if (STATE.hostClientId === clientId) {
              STATE.hostConnected = false;
            }
            if (STATE.players[clientId]) {
              STATE.players[clientId].connected = false;
            }
            broadcast(io);
          }

          if (!STATE.hostConnected && connectedPlayers().length === 0) {
            scheduleIdleTermination(io);
          } else {
            clearIdleTermination();
          }
        });

        socket.on("set_ready", (payload) => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId) return;
          const p = STATE.players[clientId];
          if (!p) return;

          p.ready = Boolean(payload.ready);
          broadcast(io);
        });

        socket.on("start_game", () => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId || clientId !== STATE.hostClientId) return;
          if (!STATE.gameId) return;
          if (STATE.phase !== "lobby") return;

          if (!allConnectedPlayersReady()) {
            socket.emit("toast", { type: "info", message: "Aguardando todos os jogadores ficarem prontos." });
            return;
          }

          startQuestion(io);
        });

        socket.on("toggle_pause", () => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId || clientId !== STATE.hostClientId) return;
          if (STATE.phase !== "question") return;

          const now = Date.now();

          if (!STATE.paused) {
            // pause
            STATE.paused = true;
            STATE.pausedAt = now;
            broadcast(io);
            return;
          }

          // resume
          STATE.paused = false;

          if (STATE.pausedAt) {
            STATE.pauseAccumMs += now - STATE.pausedAt;
            STATE.pausedAt = undefined;
          }

          broadcast(io);
        });

        socket.on("restart", () => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId || clientId !== STATE.hostClientId) return;

          clearTimers();
          STATE.phase = "lobby";
          STATE.currentQuestionIndex = 0;
          STATE.remainingMs = 0;
          STATE.paused = false;
          STATE.pauseAccumMs = 0;
          STATE.pausedAt = undefined;
          STATE.questionEndsAt = undefined;
          resetRoundData();

          for (const p of Object.values(STATE.players)) {
            p.points = 0;
            p.streak = 0;
            p.ready = false;
            p.correctCount = 0;
            p.wrongCount = 0;
          }

          broadcast(io);
        });

        socket.on("force_reset", () => {
          const clientId = socket.data.clientId as string | undefined;
          if (!clientId || clientId !== STATE.hostClientId) return;

          terminateMatch(io);
          io.emit("force_reset");
        });

        // send state immediately
        socket.emit("state", buildPublicState());
      });

    // ticker
    if (!TICKER) {
      TICKER = setInterval(() => tick(io), 500);
    }
  }

  res.status(200).json({ ok: true });
}
