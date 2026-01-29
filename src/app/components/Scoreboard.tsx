"use client";

import type { OptionKey, Phase, PublicPlayer } from "../lib/types";
import { FaFire } from "react-icons/fa";
import { FiLock } from "react-icons/fi";

export default function Scoreboard(props: {
  players: PublicPlayer[];
  phase?: Phase;
  correctOption?: OptionKey;
  showLocks?: boolean; // host can enable
  showAnswerStats?: boolean;
  showMedals?: boolean;
  totalQuestions?: number;
  showKick?: boolean;
  onKick?: (clientId: string) => void;
}) {
  const {
    players,
    phase,
    correctOption,
    showLocks,
    showAnswerStats,
    showMedals,
    totalQuestions,
    showKick,
    onKick,
  } = props;

  const showAnsweredLocks = Boolean(showLocks && (phase === "question" || phase === "lockin"));
  const showResults = Boolean(
    (phase === "reveal" || phase === "scoreboard") && correctOption
  );
  const showTotals = Boolean(showAnswerStats && typeof totalQuestions === "number");

  return (
    <div className="w-full rounded-2xl bg-white/10 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3 text-white">
        <div className="text-lg font-semibold">Placar</div>
        {showAnsweredLocks ? (
          <div className="text-xs opacity-80">Cadeados mostram quem já respondeu</div>
        ) : null}
      </div>

      <div className="space-y-2">
        {players.map((p, idx) => {
          const rank = idx + 1;
          const medal =
            showMedals && (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

          const hot = p.streak >= 2;
          const cold = p.streak <= -2;
          const streakAbs = Math.abs(p.streak);

          const answered = p.hasAnswered;
          const hasResult = Boolean(showResults && p.lastAnswer);
          const isCorrect = hasResult && p.lastAnswer === correctOption;
          const canKick = Boolean(showKick && onKick && !p.connected);

          const tone = showResults
            ? hasResult
              ? isCorrect
                ? "bg-emerald-500/15 border-emerald-300/40"
                : "bg-rose-500/15 border-rose-300/40"
              : "bg-black/20 border-white/5"
            : showAnsweredLocks && answered
              ? "bg-emerald-500/10 border-emerald-300/20"
              : "bg-black/20 border-white/5";

          return (
            <div
              key={p.clientId}
              className={[
                "flex items-center justify-between rounded-xl py-2 text-white border transition",
                // tone changes when answered or when results show
                tone,
                !p.connected ? "opacity-70" : "",
                showTotals ? "px-5" : "px-3",
              ].join(" ")}
            >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex items-center opacity-90">
                    <span className={showTotals ? "text-2xl font-bold" : "text-sm font-semibold"}>#{rank}</span>
                  </div>

                  <img
                    src={p.icon}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg"
                  />

                  <div className="min-w-0 truncate font-medium">
                    {p.name}{" "}
                    {!p.connected ? <span className="text-xs opacity-60">(desconectado)</span> : null}
                  </div>
                  {medal ? <span className={showTotals ? "text-2xl" : "text-lg"}>{medal}</span> : null}

                  {showTotals ? (
                    <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm font-semibold opacity-90">
                      {p.correctCount} corretas / {p.wrongCount} erradas de {totalQuestions} questões
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs opacity-90">
                      {showAnsweredLocks ? (
                        <span className="opacity-80">{answered ? "Confirmado" : "Pensando…"}</span>
                      ) : null}

                      {canKick ? (
                        <button
                          type="button"
                          onClick={() => onKick?.(p.clientId)}
                          className="rounded-full border border-rose-300/40 bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/25 transition"
                          title="Remover jogador desconectado"
                        >
                          Remover
                        </button>
                      ) : null}

                      {showAnsweredLocks && answered ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs"
                          title="Este jogador respondeu"
                        >
                          <FiLock />
                          <span className="opacity-90">Travado</span>
                        </span>
                      ) : null}

                      {showResults && hasResult ? (
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2 py-1 text-xs",
                            isCorrect ? "bg-emerald-500/20 text-emerald-100" : "bg-rose-500/20 text-rose-100",
                          ].join(" ")}
                        >
                          {isCorrect ? "Correta" : "Errada"}
                        </span>
                      ) : null}

                      {(hot || cold) && (
                        <span className="inline-flex items-center gap-1">
                          <FaFire
                            className={[
                              "text-lg",
                              cold ? "text-sky-300" : "text-orange-300",
                            ].join(" ")}
                          />
                          <span className="text-xs opacity-80">x{streakAbs}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center font-semibold shrink-0">
                <span className="font-mono">{p.points} pontos</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
