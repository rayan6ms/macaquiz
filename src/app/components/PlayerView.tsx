"use client";

import type { OptionKey, PublicState } from "../lib/types";
import Scoreboard from "./Scoreboard";

const OPTION_STYLES: Record<OptionKey, string> = {
  A: "bg-rose-500/25 border-rose-400/40",
  B: "bg-sky-500/25 border-sky-400/40",
  C: "bg-emerald-500/25 border-emerald-400/40",
  D: "bg-amber-500/25 border-amber-400/40",
  E: "bg-purple-500/25 border-purple-400/40",
};

export default function PlayerView(props: {
  state: PublicState;
  myClientId: string;
  onAnswer: (k: OptionKey) => void;
  onUnlockAnswer: () => void;
  onSetReady: (ready: boolean) => void;
}) {
  const { state, myClientId } = props;
  const q = state.question;

  const me = state.players.find((p) => p.clientId === myClientId);
  const canUnlock =
    Boolean(me?.hasAnswered) &&
    (state.phase === "question" || state.phase === "lockin") &&
    !state.paused;
  const locked =
    (state.phase !== "question" && state.phase !== "lockin") ||
    state.paused;

  const showCorrect = state.phase === "reveal" || state.phase === "scoreboard";
  const isFinalScoreboard = Boolean(
    state.phase === "scoreboard" &&
      state.game &&
      state.currentQuestionIndex >= state.game.questionCount - 1
  );
  const myResult =
    showCorrect && state.correctOption && me?.lastAnswer
      ? me.lastAnswer === state.correctOption
        ? "correct"
        : "wrong"
      : null;

  if (state.game && state.phase === "lobby") {
    const isReady = Boolean(me?.ready);

    return (
      <div className="rounded-3xl bg-white/10 p-6 text-white backdrop-blur">
        <div className="flex items-center gap-3">
          {me && <img src={me.icon} alt="" className="h-12 w-12 rounded-xl" />}
          <div>
            <div className="text-sm opacity-80">Você</div>
            <div className="font-semibold">{me?.name ?? "Jogador"}</div>
          </div>
        </div>

        <div className="mt-5 text-2xl font-semibold">Fique pronto</div>
        <div className="mt-1 opacity-80">
          O anfitrião inicia quando todos estiverem prontos.
        </div>

        <button
          onClick={() => props.onSetReady(!isReady)}
          className={[
            "mt-5 w-full rounded-2xl px-4 py-3 font-semibold transition",
            isReady ? "bg-emerald-500/20 hover:bg-emerald-500/30" : "bg-white/10 hover:bg-white/15",
          ].join(" ")}
        >
          {isReady ? "Pronto ✅ (toque para desmarcar)" : "Estou pronto ✅"}
        </button>

        <div className="mt-4 text-sm opacity-80">
          Prontos: <span className="font-mono">{state.readyCount}</span> /{" "}
          <span className="font-mono">{state.playersCount}</span>
        </div>
      </div>
    );
  }

  if (!state.game || !q) {
    return (
      <div className="rounded-3xl bg-white/10 p-6 text-white backdrop-blur">
        <div className="text-2xl font-semibold">Aguardando o anfitrião…</div>
        <div className="mt-2 opacity-80">Quando o jogo começar, você verá os botões de resposta aqui.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white/10 p-5 text-white backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {me && <img src={me.icon} alt="" className="h-12 w-12 rounded-xl" />}
            <div>
              <div className="text-sm opacity-80">Você</div>
              <div className="font-semibold">{me?.name ?? "Jogador"}</div>
            </div>
          </div>

          <div className="rounded-full bg-black/20 px-3 py-1 text-sm">
            Pergunta {state.currentQuestionIndex + 1} de {state.game.questionCount}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm opacity-80">Pergunta</div>
          <div className="mt-1 max-w-full text-lg font-semibold leading-snug break-words">
            {/* Not a priority on phone: keep it smaller and wrap */}
            {q.title}
          </div>
        </div>
        {q.image && (
          <img
            src={q.image}
            alt=""
            className="mt-4 w-full max-h-64 rounded-2xl border border-white/10 object-cover"
            loading="lazy"
          />
        )}

        {myResult && (
          <div
            className={[
              "mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold",
              myResult === "correct"
                ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100"
                : "border-rose-300/40 bg-rose-500/15 text-rose-100",
            ].join(" ")}
          >
            {myResult === "correct" ? "Você acertou ✅" : "Você errou ❌"}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(Object.keys(q.options) as OptionKey[]).map((k, idx, all) => {
            const correct = state.correctOption === k;
            const myPick = me?.lastAnswer === k;
            const isCenter = all.length === 5 && idx === 2;
            const canSelect = !me?.hasAnswered || (myPick && canUnlock);
            const isDisabled = locked || !canSelect;

            return (
              <button
                key={k}
                disabled={isDisabled}
                onClick={() => {
                  if (me?.hasAnswered) {
                    if (myPick && canUnlock) {
                      props.onUnlockAnswer();
                    }
                    return;
                  }
                  props.onAnswer(k);
                }}
                className={[
                  "w-full rounded-2xl border p-4 text-left transition active:scale-[0.99]",
                  OPTION_STYLES[k],
                  isDisabled ? "opacity-80" : "hover:bg-black/20",
                  showCorrect && correct ? "ring-2 ring-emerald-300" : "",
                  showCorrect && myPick && !correct ? "ring-2 ring-rose-300" : "",
                  isCenter ? "sm:col-span-2 sm:justify-self-center sm:w-[70%]" : "",
                ].join(" ")}
              >
                <div className="mb-1 text-sm font-semibold opacity-80">Opção {k}</div>
                <div className="text-lg leading-snug break-words">{q.options[k]}</div>
                {me?.hasAnswered && myPick && (state.phase === "question" || state.phase === "lockin") && (
                  <div className="mt-2 text-sm font-semibold opacity-80">
                    {canUnlock ? "Confirmado (toque para alterar)" : "Confirmado"}
                  </div>
                )}
                {showCorrect && correct && (
                  <div className="mt-2 text-sm font-semibold text-emerald-200">Correta ✅</div>
                )}
                {showCorrect && myPick && !correct && (
                  <div className="mt-2 text-sm font-semibold text-rose-200">Errada ❌</div>
                )}
                {showCorrect && myPick && (
                  <div className="mt-1 text-xs font-semibold opacity-90">Você escolheu essa resposta</div>
                )}
              </button>
            );
          })}
        </div>

        {state.paused && <div className="mt-3 text-sm text-yellow-200">Pausado pelo anfitrião</div>}
        {state.phase === "lockin" && (
          <div className="mt-3 text-sm opacity-90">Confirmando respostas…</div>
        )}
        {state.phase === "reveal" && <div className="mt-3 text-sm opacity-90">Mostrando resposta correta…</div>}
      </div>

      {(state.phase === "reveal" || state.phase === "scoreboard") && (
        <Scoreboard
          players={state.players}
          showAnswerStats={false}
          totalQuestions={state.game?.questionCount}
        />
      )}
    </div>
  );
}
