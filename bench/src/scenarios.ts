/**
 * Caricamento e validazione di scenari da file JSON.
 *
 * Il file JSON ha la forma:
 *   { name: string, description?: string, scenarios: Scenario[] }
 *
 * Validiamo con Zod per dare errori chiari su scenari mal-formati. Il bench
 * non parte se anche un solo scenario e' invalido: meglio bloccare subito
 * che propagare errori durante il batch run.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Scenario } from './types.js';

const difficultySchema = z.enum(['easy', 'medium', 'hard']);
const modeSchema = z.enum(['mana_guesses', 'user_guesses']);

const scenarioSchema = z.object({
  id: z.string().min(1),
  mode: modeSchema,
  targetCharacter: z.string().min(1).optional(),
  domains: z.array(z.string().min(1)).min(1),
  difficulty: difficultySchema,
  cultures: z.array(z.string().min(1)).min(1),
  age: z.number().int().min(3).max(120).nullable(),
  maxQuestions: z.number().int().positive(),
});

const datasetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scenarios: z.array(scenarioSchema).min(1),
});

export interface ScenarioDataset {
  name: string;
  description?: string;
  scenarios: Scenario[];
}

/**
 * Carica un file di scenari. Path puo' essere assoluto o relativo alla
 * cartella corrente di esecuzione (CLI). Se il path non termina in .json,
 * lo aggiungiamo automaticamente per comodita' (`--scenarios default` →
 * `bench/scenarios/default.json`).
 *
 * Conflitti su id vengono rilevati: non possiamo avere due scenari con
 * lo stesso id, ne andrebbe persa la tracciabilita' nel report.
 */
export async function loadScenarioDataset(pathOrName: string): Promise<ScenarioDataset> {
  const path = resolvePath(pathOrName);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(
      `Cannot read scenario file at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Scenario file is not valid JSON (${path}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = datasetSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid scenario dataset (${path}):\n${issues}`);
  }

  // Verifica univocita' degli id.
  const seen = new Set<string>();
  for (const s of result.data.scenarios) {
    if (seen.has(s.id)) {
      throw new Error(`Duplicate scenario id in ${path}: ${s.id}`);
    }
    seen.add(s.id);
  }

  return result.data as ScenarioDataset;
}

function resolvePath(pathOrName: string): string {
  // Se contiene separatori di percorso (assoluto o relativo esplicito), usa cosi'.
  if (pathOrName.startsWith('/') || pathOrName.includes('/') || pathOrName.includes('\\')) {
    return resolve(pathOrName);
  }
  // Altrimenti consideralo un nome dataset nella cartella standard.
  const withExt = pathOrName.endsWith('.json') ? pathOrName : `${pathOrName}.json`;
  return resolve(process.cwd(), 'bench', 'scenarios', withExt);
}
