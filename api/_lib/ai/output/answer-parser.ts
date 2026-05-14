/**
 * Parser dell'output del modello in modalita' user_guesses.
 *
 * Il system prompt istruisce Mana a rispondere con una delle 5 etichette
 * canoniche ("Sì", "No", "Forse sì", "Forse no", "Non lo so") oppure con
 * la frase di vittoria/sconfitta sul tentativo ("Sì! Hai indovinato..." /
 * "No, riprova!"). Il modello pero' puo' sbavare ("Certamente sì!",
 * "Esattamente!", "Non saprei dirti"). Questo modulo normalizza la risposta
 * a una delle categorie strutturate, restituendo anche un livello di confidenza.
 *
 * Strategia: una serie di regex applicate in ordine di specificita'. La prima
 * che matcha vince. Tutto in italiano (per ora — multilingua arrivera' quando
 * supporteremo altre lingue lato gioco).
 */

export type ManaAnswerKind =
  | 'yes'
  | 'no'
  | 'maybe_yes'
  | 'maybe_no'
  | 'dont_know'
  | 'correct_guess'
  | 'wrong_guess'
  | 'unknown';

export type ParseConfidence = 'high' | 'medium' | 'low';

export interface ParsedManaAnswer {
  kind: ManaAnswerKind;
  confidence: ParseConfidence;
  /** Il testo originale del modello, trimmato. */
  raw: string;
}

/**
 * Ordine dei pattern: piu' specifici prima.
 *
 * NB: i pattern per "correct_guess" e "wrong_guess" devono matchare
 * prima dei generici sì/no, perche' contengono i loro keyword.
 */
interface Rule {
  pattern: RegExp;
  kind: ManaAnswerKind;
  confidence: ParseConfidence;
}

const RULES: Rule[] = [
  // === GUESS VINCENTE === (deve venire prima dei "sì" generici)
  // "Sì! Hai indovinato, era Pikachu." (frase canonica dal prompt)
  // "Esatto, era Pikachu" / "Bravo, hai indovinato"
  {
    pattern: /\b(hai\s+indovinato|bravo[!.,\s])\b/i,
    kind: 'correct_guess',
    confidence: 'high',
  },
  {
    pattern: /^\s*s[iìí][!.,\s]*\s*(esatto|esattamente|proprio cos[iìí]|era)/i,
    kind: 'correct_guess',
    confidence: 'high',
  },

  // === GUESS PERDENTE === (deve venire prima dei "no" generici)
  // "No, riprova!" (frase canonica)
  // "No, non e' lui" / "Sbagliato"
  {
    pattern: /^\s*no[!.,\s]+(riprova|non\s+e[\s'’])/i,
    kind: 'wrong_guess',
    confidence: 'high',
  },
  {
    pattern: /\bsbagliat[oa]\b/i,
    kind: 'wrong_guess',
    confidence: 'medium',
  },

  // === FORSE SI ===
  // "Forse sì", "Probabilmente sì", "Direi di sì", "Tendenzialmente sì"
  // NB: dopo i caratteri accentati il \b di JS non funziona, usiamo
  // un'asserzione su fine-parola "manuale" (fine stringa o non-lettera).
  {
    pattern: /^\s*(forse|probabilmente|tendenzialmente|direi(\s+di)?)\s+s[iìí](?![a-z])/i,
    kind: 'maybe_yes',
    confidence: 'high',
  },
  {
    pattern: /\bin\s+un\s+certo\s+senso\b|\bin\s+parte\b/i,
    kind: 'maybe_yes',
    confidence: 'medium',
  },

  // === FORSE NO ===
  {
    pattern: /^\s*(forse|probabilmente|tendenzialmente|direi(\s+di)?)\s+no\b/i,
    kind: 'maybe_no',
    confidence: 'high',
  },
  {
    pattern: /\bnon\s+proprio\b|\bnon\s+esattamente\b/i,
    kind: 'maybe_no',
    confidence: 'medium',
  },

  // === NON LO SO ===
  {
    pattern: /^\s*non\s+(lo\s+)?so\b/i,
    kind: 'dont_know',
    confidence: 'high',
  },
  {
    pattern: /\bnon\s+saprei\b|\bnon\s+sono\s+sicur[oa]\b|\bnon\s+ricordo\b/i,
    kind: 'dont_know',
    confidence: 'medium',
  },

  // === ASSOLUTAMENTE NO === (deve venire prima del "yes" generico
  // che catturerebbe il "Assolutamente" iniziale)
  {
    pattern: /^\s*(assolutamente\s+no|per\s+niente)\b/i,
    kind: 'no',
    confidence: 'high',
  },

  // === SI ===
  // Usiamo un'asserzione "non-lettera" invece di \b per gestire
  // i caratteri accentati ì/í correttamente.
  {
    pattern: /^\s*s[iìí](?![a-z])/i,
    kind: 'yes',
    confidence: 'high',
  },
  {
    pattern: /^\s*(certo|certamente|esatt[oa]|assolutamente|proprio cos[iìí])(?![a-z])/i,
    kind: 'yes',
    confidence: 'medium',
  },

  // === NO ===
  {
    pattern: /^\s*no[!.,\s]*$/i,
    kind: 'no',
    confidence: 'high',
  },
  {
    pattern: /^\s*no\b/i,
    kind: 'no',
    confidence: 'medium',
  },
];

/**
 * Parsa l'output del modello in modalita' user_guesses.
 *
 * Se nessun pattern matcha, ritorna kind='unknown' con confidence='low'.
 * Il chiamante decide se accettare la risposta cosi' com'e' o ritentare.
 */
export function parseManaAnswer(text: string): ParsedManaAnswer {
  const raw = text.trim();

  if (!raw) {
    return { kind: 'unknown', confidence: 'low', raw };
  }

  for (const rule of RULES) {
    if (rule.pattern.test(raw)) {
      return { kind: rule.kind, confidence: rule.confidence, raw };
    }
  }

  return { kind: 'unknown', confidence: 'low', raw };
}

/**
 * Comodo type-guard: vero se il parsing ha rilevato un guess (vincente o no).
 */
export function isGuessOutcome(kind: ManaAnswerKind): boolean {
  return kind === 'correct_guess' || kind === 'wrong_guess';
}
