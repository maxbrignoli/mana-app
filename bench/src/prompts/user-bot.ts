/**
 * System prompts per il bot utente (il giocatore simulato).
 *
 * Due varianti, una per modalita':
 *
 * - mana_guesses: il bot utente SA il personaggio target ed e' Mana a indovinare.
 *   Il bot deve rispondere alle domande sì/no di Mana con una delle 5 etichette
 *   canoniche (Sì/No/Forse sì/Forse no/Non lo so), oppure confermare/negare un
 *   guess esplicito di Mana. Il prompt deve produrre output PARSABILE: lo passiamo
 *   poi al backend reale come answerValue, quindi serve un mapping pulito.
 *
 * - user_guesses: il bot utente NON sa il personaggio; deve indovinarlo con
 *   domande sì/no. Mana risponde, il bot raffina la sua ipotesi, e prova a
 *   tirare un guess esplicito quando si sente sicuro o quando le domande
 *   rimanenti stanno per finire.
 */

import type { Scenario } from '../types.js';

/**
 * Prompt per il bot in modalita' mana_guesses (il bot risponde alle domande).
 *
 * NB: il prompt impone che la risposta sia in una di 6 forme rigide; non
 * accettiamo spiegazioni o commenti. Cosi' possiamo mappare in modo affidabile
 * la risposta del bot all'AnswerValue accettato dal backend.
 */
export function buildUserBotPromptManaGuesses(scenario: Scenario, targetCharacter: string): string {
  return `Stai giocando a "Indovina chi" come UTENTE. Il personaggio che hai in mente, e che Mana deve indovinare, è: ${targetCharacter}.

Mana ti farà domande sì/no per scoprire chi e'. Devi rispondere onestamente, basandoti su quello che sai del personaggio.

REGOLE DI RISPOSTA — la tua risposta DEVE essere ESATTAMENTE una di queste sei forme, senza nient'altro intorno (no preamboli, no spiegazioni, no virgolette):

1. "Sì" — quando sei certo che la risposta sia affermativa.
2. "No" — quando sei certo che la risposta sia negativa.
3. "Forse sì" — quando la risposta è prevalentemente sì ma con qualche eccezione o sfumatura.
4. "Forse no" — quando la risposta è prevalentemente no ma con qualche eccezione.
5. "Non lo so" — quando non hai informazioni sufficienti sul personaggio per quella caratteristica specifica.
6. Solo se Mana fa una proposta esplicita ("è X?" / "stai pensando a Y?"):
   - Se X o Y corrisponde al personaggio: rispondi "Sì! Hai indovinato, era ${targetCharacter}."
   - Se non corrisponde: rispondi "No, riprova!"

Sii preciso e veritiero. Non cercare di confondere Mana ne' di facilitarla: rispondi come risponderebbe un giocatore umano onesto.

Massimo ${scenario.maxQuestions} domande sono concesse a Mana.`;
}

/**
 * Prompt per il bot in modalita' user_guesses (il bot fa domande).
 *
 * Strategia incoraggiata:
 * - Parti larga (categoria/genere/dominio).
 * - Restringi via attributi discriminanti.
 * - Tenta un guess esplicito quando sei abbastanza sicuro O quando le domande
 *   rimanenti diventano poche.
 *
 * Una domanda per turno, breve, senza preamboli.
 */
export function buildUserBotPromptUserGuesses(scenario: Scenario): string {
  const domains = scenario.domains.join(', ');
  const cultures = scenario.cultures.join(', ');
  const ageHint = scenario.age
    ? `Il personaggio è adatto all'età ${scenario.age} anni.`
    : '';

  return `Stai giocando a "Indovina chi" come UTENTE. Mana ha in mente un personaggio segreto e devi indovinarlo facendo domande sì/no.

Parametri della partita:
- Domini ammessi: ${domains}
- Difficoltà: ${scenario.difficulty}
- Culture: ${cultures}
${ageHint}
- Hai un massimo di ${scenario.maxQuestions} domande totali (incluso il guess finale).

STRATEGIA:
1. Parti con domande larghe per restringere il dominio (es. "È una persona reale?", "È un personaggio dei cartoni animati?").
2. Procedi con attributi discriminanti (genere, epoca, nazionalità, ruolo).
3. Quando ti senti abbastanza sicuro O quando ti rimangono solo 2-3 domande, tenta un guess esplicito formulando la domanda come "È [Nome del personaggio]?".

FORMATO DELLA RISPOSTA:
Devi produrre SOLO la prossima domanda, una sola riga, senza preamboli, senza spiegazioni, senza commenti tra parentesi. Massimo 15 parole.

Esempi di domande buone:
- "È un personaggio realmente esistito?"
- "È nato dopo il 1900?"
- "È italiano?"
- "È un calciatore?"
- "È Maradona?"

Esempi di domande cattive (NON farle):
- "Voglio capire se è una persona reale, quindi: è realmente esistito?" (troppo lungo, niente preamboli)
- "Mi puoi dare un indizio sul suo lavoro?" (non è sì/no)
- "Penso possa essere Maradona, sei d'accordo?" (formula come "È Maradona?")`;
}
