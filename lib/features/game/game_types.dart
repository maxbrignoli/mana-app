/// Tipi enum specifici del gioco "indovina chi" di Mana.
///
/// Riflettono il dominio backend (api/_lib/game/schemas.ts).
/// Sono SPECIFICI di questo gioco: quando il core sara' estratto in un
/// package riusabile, questi tipi resteranno qui in `features/game`.
library;

/// Modalita' di una partita single player.
///
/// - manaGuesses: Mana fa domande, l'utente risponde si/no/forse.
///   L'utente ha pensato a un personaggio.
/// - userGuesses: l'utente fa domande in linguaggio naturale, Mana
///   risponde. Mana ha scelto un personaggio segreto.
enum SingleGameMode {
  manaGuesses('mana_guesses'),
  userGuesses('user_guesses');

  final String wireValue;
  const SingleGameMode(this.wireValue);
}

/// Difficolta' di una partita.
enum Difficulty {
  easy('easy'),
  medium('medium'),
  hard('hard');

  final String wireValue;
  const Difficulty(this.wireValue);
}

/// I 5 valori canonici di risposta dell'utente a una domanda di Mana
/// (modalita' manaGuesses).
enum AnswerValue {
  yes('yes'),
  no('no'),
  maybeYes('maybe_yes'),
  maybeNo('maybe_no'),
  dontKnow('dont_know');

  final String wireValue;
  const AnswerValue(this.wireValue);
}

/// Esito di una partita al momento della chiusura.
enum GameResult {
  userWon('user_won'),
  userLost('user_lost'),
  abandoned('abandoned');

  final String wireValue;
  const GameResult(this.wireValue);
}
