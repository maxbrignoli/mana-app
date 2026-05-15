/**
 * Aggregazione e reporting di risultati batch.
 *
 * Produce due cose:
 * 1. Un BatchReport: oggetto JSON con metriche aggregate, salvabile su disco
 *    per analisi successive e confronti prima/dopo (cruciale per tuning prompt).
 * 2. Un formato testuale human-readable da stampare a terminale, organizzato
 *    in tabelle a colonne fisse (no dipendenze esterne).
 */

import type { GameMode } from '../../api/_lib/game/types.js';
import type { GameTrace, ManaAnswerKind } from './types.js';

export interface OutcomeStats {
  count: number;
  manaWon: number;
  userWon: number;
  timeout: number;
  error: number;
  /** % vittorie di Mana sul totale, escludendo error (gli error non sono "partite vere"). */
  manaWinRate: number;
  /** % vittorie utente sul totale, escludendo error. */
  userWinRate: number;
  /** Numero medio di domande "del lato che sta indovinando" — Mana in mana_guesses, bot in user_guesses. */
  avgQuestionsUsed: number;
  /** Numero medio di domande nelle sole partite con esito vincente. */
  avgQuestionsToWin: number | null;
  totalCostUsd: number;
  avgCostUsd: number;
  totalTokensInput: number;
  totalTokensCachedInput: number;
  totalTokensOutput: number;
  /** Latenza per turno AI (millisecondi). Calcolata su TUTTI i turni di tutte le partite. */
  turnLatencyP50: number;
  turnLatencyP95: number;
  /** % di turni in cui finishReason era 'length' (troncamento). */
  truncatedTurnsRate: number;
}

export interface ParserStats {
  /** Numero totale di mosse di Mana classificate in user_guesses. */
  totalManaTurns: number;
  /** Distribuzione delle classificazioni. */
  byKind: Record<ManaAnswerKind, number>;
  /** Distribuzione delle confidenze. */
  byConfidence: Record<'high' | 'medium' | 'low', number>;
  /** % di mosse classificate come 'unknown'. */
  unknownRate: number;
}

export interface BatchReport {
  generatedAt: string;
  totalDurationMs: number;
  scenarioCount: number;
  /** Statistiche globali su tutti gli scenari. */
  overall: OutcomeStats;
  /** Breakdown per modalita'. */
  byMode: Partial<Record<GameMode, OutcomeStats>>;
  /** Breakdown per difficolta'. */
  byDifficulty: Record<string, OutcomeStats>;
  /** Breakdown per dominio (primo dominio dello scenario). */
  byPrimaryDomain: Record<string, OutcomeStats>;
  /** Stato del parser sulle partite user_guesses. */
  parser: ParserStats;
  /** Provider utilizzato (snapshot da uno qualunque dei trace). */
  provider: string;
  /** Path al file con i trace raw, se salvato. */
  rawTracesPath?: string;
}

export function buildReport(traces: GameTrace[], totalDurationMs: number): BatchReport {
  const overall = computeStats(traces);

  const byMode: Partial<Record<GameMode, OutcomeStats>> = {};
  for (const mode of ['mana_guesses', 'user_guesses'] as const) {
    const subset = traces.filter((t) => t.scenario.mode === mode);
    if (subset.length > 0) {
      byMode[mode] = computeStats(subset);
    }
  }

  const byDifficulty: Record<string, OutcomeStats> = {};
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const subset = traces.filter((t) => t.scenario.difficulty === difficulty);
    if (subset.length > 0) {
      byDifficulty[difficulty] = computeStats(subset);
    }
  }

  const byPrimaryDomain: Record<string, OutcomeStats> = {};
  for (const t of traces) {
    const dom = t.scenario.domains[0];
    if (!dom) continue;
    if (!byPrimaryDomain[dom]) {
      const subset = traces.filter((x) => x.scenario.domains[0] === dom);
      byPrimaryDomain[dom] = computeStats(subset);
    }
  }

  const parser = computeParserStats(traces);

  const provider = traces.find((t) => t.provider)?.provider ?? '';

  return {
    generatedAt: new Date().toISOString(),
    totalDurationMs,
    scenarioCount: traces.length,
    overall,
    byMode,
    byDifficulty,
    byPrimaryDomain,
    parser,
    provider,
  };
}

function computeStats(traces: GameTrace[]): OutcomeStats {
  const count = traces.length;
  const manaWon = traces.filter((t) => t.outcome === 'mana_won').length;
  const userWon = traces.filter((t) => t.outcome === 'user_won').length;
  const timeout = traces.filter((t) => t.outcome === 'timeout').length;
  const error = traces.filter((t) => t.outcome === 'error').length;
  const playable = count - error;

  const manaWinRate = playable > 0 ? manaWon / playable : 0;
  const userWinRate = playable > 0 ? userWon / playable : 0;

  const totalQuestionsUsed = traces.reduce((sum, t) => sum + t.questionsUsed, 0);
  const avgQuestionsUsed = playable > 0 ? totalQuestionsUsed / playable : 0;

  const wonTraces = traces.filter(
    (t) =>
      (t.scenario.mode === 'mana_guesses' && t.outcome === 'mana_won') ||
      (t.scenario.mode === 'user_guesses' && t.outcome === 'user_won'),
  );
  const avgQuestionsToWin =
    wonTraces.length > 0
      ? wonTraces.reduce((sum, t) => sum + t.questionsUsed, 0) / wonTraces.length
      : null;

  const totalCostUsd = traces.reduce((sum, t) => sum + t.totalCostUsd, 0);
  const avgCostUsd = count > 0 ? totalCostUsd / count : 0;

  let totalTokensInput = 0;
  let totalTokensCachedInput = 0;
  let totalTokensOutput = 0;
  const allLatencies: number[] = [];
  let truncatedTurns = 0;
  let totalTurns = 0;

  for (const t of traces) {
    for (const m of t.moves) {
      totalTokensInput += m.inputTokens ?? 0;
      totalTokensCachedInput += m.cachedInputTokens ?? 0;
      totalTokensOutput += m.outputTokens ?? 0;
      if (m.latencyMs !== undefined) allLatencies.push(m.latencyMs);
      if (m.truncated) truncatedTurns += 1;
      totalTurns += 1;
    }
  }

  return {
    count,
    manaWon,
    userWon,
    timeout,
    error,
    manaWinRate,
    userWinRate,
    avgQuestionsUsed,
    avgQuestionsToWin,
    totalCostUsd,
    avgCostUsd,
    totalTokensInput,
    totalTokensCachedInput,
    totalTokensOutput,
    turnLatencyP50: percentile(allLatencies, 0.5),
    turnLatencyP95: percentile(allLatencies, 0.95),
    truncatedTurnsRate: totalTurns > 0 ? truncatedTurns / totalTurns : 0,
  };
}

function computeParserStats(traces: GameTrace[]): ParserStats {
  const byKind: Record<ManaAnswerKind, number> = {
    yes: 0,
    no: 0,
    maybe_yes: 0,
    maybe_no: 0,
    dont_know: 0,
    correct_guess: 0,
    wrong_guess: 0,
    unknown: 0,
  };
  const byConfidence: Record<'high' | 'medium' | 'low', number> = {
    high: 0,
    medium: 0,
    low: 0,
  };
  let totalManaTurns = 0;

  for (const t of traces) {
    if (t.scenario.mode !== 'user_guesses') continue;
    for (const m of t.moves) {
      if (m.actor !== 'mana' || !m.parsedKind) continue;
      totalManaTurns += 1;
      byKind[m.parsedKind] += 1;
      if (m.parsedConfidence) {
        byConfidence[m.parsedConfidence] += 1;
      }
    }
  }

  const unknownRate = totalManaTurns > 0 ? byKind.unknown / totalManaTurns : 0;

  return { totalManaTurns, byKind, byConfidence, unknownRate };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

// ---------------------------------------------------------------------------
// Formatting human-readable
// ---------------------------------------------------------------------------

export function formatReport(report: BatchReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('═══ BATCH SELF-PLAY REPORT ═══');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Provider:  ${report.provider}`);
  lines.push(`Scenarios: ${report.scenarioCount}`);
  lines.push(`Duration:  ${(report.totalDurationMs / 1000).toFixed(1)}s`);
  lines.push('');

  lines.push('— OVERALL —');
  lines.push(formatOutcomeStats(report.overall));
  lines.push('');

  lines.push('— BY MODE —');
  for (const [mode, stats] of Object.entries(report.byMode)) {
    if (!stats) continue;
    lines.push(`[${mode}]`);
    lines.push(formatOutcomeStats(stats));
    lines.push('');
  }

  lines.push('— BY DIFFICULTY —');
  for (const [diff, stats] of Object.entries(report.byDifficulty)) {
    lines.push(`[${diff}]`);
    lines.push(formatOutcomeStats(stats));
    lines.push('');
  }

  lines.push('— BY PRIMARY DOMAIN —');
  for (const [dom, stats] of Object.entries(report.byPrimaryDomain)) {
    lines.push(`[${dom}]`);
    lines.push(formatOutcomeStats(stats));
    lines.push('');
  }

  lines.push('— PARSER (user_guesses only) —');
  lines.push(formatParserStats(report.parser));
  lines.push('');

  return lines.join('\n');
}

function formatOutcomeStats(s: OutcomeStats): string {
  const lines: string[] = [];
  lines.push(`  count=${s.count}  mana_won=${s.manaWon}  user_won=${s.userWon}  timeout=${s.timeout}  error=${s.error}`);
  lines.push(`  mana_win_rate=${pct(s.manaWinRate)}  user_win_rate=${pct(s.userWinRate)}`);
  const avgQTW = s.avgQuestionsToWin !== null ? s.avgQuestionsToWin.toFixed(1) : 'n/a';
  lines.push(`  avg_questions_used=${s.avgQuestionsUsed.toFixed(1)}  avg_questions_to_win=${avgQTW}`);
  lines.push(`  total_cost=$${s.totalCostUsd.toFixed(4)}  avg_cost_per_game=$${s.avgCostUsd.toFixed(4)}`);
  lines.push(`  tokens: input=${s.totalTokensInput} (cached=${s.totalTokensCachedInput}) output=${s.totalTokensOutput}`);
  lines.push(`  turn_latency: p50=${s.turnLatencyP50}ms  p95=${s.turnLatencyP95}ms`);
  lines.push(`  truncated_turns_rate=${pct(s.truncatedTurnsRate)}`);
  return lines.join('\n');
}

function formatParserStats(s: ParserStats): string {
  const lines: string[] = [];
  lines.push(`  total_mana_turns=${s.totalManaTurns}`);
  lines.push(`  by_kind:`);
  for (const [k, v] of Object.entries(s.byKind)) {
    if (v > 0) {
      const r = s.totalManaTurns > 0 ? (v / s.totalManaTurns) : 0;
      lines.push(`    ${k.padEnd(15)} ${v.toString().padStart(4)}  (${pct(r)})`);
    }
  }
  lines.push(`  by_confidence:`);
  for (const [k, v] of Object.entries(s.byConfidence)) {
    if (v > 0) {
      const r = s.totalManaTurns > 0 ? (v / s.totalManaTurns) : 0;
      lines.push(`    ${k.padEnd(15)} ${v.toString().padStart(4)}  (${pct(r)})`);
    }
  }
  lines.push(`  unknown_rate=${pct(s.unknownRate)}`);
  return lines.join('\n');
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
