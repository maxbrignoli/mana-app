/**
 * Esecuzione batch di scenari self-play con concorrenza configurabile.
 *
 * Pattern: worker pool dinamico. Manteniamo `concurrency` worker attivi che
 * pescano lo scenario successivo dalla coda non appena finiscono il loro.
 * Cosi' partite veloci non aspettano partite lente: la latenza totale e'
 * dominata dalla coda piu' lenta, non dalla somma.
 *
 * Niente dipendenze esterne (p-limit & co.): il pattern e' ~30 righe.
 *
 * Errori della singola partita NON interrompono il batch: il GameTrace e'
 * gia' progettato per riportare outcome='error' invece di throw, quindi il
 * runner ritorna comunque un trace per ogni scenario.
 */

import { runSinglePlayerGame } from './runner.js';
import type { GameTrace, Scenario } from './types.js';

export interface BatchOptions {
  /** Numero massimo di partite in parallelo. Default 4. */
  concurrency?: number;
  /**
   * Callback opzionale chiamata ogni volta che uno scenario completa.
   * Utile per progress bar e logging incrementale.
   */
  onScenarioComplete?: (info: { trace: GameTrace; completed: number; total: number }) => void;
}

export interface BatchResult {
  traces: GameTrace[];
  totalDurationMs: number;
  startedAt: string;
  endedAt: string;
}

export async function runBatch(
  scenarios: Scenario[],
  options: BatchOptions = {},
): Promise<BatchResult> {
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  // I traces vengono salvati nello stesso ordine degli scenari di input
  // per facilitare la lettura del report. Inizializziamo come array sparso
  // e riempiamo per indice.
  const traces: GameTrace[] = new Array<GameTrace>(scenarios.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const myIndex = nextIndex++;
      if (myIndex >= scenarios.length) return;

      const scenario = scenarios[myIndex];
      if (!scenario) return; // pleonastico, ma serve a TS

      const trace = await runSinglePlayerGame(scenario);
      traces[myIndex] = trace;
      completed += 1;

      options.onScenarioComplete?.({
        trace,
        completed,
        total: scenarios.length,
      });
    }
  }

  // Avvia N worker, ciascuno consumera' scenari dalla coda finche' non finiscono.
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const endedAt = new Date().toISOString();
  return {
    traces,
    totalDurationMs: Date.now() - t0,
    startedAt,
    endedAt,
  };
}
