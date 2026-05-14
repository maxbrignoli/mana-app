import { z } from 'zod';

/**
 * Schemi Zod per i payload delle API di gioco single player.
 *
 * Centralizzati qui per essere riusati dai vari endpoint e dai test.
 * Le validazioni qui sono i controlli "di forma" (tipi, enum, range): le
 * regole di business (es. owner della partita, gemme sufficienti) vivono
 * nelle RPC PostgreSQL.
 */

export const startSingleGameBodySchema = z.object({
  mode: z.enum(['mana_guesses', 'user_guesses']),
  domains: z.array(z.string()).min(1).max(20),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  culture: z.array(z.string()).min(1).max(10),
  maxQuestions: z.number().int().min(5).max(50).optional(),
  dailyChallengeId: z.string().uuid().optional(),
});

export type StartSingleGameBody = z.infer<typeof startSingleGameBodySchema>;

export const endSingleGameBodySchema = z.object({
  gameId: z.string().uuid(),
  result: z.enum(['user_won', 'user_lost', 'abandoned']),
});

export type EndSingleGameBody = z.infer<typeof endSingleGameBodySchema>;

/**
 * Body per /api/games/single/move.
 *
 * Il payload dell'utente dipende dalla modalita':
 * - mana_guesses: l'utente risponde alla domanda di Mana scegliendo uno dei
 *   5 valori canonici. answerValue e' obbligatorio, userMessage opzionale.
 * - user_guesses: l'utente fa una domanda in linguaggio naturale.
 *   userMessage e' obbligatorio. Se l'utente sta tentando di indovinare,
 *   tipicamente la domanda contiene il nome ("Sei Pikachu?").
 */
export const moveSingleGameBodySchema = z.object({
  gameId: z.string().uuid(),
  /** Per mode=mana_guesses: la risposta sì/no/maybe/dontKnow alla domanda di Mana. */
  answerValue: z
    .enum(['yes', 'no', 'maybe_yes', 'maybe_no', 'dont_know'])
    .optional(),
  /** Per mode=user_guesses: la domanda libera dell'utente. */
  userMessage: z.string().min(1).max(500).optional(),
});

export type MoveSingleGameBody = z.infer<typeof moveSingleGameBodySchema>;
