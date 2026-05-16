/**
 * Parser delle MOSSE DI MANA in modalita' mana_guesses.
 *
 * In questa modalita' Mana fa le domande all'utente. La maggior parte sono
 * domande "regolari" ("Sei un personaggio storico?", "Vivi ai giorni nostri?")
 * ma a un certo punto Mana puo' formulare un tentativo nominale
 * ("Sei Pikachu?", "Quindi sei Topolino?"). Il client e il backend devono
 * distinguere i due casi perche':
 *
 * - su un tentativo nominale ('nominal_guess'), la risposta 'yes' dell'utente
 *   chiude la partita con esito user_lost (Mana ha indovinato);
 * - su una domanda regolare ('regular_question'), 'yes' e' solo informazione
 *   e la partita prosegue.
 *
 * Strategia: regex su pattern che catturano un nome proprio dentro la forma
 * "Sei [Nome]?", "Sei forse [Nome]?", "Quindi sei [Nome]?", ecc.
 * Estraiamo anche il nome candidato cosi' il client puo' mostrarlo in UI.
 *
 * Tutto in italiano per ora (multilingua AI arrivera' insieme alla
 * localizzazione dei prompt).
 */

export type ManaQuestionKind = 'nominal_guess' | 'regular_question';
export type ParseConfidence = 'high' | 'medium' | 'low';

export interface ParsedManaQuestion {
  kind: ManaQuestionKind;
  /** Nome del personaggio che Mana sospetta, se kind='nominal_guess'. */
  guessedName: string | null;
  confidence: ParseConfidence;
  /** Testo originale del modello, trimmato. */
  raw: string;
}

/**
 * Pattern dei tentativi nominali.
 *
 * Vincoli pensati esplicitamente:
 * - all'inizio (tollerando virgola/spazio iniziali), opzionale "Quindi"/"Allora"
 * - "sei" (con S maiuscola o minuscola)
 * - opzionale "forse"/"davvero"/"proprio"
 * - poi una sequenza di 1-4 parole che iniziano con MAIUSCOLA accentata (nome proprio)
 *   tollerando preposizioni minuscole in mezzo ("Marie de France", "Leonardo da Vinci")
 * - punto interrogativo finale
 *
 * Catturiamo il nome nel gruppo 1.
 *
 * Casi NEGATIVI (devono restare regular_question):
 * - "Sei un personaggio storico?" → "un" e' minuscolo
 * - "Sei nato in Italia?"         → idem
 * - "Sei famoso?"                 → idem
 *
 * Casi POSITIVI (devono matchare):
 * - "Sei Pikachu?"
 * - "Sei Marie Curie?"
 * - "Quindi sei Topolino?"
 * - "Sei forse Albert Einstein?"
 * - "Sei Leonardo da Vinci?"
 */
const NOMINAL_GUESS_PATTERNS: RegExp[] = [
  /^[\s,.\-]*(?:Quindi\s+|Allora\s+)?[Ss]ei\s+(?:forse\s+|davvero\s+|proprio\s+)?([A-ZÀÁÈÉÌÍÒÓÙÚ][\p{L}'\-.]*(?:\s+(?:di\s+|de\s+|da\s+|del\s+|della\s+|van\s+|von\s+|le\s+|la\s+)?[A-ZÀÁÈÉÌÍÒÓÙÚ][\p{L}'\-.]*){0,3})\s*\?/u,
];

export function parseManaQuestion(text: string): ParsedManaQuestion {
  const raw = text.trim();

  for (const pattern of NOMINAL_GUESS_PATTERNS) {
    const match = raw.match(pattern);
    if (match && match[1]) {
      const guessedName = match[1].trim();
      // Filtro di sanita': se il nome inizia con un articolo/dimostrativo
      // (es. "Sei Una donna?" matcha "Una" come maiuscola perche' alcuni
      // utenti scrivono cosi'). Le parole sotto sono SOSTANTIVI generici,
      // non nomi propri.
      const stopwords = new Set([
        'Una',
        'Un',
        'Uno',
        'Il',
        'La',
        'Lo',
        'Gli',
        'Le',
        'I',
        'Questa',
        'Questo',
        'Quello',
        'Quella',
      ]);
      const firstWord = guessedName.split(/\s+/)[0];
      if (stopwords.has(firstWord)) {
        continue;
      }
      return {
        kind: 'nominal_guess',
        guessedName,
        confidence: 'high',
        raw,
      };
    }
  }

  return {
    kind: 'regular_question',
    guessedName: null,
    confidence: 'high',
    raw,
  };
}
