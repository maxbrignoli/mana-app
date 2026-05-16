import { describe, it, expect } from 'vitest';
import { parseManaQuestion } from '../question-parser.js';

describe('parseManaQuestion', () => {
  describe('regular_question (negativi: NON sono tentativi nominali)', () => {
    const cases = [
      'Sei un personaggio storico?',
      'Sei nato in Italia?',
      'Sei famoso?',
      'Sei una donna?',
      'Sei vivo ai giorni nostri?',
      'Sei stato un attore?',
      'Sei conosciuto a livello mondiale?',
      'Hai mai vinto un premio Nobel?',
      'Vivi negli Stati Uniti?',
      'Sei un personaggio dei cartoni animati?',
    ];

    for (const q of cases) {
      it(`riconosce come regular_question: "${q}"`, () => {
        const r = parseManaQuestion(q);
        expect(r.kind).toBe('regular_question');
        expect(r.guessedName).toBeNull();
      });
    }
  });

  describe('nominal_guess (positivi: tentativi nominali)', () => {
    const cases: Array<[string, string]> = [
      ['Sei Pikachu?', 'Pikachu'],
      ['Sei Topolino?', 'Topolino'],
      ['Sei Marie Curie?', 'Marie Curie'],
      ['Sei Albert Einstein?', 'Albert Einstein'],
      ['Quindi sei Topolino?', 'Topolino'],
      ['Allora sei Pikachu?', 'Pikachu'],
      ['Sei forse Marie Curie?', 'Marie Curie'],
      ['Sei davvero Pikachu?', 'Pikachu'],
      ['Sei proprio Topolino?', 'Topolino'],
      ['Sei Leonardo da Vinci?', 'Leonardo da Vinci'],
      ['Sei Giovanni della Casa?', 'Giovanni della Casa'],
    ];

    for (const [q, expected] of cases) {
      it(`riconosce come nominal_guess: "${q}" -> ${expected}`, () => {
        const r = parseManaQuestion(q);
        expect(r.kind).toBe('nominal_guess');
        expect(r.guessedName).toBe(expected);
        expect(r.confidence).toBe('high');
      });
    }
  });

  describe('edge cases', () => {
    it('non si fa ingannare da "Sei Una donna?" (Una e stopword)', () => {
      const r = parseManaQuestion('Sei Una donna?');
      expect(r.kind).toBe('regular_question');
    });

    it('non si fa ingannare da "Sei Il presidente?"', () => {
      const r = parseManaQuestion('Sei Il presidente?');
      expect(r.kind).toBe('regular_question');
    });

    it('tollera spazi extra: "  Sei  Pikachu  ?  "', () => {
      const r = parseManaQuestion('  Sei  Pikachu  ?  ');
      expect(r.kind).toBe('nominal_guess');
      expect(r.guessedName).toBe('Pikachu');
    });

    it('domanda senza punto interrogativo: "Sei Pikachu" → resta regular', () => {
      // Tecnicamente non e' una domanda. Manteniamo il vincolo del "?".
      const r = parseManaQuestion('Sei Pikachu');
      expect(r.kind).toBe('regular_question');
    });

    it('stringa vuota → regular_question', () => {
      const r = parseManaQuestion('');
      expect(r.kind).toBe('regular_question');
      expect(r.guessedName).toBeNull();
    });
  });
});
