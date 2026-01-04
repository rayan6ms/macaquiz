import type { Game } from "./types";

type WebpackRequire = {
  context: (
    directory: string,
    useSubdirectories: boolean,
    regExp: RegExp
  ) => {
    keys: () => string[];
    <T>(id: string): T;
  };
};

declare const require: WebpackRequire;

export type GameTopic = {
  id: string;
  title: string;
  games: Game[];
};

const gamesContext = require.context("./data/games", true, /\.json$/);

const gamesWithTopic = gamesContext.keys().map((key) => {
  const normalizedKey = key.replace(/^\.\//, "");
  const [topicIdRaw] = normalizedKey.split("/");
  const topicId = topicIdRaw || "geral";
  const baseGame = gamesContext<Game>(key);
  return {
    topicId,
    game: {
      ...baseGame,
      id: `${topicId}/${baseGame.id}`,
    },
  };
});

const formatTopicTitle = (id: string) =>
  id
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const topicMap = new Map<string, Game[]>();

for (const entry of gamesWithTopic) {
  const games = topicMap.get(entry.topicId) ?? [];
  games.push(entry.game);
  topicMap.set(entry.topicId, games);
}

export const GAME_TOPICS: GameTopic[] = Array.from(topicMap.entries())
  .map(([id, games]) => ({
    id,
    title: formatTopicTitle(id),
    games: games.sort((a, b) => a.title.localeCompare(b.title)),
  }))
  .sort((a, b) => a.title.localeCompare(b.title));

export const GAMES: Game[] = GAME_TOPICS.flatMap((topic) => topic.games);
