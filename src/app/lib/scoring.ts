/**
 * Design goals:
 * - Fast correct answers are rewarded.
 * - Win streaks boost points, but with diminishing returns (so leaders don't runaway).
 * - Lose streak "comeback" bonus helps someone regain position when they finally get it right.
 * - Wrong answers give 0 points (simple + avoids griefing).
 */

export function nextStreakAfterAnswer(prevStreak: number, wasCorrect: boolean) {
  if (wasCorrect) {
    // if you were losing, snap back to +1; otherwise increment
    return prevStreak < 0 ? 1 : prevStreak + 1;
  }
  // wrong: if you were winning, snap to -1; otherwise decrement
  return prevStreak > 0 ? -1 : prevStreak - 1;
}

export function computeAwardForCorrect(args: {
  answerMs: number; // time from question start
  durationMs: number;
  nextPositiveStreak: number; // >=1
  previousNegativeStreak: number; // 0+ (how many wrong in a row before this correct)
}) {
  const { answerMs, durationMs, nextPositiveStreak, previousNegativeStreak } = args;

  const base = 120;

  // Speed bonus: up to +80, slightly curved so super-fast matters but not absurdly
  const t = Math.max(0, Math.min(1, (durationMs - answerMs) / durationMs)); // remaining ratio
  const speedBonus = Math.round(80 * Math.pow(t, 1.25));

  // Win streak multiplier: starts at 2 streak, caps around +45%
  const streakSteps = Math.max(0, nextPositiveStreak - 1);
  const winMult = 1 + Math.min(0.45, streakSteps * 0.08);

  // Comeback multiplier: based on previous lose streak magnitude, caps around +35%
  const comebackMult = 1 + Math.min(0.35, previousNegativeStreak * 0.07);

  const raw = (base + speedBonus) * winMult * comebackMult;
  return Math.round(raw);
}
