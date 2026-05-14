#!/usr/bin/env node
/**
 * CLI di base per il self-play harness.
 *
 * Permette di lanciare una singola partita di prova passando lo scenario
 * via flag, e stampa il trace risultante. Utile per smoke test e debug.
 * Il runner massivo arrivera' nel PR successivo (PR #2 della Fase 5).
 *
 * Esempi:
 *
 *   # mana_guesses: Mana deve indovinare Pikachu
 *   tsx bench/src/cli.ts \
 *     --mode mana_guesses \
 *     --target "Pikachu" \
 *     --domains cartoni \
 *     --difficulty easy \
 *     --age 8 \
 *     --max 20
 *
 *   # user_guesses: il bot deve indovinare un personaggio scelto da Mana
 *   tsx bench/src/cli.ts \
 *     --mode user_guesses \
 *     --domains personaggi-storici \
 *     --difficulty medium \
 *     --age 10 \
 *     --max 20
 */

import { runSinglePlayerGame } from './runner.js';
import type { Scenario } from './types.js';
import type { Difficulty, GameMode } from '../../api/_lib/game/types.js';

interface CliArgs {
  mode: GameMode;
  target?: string;
  domains: string[];
  difficulty: Difficulty;
  cultures: string[];
  age: number | null;
  max: number;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };

  const has = (flag: string): boolean => argv.includes(flag);

  const modeStr = get('--mode');
  if (modeStr !== 'mana_guesses' && modeStr !== 'user_guesses') {
    throw new Error(
      'Required: --mode mana_guesses | user_guesses',
    );
  }

  const difficultyStr = (get('--difficulty') ?? 'medium') as Difficulty;
  if (!['easy', 'medium', 'hard'].includes(difficultyStr)) {
    throw new Error('--difficulty must be one of: easy | medium | hard');
  }

  const ageStr = get('--age');
  const age = ageStr ? Number.parseInt(ageStr, 10) : null;

  return {
    mode: modeStr,
    target: get('--target'),
    domains: (get('--domains') ?? 'personaggi-storici').split(',').map((d) => d.trim()),
    difficulty: difficultyStr,
    cultures: (get('--cultures') ?? 'italian,global').split(',').map((c) => c.trim()),
    age,
    max: Number.parseInt(get('--max') ?? '20', 10),
    json: has('--json'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const scenario: Scenario = {
    id: `cli-${Date.now()}`,
    mode: args.mode,
    targetCharacter: args.target,
    domains: args.domains,
    difficulty: args.difficulty,
    cultures: args.cultures,
    age: args.age,
    maxQuestions: args.max,
  };

  if (!args.json) {
    process.stdout.write(`\n▶ Running scenario: ${JSON.stringify(scenario, null, 2)}\n\n`);
  }

  const trace = await runSinglePlayerGame(scenario);

  if (args.json) {
    process.stdout.write(JSON.stringify(trace, null, 2) + '\n');
    return;
  }

  // Output leggibile
  printHumanReadable(trace);
}

function printHumanReadable(trace: { runId: string; outcome: string; questionsUsed: number; resolvedTargetCharacter: string; totalDurationMs: number; totalCostUsd: number; provider: string; moves: Array<{ index: number; actor: string; text: string; parsedKind?: string; latencyMs?: number }>; errorMessage?: string }): void {
  process.stdout.write(`Run ID: ${trace.runId}\n`);
  process.stdout.write(`Provider: ${trace.provider}\n`);
  process.stdout.write(`Target character: ${trace.resolvedTargetCharacter}\n`);
  process.stdout.write(`Outcome: ${trace.outcome}\n`);
  process.stdout.write(`Questions used: ${trace.questionsUsed}\n`);
  process.stdout.write(`Duration: ${(trace.totalDurationMs / 1000).toFixed(2)}s\n`);
  process.stdout.write(`Estimated cost: $${trace.totalCostUsd.toFixed(6)}\n`);
  if (trace.errorMessage) {
    process.stdout.write(`Error: ${trace.errorMessage}\n`);
  }
  process.stdout.write('\n--- Conversation ---\n');
  for (const m of trace.moves) {
    const who = m.actor === 'mana' ? 'MANA' : 'USER';
    const lat = m.latencyMs ? ` [${m.latencyMs}ms]` : '';
    const kind = m.parsedKind ? ` <${m.parsedKind}>` : '';
    process.stdout.write(`[${m.index}] ${who}${lat}${kind}: ${m.text}\n`);
  }
  process.stdout.write('\n');
}

main().catch((error) => {
  process.stderr.write(
    `Fatal: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  if (error instanceof Error && error.stack) {
    process.stderr.write(error.stack + '\n');
  }
  process.exit(1);
});
