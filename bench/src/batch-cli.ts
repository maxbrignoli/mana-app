#!/usr/bin/env node
/**
 * CLI batch del bench self-play.
 *
 * Carica un dataset di scenari da JSON, li esegue in parallelo limitato, e
 * produce sia un report aggregato leggibile sia (opzionalmente) un file JSON
 * con tutti i trace raw per analisi successive.
 *
 * Esempi:
 *
 *   # Run del dataset default con concurrency 4
 *   npm run bench:batch
 *
 *   # Dataset custom, output traces su disco
 *   npm run bench:batch -- \
 *     --scenarios default \
 *     --concurrency 4 \
 *     --output-traces /tmp/bench-traces.json \
 *     --output-report /tmp/bench-report.json
 *
 *   # Path assoluto al dataset
 *   npm run bench:batch -- --scenarios /path/to/custom.json
 */

import { writeFile } from 'node:fs/promises';
import { runBatch } from './batch-runner.js';
import { buildReport, formatReport } from './report.js';
import { loadScenarioDataset } from './scenarios.js';

interface BatchCliArgs {
  scenarios: string;
  concurrency: number;
  outputTraces?: string;
  outputReport?: string;
  quiet: boolean;
}

function parseArgs(argv: string[]): BatchCliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const has = (flag: string): boolean => argv.includes(flag);

  return {
    scenarios: get('--scenarios') ?? 'default',
    concurrency: Number.parseInt(get('--concurrency') ?? '4', 10),
    outputTraces: get('--output-traces'),
    outputReport: get('--output-report'),
    quiet: has('--quiet'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // 1) Carica dataset
  const dataset = await loadScenarioDataset(args.scenarios);
  if (!args.quiet) {
    process.stdout.write(`\nLoaded dataset "${dataset.name}" with ${dataset.scenarios.length} scenarios.\n`);
    if (dataset.description) {
      process.stdout.write(`  ${dataset.description}\n`);
    }
    process.stdout.write(`Running with concurrency=${args.concurrency}...\n\n`);
  }

  // 2) Esegui batch con progress
  const batchResult = await runBatch(dataset.scenarios, {
    concurrency: args.concurrency,
    onScenarioComplete: ({ trace, completed, total }) => {
      if (args.quiet) return;
      const pad = String(total).length;
      const num = `[${String(completed).padStart(pad)}/${total}]`;
      const status = trace.outcome === 'error' ? 'ERROR' : trace.outcome.toUpperCase();
      const target = trace.resolvedTargetCharacter
        ? `target="${trace.resolvedTargetCharacter}"`
        : '';
      process.stdout.write(
        `  ${num} ${trace.scenario.id.padEnd(25)} ${status.padEnd(10)} q=${String(trace.questionsUsed).padStart(2)}  $${trace.totalCostUsd.toFixed(4)}  ${target}\n`,
      );
    },
  });

  // 3) Build report
  const report = buildReport(batchResult.traces, batchResult.totalDurationMs);

  // 4) Stampa report leggibile
  if (!args.quiet) {
    process.stdout.write(formatReport(report));
  }

  // 5) Salva su disco se richiesto
  if (args.outputTraces) {
    await writeFile(
      args.outputTraces,
      JSON.stringify(
        {
          dataset: { name: dataset.name, description: dataset.description },
          startedAt: batchResult.startedAt,
          endedAt: batchResult.endedAt,
          totalDurationMs: batchResult.totalDurationMs,
          traces: batchResult.traces,
        },
        null,
        2,
      ),
    );
    if (!args.quiet) {
      process.stdout.write(`Raw traces saved to: ${args.outputTraces}\n`);
    }
    report.rawTracesPath = args.outputTraces;
  }

  if (args.outputReport) {
    await writeFile(args.outputReport, JSON.stringify(report, null, 2));
    if (!args.quiet) {
      process.stdout.write(`Report saved to: ${args.outputReport}\n`);
    }
  }
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
