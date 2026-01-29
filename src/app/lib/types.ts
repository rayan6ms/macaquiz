export type OptionKey = "A" | "B" | "C" | "D" | "E";
export type Phase = "lobby" | "question" | "lockin" | "reveal" | "scoreboard";

export type Question = {
  id: string;
  title: string;
  options: Partial<Record<OptionKey, string>>;
  correct: OptionKey;
  image?: string;
};

export type PublicQuestion = Pick<Question, "id" | "title" | "options" | "image">;

export type Game = {
  id: string;
  title: string;
  questions: Question[];
};

export type ServerPlayer = {
  clientId: string;
  name: string;
  icon: string; // /icons/icon-1.svg
  points: number;
  streak: number; // positive = win streak, negative = lose streak
  correctCount: number;
  wrongCount: number;
  connected: boolean;
  ready: boolean; // ✅ NEW
};

export type PublicPlayer = {
  clientId: string;
  name: string;
  icon: string;
  points: number;
  streak: number;
  correctCount: number;
  wrongCount: number;
  lastAnswer?: OptionKey;
  hasAnswered: boolean;
  connected: boolean;
  ready: boolean; // ✅ NEW
};

export type PublicState = {
  hasHost: boolean;
  hostClientId?: string;
  hostConnected: boolean;

  game?: { id: string; title: string; questionCount: number };
  phase: Phase;
  currentQuestionIndex: number;

  questionDurationMs: number;
  remainingMs: number;
  paused: boolean;

  // ✅ lobby readiness
  readyCount: number;
  allPlayersReady: boolean;

  question?: PublicQuestion;

  correctOption?: OptionKey;

  players: PublicPlayer[];
  answersCount: number;
  playersCount: number; // players in match (includes disconnected during questions)
};
