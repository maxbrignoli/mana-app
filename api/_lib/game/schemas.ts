import { z } from 'zod';

/**
 * Schemi Zod per i payload delle API di gioco single player.
 *
 * Centralizzati qui per essere riusati dai vari endpoint e dai test.
 * Le validazioni qui sono i controlli "di forma" (tipi, enum, range): le
 * regole di business (es. owner della partita, gemme sufficienti) vivono
 * nelle RPC PostgreSQL.
 */

export const startSingleGameBodySchema = z
  .object({
    mode: z.enum(['mana_guesses', 'user_guesses']),
    // domains: obbligatori SOLO per user_guesses (e' Mana che sceglie il
    // personaggio entro questi domini). In mana_guesses e' l'utente che
    // pensa al personaggio "alla cieca" — Mana non sa di chi si tratta e
    // deve indagare anche il tipo. Validato dal refine sotto.
    domains: z.array(z.string()).max(20).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    culture: z.array(z.string()).min(1).max(10),
    maxQuestions: z.number().int().min(5).max(50).optional(),
    dailyChallengeId: z.string().uuid().optional(),
  })
  .refine(
    (data) => {
      if (data.mode === 'user_guesses') {
        return Array.isArray(data.domains) && data.domains.length >= 1;
      }
      return true;
    },
    {
      message: 'domains is required (min 1) when mode is user_guesses',
      path: ['domains'],
    },
  );

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
