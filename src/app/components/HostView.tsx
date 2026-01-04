"use client";

import { useEffect, useRef, useState } from "react";
import type { OptionKey, PublicState } from "../lib/types";
import TimerPill from "./TimerPill";
import Scoreboard from "./Scoreboard";
import GamePicker from "./GamePicker";
import ConfettiRain from "./ConfettiRain";
import {
  FiChevronLeft,
  FiChevronRight,
  FiMaximize,
  FiPause,
  FiPlay,
  FiRefreshCcw,
  FiEye,
  FiPower,
} from "react-icons/fi";

const YT_VIDEO_ID = "yA41iunMG6A";
const MUSIC_SRC = `https://www.youtube.com/embed/${YT_VIDEO_ID}?autoplay=1&loop=1&playlist=${YT_VIDEO_ID}&controls=0&modestbranding=1&rel=0&enablejsapi=1`;
const MUSIC_VOLUME_MIN = 0;
const MUSIC_VOLUME_MAX = 100;
const MUSIC_VOLUME_STEP = 10;

const OPTION_COLORS: Record<OptionKey, string> = {
  A: "bg-rose-500/25 border-rose-400/40",
  B: "bg-sky-500/25 border-sky-400/40",
  C: "bg-emerald-500/25 border-emerald-400/40",
  D: "bg-amber-500/25 border-amber-400/40",
  E: "bg-purple-500/25 border-purple-400/40",
};

const SFX = {
  clockTicking: "/sfx/clock-ticking.mp3",
  everyoneWrong: "/sfx/everyone-wrong.mp3",
  everyoneRight: "/sfx/everyone-right.mp3",
  everyoneAnswered: "/sfx/everyone-answered.mp3",
  nextQuestion: "/sfx/next-question.mp3",
  finalScoreboard: "/sfx/final-scoreboard.mp3",
  lockIn: "/sfx/lock-in.mp3",
};
const NEXT_QUESTION_SFX_LEAD_MS = 500;

function toggleFullscreen() {
  const doc = document;
  const el = doc.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const exit = doc.exitFullscreen || (doc as Document & { webkitExitFullscreen?: () => Promise<void> | void }).webkitExitFullscreen;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;

  if (!doc.fullscreenElement && request) {
    request.call(el);
  } else if (exit) {
    exit.call(doc);
  }
}

export default function HostView(props: {
  state: PublicState;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePause: () => void;
  onRestart: () => void;
  onForceReveal: () => void;
  onForceReset: () => void;
  onStartGame: () => void;
  onKickPlayer: (clientId: string) => void;
  onPickGame: (gameId: string) => void;
}) {
  const { state } = props;

  const q = state.question;
  const showCorrect = state.phase === "reveal" || state.phase === "scoreboard";
  const allAnswered = state.playersCount > 0 && state.answersCount >= state.playersCount;
  const shouldPlayMusic =
    state.phase === "question" || state.phase === "lockin" || state.phase === "reveal";
  const timerLabel =
    state.phase === "question"
      ? "Aguardando respostas"
      : state.phase === "lockin"
        ? "Revelando em"
        : state.phase === "reveal"
          ? "Próxima pergunta em"
          : state.phase === "scoreboard"
            ? "Fim de jogo"
            : "Tempo";
  const showClock = state.phase === "lockin" || state.phase === "reveal";
  const isFinalScoreboard = Boolean(
    state.phase === "scoreboard" &&
    state.game &&
    state.currentQuestionIndex >= state.game.questionCount - 1
  );
  const finalKey = `${state.game?.id ?? "no-game"}:${state.currentQuestionIndex}`;
  const [finalViewOverride, setFinalViewOverride] = useState<{
    key: string;
    mode: "final" | "question";
  } | null>(null);
  const [showLobbyPicker, setShowLobbyPicker] = useState(false);
  const [gamePickerState, setGamePickerState] = useState<{
    key: string;
    open: boolean;
  } | null>(null);
  const [musicVolume, setMusicVolume] = useState(60);
  const audioRef = useRef<Record<string, HTMLAudioElement> | null>(null);
  const musicIframeRef = useRef<HTMLIFrameElement | null>(null);
  const prevStateRef = useRef<PublicState | null>(null);
  const nextQuestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextQuestionSfxKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const audios: Record<string, HTMLAudioElement> = {
      clockTicking: new Audio(SFX.clockTicking),
      everyoneWrong: new Audio(SFX.everyoneWrong),
      everyoneRight: new Audio(SFX.everyoneRight),
      everyoneAnswered: new Audio(SFX.everyoneAnswered),
      nextQuestion: new Audio(SFX.nextQuestion),
      finalScoreboard: new Audio(SFX.finalScoreboard),
      lockIn: new Audio(SFX.lockIn),
    };

    audios.clockTicking.loop = true;
    audioRef.current = audios;

    return () => {
      Object.values(audios).forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    };
  }, []);

  useEffect(() => {
    const audios = audioRef.current;
    if (!audios) return;

    const play = (key: keyof typeof SFX) => {
      const audio = audios[key];
      if (!audio) return;
      audio.currentTime = 0;
      void audio.play().catch(() => { });
    };

    const stopAll = () => {
      Object.values(audios).forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    };

    if (state.paused || state.phase === "lobby") {
      stopAll();
    }

    if (state.phase === "lockin" && !state.paused) {
      const clock = audios.clockTicking;
      if (clock.paused) {
        clock.currentTime = 0;
        void clock.play().catch(() => { });
      }
    } else {
      audios.clockTicking.pause();
      audios.clockTicking.currentTime = 0;
    }

    const prev = prevStateRef.current;
    if (!prev) {
      prevStateRef.current = state;
      return;
    }

    if (!prev.paused && state.paused) {
      stopAll();
    }

    if (state.answersCount > prev.answersCount && !state.paused) {
      play("lockIn");
    }

    if (prev.phase !== "reveal" && state.phase === "reveal" && !state.paused) {
      if (nextQuestionTimeoutRef.current) {
        clearTimeout(nextQuestionTimeoutRef.current);
      }
      const hasNext = Boolean(
        state.game &&
        state.currentQuestionIndex < state.game.questionCount - 1
      );
      if (hasNext) {
        const nextKey = `${state.game?.id ?? "no-game"}:${state.currentQuestionIndex + 1}`;
        const delayMs = Math.max(0, state.remainingMs - NEXT_QUESTION_SFX_LEAD_MS);
        nextQuestionSfxKeyRef.current = nextKey;
        nextQuestionTimeoutRef.current = setTimeout(() => {
          nextQuestionTimeoutRef.current = null;
          play("nextQuestion");
        }, delayMs);
      }

      const allAnsweredNow =
        state.playersCount > 0 && state.answersCount >= state.playersCount;
      if (allAnsweredNow && state.correctOption) {
        const allCorrect = state.players.every(
          (p) => p.hasAnswered && p.lastAnswer === state.correctOption
        );
        const allWrong = state.players.every(
          (p) => p.hasAnswered && p.lastAnswer && p.lastAnswer !== state.correctOption
        );

        if (allCorrect) {
          play("everyoneRight");
        } else if (allWrong) {
          play("everyoneWrong");
        } else {
          play("everyoneAnswered");
        }
      }
    }

    if (prev.phase === "reveal" && state.phase !== "reveal") {
      if (nextQuestionTimeoutRef.current) {
        clearTimeout(nextQuestionTimeoutRef.current);
        nextQuestionTimeoutRef.current = null;
      }
    }

    if (
      prev.phase === "reveal" &&
      state.phase === "question" &&
      state.currentQuestionIndex !== prev.currentQuestionIndex &&
      !state.paused
    ) {
      const currentKey = `${state.game?.id ?? "no-game"}:${state.currentQuestionIndex}`;
      if (nextQuestionSfxKeyRef.current !== currentKey) {
        play("nextQuestion");
        nextQuestionSfxKeyRef.current = currentKey;
      }
    }

    if (prev.phase !== "scoreboard" && state.phase === "scoreboard" && !state.paused) {
      play("finalScoreboard");
    }

    prevStateRef.current = state;
  }, [state]);

  useEffect(() => {
    return () => {
      if (nextQuestionTimeoutRef.current) {
        clearTimeout(nextQuestionTimeoutRef.current);
        nextQuestionTimeoutRef.current = null;
      }
    };
  }, []);

  const sendMusicCommand = (command: string, args: (number | string)[] = []) => {
    const iframe = musicIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: command, args }),
      "*"
    );
  };

  useEffect(() => {
    if (!shouldPlayMusic) return;
    sendMusicCommand("setVolume", [musicVolume]);
  }, [musicVolume, shouldPlayMusic]);

  useEffect(() => {
    if (!shouldPlayMusic) return;
    if (state.paused) {
      sendMusicCommand("pauseVideo");
    } else {
      sendMusicCommand("playVideo");
    }
  }, [state.paused, shouldPlayMusic]);

  const handleMusicVolume = (delta: number) => {
    setMusicVolume((prev) => {
      const next = Math.min(MUSIC_VOLUME_MAX, Math.max(MUSIC_VOLUME_MIN, prev + delta));
      return next;
    });
  };

  const handleMusicIframeLoad = () => {
    sendMusicCommand("setVolume", [musicVolume]);
    if (state.paused) {
      sendMusicCommand("pauseVideo");
    }
  };

  const showFinalOnly = isFinalScoreboard
    ? finalViewOverride?.key === finalKey
      ? finalViewOverride.mode === "final"
      : true
    : false;
  const showGamePicker =
    isFinalScoreboard && gamePickerState?.key === finalKey && gamePickerState.open;

  if (state.phase === "lobby") {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl bg-white/10 p-5 text-white backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm opacity-80">{state.game?.title ?? "Nenhum jogo selecionado"}</div>
              <div className="text-2xl font-semibold">Sala de espera</div>
              <div className="mt-1 text-sm opacity-80">
                Prontos: <span className="font-mono">{state.readyCount}</span> /{" "}
                <span className="font-mono">{state.playersCount}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowLobbyPicker((prev) => !prev)}
                className="rounded-2xl bg-black/25 px-4 py-2 font-semibold hover:bg-black/35 transition"
              >
                Voltar para temas
              </button>
              <button
                onClick={props.onForceReset}
                className="rounded-2xl border border-rose-300/40 bg-rose-500/15 px-4 py-2 font-semibold text-rose-100 hover:bg-rose-500/25 transition"
                title="Reiniciar sala para todos"
              >
                Forçar reset
              </button>
              <button
                onClick={props.onStartGame}
                disabled={!state.allPlayersReady}
                className="rounded-2xl bg-emerald-500/20 px-4 py-2 font-semibold hover:bg-emerald-500/30 disabled:opacity-40 disabled:hover:bg-emerald-500/20 transition"
              >
                Iniciar jogo
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-black/20 p-4">
            <div className="text-lg font-semibold">Aguardando confirmação dos jogadores</div>
            <div className="mt-1 text-sm opacity-80">
              Os jogadores precisam tocar em Pronto no celular antes de você iniciar.
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {state.players.map((p) => (
                <div
                  key={p.clientId}
                  className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 border border-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={p.icon} alt="" className="h-10 w-10 rounded-lg" />
                    <div className="truncate font-medium">{p.name}</div>
                    {!p.connected ? <span className="text-xs opacity-60">(desconectado)</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {!p.connected ? (
                      <button
                        type="button"
                        onClick={() => props.onKickPlayer(p.clientId)}
                        className="rounded-full border border-rose-300/40 bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/25 transition"
                        title="Remover jogador desconectado"
                      >
                        Remover
                      </button>
                    ) : null}
                    <div
                      className={[
                        "text-xs rounded-full px-2 py-1 border",
                        p.ready
                          ? "bg-emerald-500/15 border-emerald-300/30 text-emerald-200"
                          : "bg-white/5 border-white/10 text-white/70",
                      ].join(" ")}
                    >
                      {p.ready ? "Pronto" : "Não pronto"}
                    </div>
                  </div>
                </div>
              ))}

              {state.players.length === 0 ? (
                <div className="text-sm opacity-80">
                  Ainda não há jogadores. Peça para entrarem como Jogador.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {showLobbyPicker && (
          <div className="flex justify-center">
            <GamePicker
              onPick={(gameId) => {
                setShowLobbyPicker(false);
                props.onPickGame(gameId);
              }}
            />
          </div>
        )}

        <div className="rounded-2xl bg-white/10 p-4 text-white/80 backdrop-blur">
          <div className="text-sm">
            Dica: celulares podem entrar como Jogador; quando todos estiverem Prontos, Iniciar jogo é liberado.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {shouldPlayMusic && (
        <div className="fixed left-0 top-0 h-0 w-0 overflow-hidden opacity-0 pointer-events-none" aria-hidden>
          <iframe
            key={YT_VIDEO_ID}
            src={MUSIC_SRC}
            title="Background music"
            ref={musicIframeRef}
            onLoad={handleMusicIframeLoad}
            allow="autoplay; encrypted-media"
          />
        </div>
      )}
      {isFinalScoreboard && showFinalOnly ? (
        <div className="relative overflow-hidden rounded-3xl bg-white/10 p-6 text-white backdrop-blur">
          <ConfettiRain
            active={isFinalScoreboard && showFinalOnly}
            triggerKey={finalKey}
            intensity={6}
            durationMs={4500}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm opacity-80">{state.game?.title ?? "Fim de jogo"}</div>
              <div className="text-2xl font-semibold">Placar final</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFinalViewOverride({ key: finalKey, mode: "question" })}
                className="rounded-2xl bg-black/25 px-4 py-2 font-semibold hover:bg-black/35 transition"
              >
                Voltar para última pergunta
              </button>
              <button
                onClick={() =>
                  setGamePickerState((prev) => ({
                    key: finalKey,
                    open: prev?.key === finalKey ? !prev.open : true,
                  }))
                }
                className="rounded-2xl bg-emerald-500/20 px-4 py-2 font-semibold hover:bg-emerald-500/30 transition"
              >
                Novo jogo
              </button>
            </div>
          </div>

          <div className="mt-4">
            <Scoreboard
              players={state.players}
              phase={state.phase}
              correctOption={state.correctOption}
              showAnswerStats={isFinalScoreboard}
              showMedals
              totalQuestions={state.game?.questionCount}
              showKick
              onKick={props.onKickPlayer}
            />
          </div>

          {showGamePicker && (
            <div className="mt-4">
              <GamePicker
                onPick={(gameId) => {
                  setGamePickerState({ key: finalKey, open: false });
                  props.onPickGame(gameId);
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-3xl bg-white/10 p-5 text-white backdrop-blur">
            <div className="rounded-2xl bg-black/20 p-4">
              <div className="text-lg font-semibold">Pergunta atual</div>
              <div className="mt-2 text-2xl font-semibold leading-tight break-words">
                {q ? q.title : "Aguardando um jogo..."}
              </div>
              {q?.image && (
                <img
                  src={q.image}
                  alt=""
                  className="mt-4 w-full max-h-72 rounded-2xl border border-white/10 bg-black/20 object-contain"
                  loading="lazy"
                />
              )}

              {q && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(Object.keys(q.options) as OptionKey[]).map((k, idx, all) => {
                    const correct = state.correctOption === k;
                    const isCenter = all.length === 5 && idx === 2;
                    return (
                      <div
                        key={k}
                        className={[
                          "rounded-2xl border p-4",
                          OPTION_COLORS[k],
                          showCorrect && correct ? "ring-2 ring-emerald-300" : "",
                          showCorrect && !correct ? "opacity-70" : "",
                          isCenter ? "sm:col-span-2 sm:justify-self-center sm:w-[70%]" : "",
                        ].join(" ")}
                      >
                        <div className="mb-1 text-sm font-semibold opacity-80">Opção {k}</div>
                        <div className="text-lg leading-snug break-words">{q.options[k]}</div>
                        {showCorrect && correct && (
                          <div className="mt-2 text-sm font-semibold text-emerald-200">Correta</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="lg:self-start">
            <div className="lg:sticky lg:top-4">
              <div className="space-y-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
                <Scoreboard
                  players={state.players}
                  phase={state.phase}
                  correctOption={state.correctOption}
                  showLocks
                  showKick
                  onKick={props.onKickPlayer}
                />

                <div className="rounded-2xl bg-white/10 p-4 text-white backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm opacity-80">{state.game?.title ?? "Nenhum jogo selecionado"}</div>
                      <div className="text-xl font-semibold">
                        Pergunta {state.currentQuestionIndex + 1} de {state.game?.questionCount ?? 0}
                      </div>
                    </div>

                    <TimerPill
                      remainingMs={state.remainingMs}
                      paused={state.paused}
                      label={timerLabel}
                      showClock={showClock}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={props.onPrev}
                      disabled={!props.canPrev}
                      className="inline-flex items-center gap-2 rounded-xl bg-black/25 px-4 py-2 hover:bg-black/35 disabled:opacity-40 disabled:hover:bg-black/25 transition"
                    >
                      <FiChevronLeft /> Anterior
                    </button>

                    <div className="text-sm opacity-80">
                      Respostas{" "}
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">
                        <span className="font-bold">{state.answersCount}</span> /{" "}
                        <span className="font-bold">{state.playersCount}</span>
                      </span>
                    </div>

                    <button
                      onClick={props.onNext}
                      disabled={!props.canNext}
                      className="inline-flex items-center gap-2 rounded-xl bg-black/25 px-4 py-2 hover:bg-black/35 disabled:opacity-40 disabled:hover:bg-black/25 transition"
                    >
                      Próxima <FiChevronRight />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={props.onTogglePause}
                      className="rounded-xl bg-black/25 px-3 py-2 hover:bg-black/35 transition"
                      title="Pausar / Retomar"
                      disabled={state.phase !== "question"}
                    >
                      {state.paused ? <FiPlay /> : <FiPause />}
                    </button>

                    <button
                      onClick={props.onForceReveal}
                      className="rounded-xl bg-black/25 px-3 py-2 hover:bg-black/35 transition"
                      title="Revelar agora"
                      disabled={state.phase !== "question" || !allAnswered}
                    >
                      <FiEye />
                    </button>

                    <button
                      onClick={props.onRestart}
                      className="rounded-xl bg-black/25 px-3 py-2 hover:bg-black/35 transition"
                      title="Reiniciar"
                    >
                      <FiRefreshCcw />
                    </button>

                    <button
                      onClick={props.onForceReset}
                      className="rounded-xl bg-black/25 px-3 py-2 hover:bg-black/35 transition text-rose-200"
                      title="Forçar reset da sala"
                    >
                      <FiPower />
                    </button>

                    <button
                      onClick={toggleFullscreen}
                      className="rounded-xl bg-black/25 px-3 py-2 hover:bg-black/35 transition"
                      title="Tela cheia"
                    >
                      <FiMaximize />
                    </button>

                    <div className="inline-flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm">
                      <span className="text-white/70">Música</span>
                      <button
                        type="button"
                        onClick={() => handleMusicVolume(-MUSIC_VOLUME_STEP)}
                        disabled={musicVolume <= MUSIC_VOLUME_MIN}
                        className="rounded-md px-1.5 py-1 hover:bg-black/30 disabled:opacity-40 disabled:hover:bg-transparent transition"
                        title="Diminuir volume da música"
                      >
                        <FiChevronLeft />
                      </button>
                      <span className="w-10 text-center font-mono tabular-nums">{musicVolume}</span>
                      <button
                        type="button"
                        onClick={() => handleMusicVolume(MUSIC_VOLUME_STEP)}
                        disabled={musicVolume >= MUSIC_VOLUME_MAX}
                        className="rounded-md px-1.5 py-1 hover:bg-black/30 disabled:opacity-40 disabled:hover:bg-transparent transition"
                        title="Aumentar volume da música"
                      >
                        <FiChevronRight />
                      </button>
                    </div>

                    {isFinalScoreboard && !showFinalOnly ? (
                      <button
                        onClick={() => setFinalViewOverride({ key: finalKey, mode: "final" })}
                        className="rounded-xl bg-emerald-500/20 px-3 py-2 font-semibold hover:bg-emerald-500/30 transition"
                      >
                        Ver placar final
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-2xl bg-black/20 p-3 text-sm opacity-80">
                    Dica: abra na TV e nos celulares na mesma rede. O anfitrião controla a navegação e a pausa.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
