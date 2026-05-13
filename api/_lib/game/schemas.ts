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
