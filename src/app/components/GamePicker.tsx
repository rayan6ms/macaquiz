"use client";

import { useMemo, useState } from "react";
import { GAME_TOPICS } from "../lib/games";

export default function GamePicker(props: { onPick: (gameId: string) => void }) {
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const activeTopic = useMemo(
    () => GAME_TOPICS.find((topic) => topic.id === activeTopicId) ?? null,
    [activeTopicId]
  );

  return (
    <div className="w-full max-w-5xl rounded-2xl bg-white/10 p-6 text-white backdrop-blur">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-2xl font-semibold">
          {activeTopic ? "Escolha um jogo" : "Escolha um tema"}
        </div>
        {activeTopic ? (
          <button
            type="button"
            onClick={() => setActiveTopicId(null)}
            className="rounded-xl bg-black/25 px-3 py-1.5 text-sm font-semibold hover:bg-black/35 transition"
          >
            Voltar para temas
          </button>
        ) : null}
      </div>

      {activeTopic ? (
        <>
          <div className="mb-3 text-sm opacity-80">{activeTopic.title}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeTopic.games.map((g) => (
              <button
                key={g.id}
                onClick={() => props.onPick(g.id)}
                className="rounded-xl bg-black/25 p-4 text-left hover:bg-black/35 active:scale-[0.99] transition"
              >
                <div className="text-lg font-semibold">{g.title}</div>
                <div className="mt-1 text-sm opacity-80">{g.questions.length} perguntas</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {GAME_TOPICS.map((topic) => (
            <button
              key={topic.id}
              onClick={() => setActiveTopicId(topic.id)}
              className="rounded-xl bg-black/25 p-4 text-left hover:bg-black/35 active:scale-[0.99] transition"
            >
              <div className="text-lg font-semibold">{topic.title}</div>
              <div className="mt-1 text-sm opacity-80">{topic.games.length} jogos</div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 text-sm opacity-70">
        Dados de exemplo por enquanto — depois trocamos pelos seus conjuntos reais de perguntas.
      </div>
    </div>
  );
}
