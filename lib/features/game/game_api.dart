import '../../core/api/mana_api.dart';
import 'game_types.dart';

/// Funzione di GET HTTP usata da [GameApi]: ritorna il body JSON
/// (gia' deserializzato in Map) o lancia [ManaApiException].
typedef GameApiGet = Future<Map<String, dynamic>> Function(String path);

/// Funzione di POST HTTP usata da [GameApi].
typedef GameApiPost =
    Future<Map<String, dynamic>> Function(
      String path,
      Map<String, dynamic> body,
    );

/// Client API specifico del gioco "indovina chi" di Mana.
///
/// Wrappa gli endpoint `/api/games/single/*` del backend Vercel.
/// Il trasporto HTTP e' iniettato come coppia di closure ([GameApiGet],
/// [GameApiPost]): tutta la logica trasversale (Bearer JWT, timeout,
/// error mapping in [ManaApiException]) vive nel chiamante. In
/// produzione le passiamo da [ManaApi.get] e [ManaApi.post] tramite
/// il factory [GameApi.from].
///
/// Questo design tiene il core (`core/api/`) ignaro del gioco: nessuna
/// dipendenza da `features/game/` in mana_api.dart. Quando il core
/// migrera' in un package separato (vedi pre-launch-checklist.md
/// "Architettura per piu' giochi"), GameApi restera' qui senza
/// modifiche.
///
/// I metodi possono lanciare [ManaApiException] in caso di errore del
/// backend o di rete.
class GameApi {
  final GameApiGet _get;
  final GameApiPost _post;

  GameApi({required GameApiGet get, required GameApiPost post})
    : _get = get,
      _post = post;

  /// Factory di comodita': costruisce un [GameApi] usando i metodi
  /// pubblici [ManaApi.get] e [ManaApi.post] del client core.
  factory GameApi.from(ManaApi api) => GameApi(get: api.get, post: api.post);

  // ---------------------------------------------------------------------------
  // Single player
  // ---------------------------------------------------------------------------

  /// Crea una nuova partita single player.
  ///
  /// POST /api/games/single/start
  ///
  /// Scala 1 gemma all'utente; in caso di errore tecnico successivo al
  /// debit (es. AI non disponibile), il backend tenta automaticamente
  /// un refund.
  ///
  /// Response:
  /// ```
  /// {
  ///   'game': { ...riga single_games... },
  ///   'firstManaMove': { id, move_number, content }  // solo per manaGuesses
  /// }
  /// ```
  ///
  /// Parametri:
  /// - [mode]: chi indovina chi
  /// - [domains]: lista di domini (es. ['personaggi-storici', 'sport']);
  ///   almeno 1, massimo 20
  /// - [difficulty]: easy / medium / hard
  /// - [cultures]: lista di codici cultura (es. ['it', 'global']); almeno 1,
  ///   massimo 10
  /// - [maxQuestions]: numero massimo di domande nella partita (5-50,
  ///   default lato server)
  Future<Map<String, dynamic>> startSingleGame({
    required SingleGameMode mode,
    required List<String> domains,
    required Difficulty difficulty,
    required List<String> cultures,
    int? maxQuestions,
  }) {
    if (domains.isEmpty || domains.length > 20) {
      throw ArgumentError('domains: richiesti tra 1 e 20 elementi');
    }
    if (cultures.isEmpty || cultures.length > 10) {
      throw ArgumentError('cultures: richiesti tra 1 e 10 elementi');
    }
    if (maxQuestions != null && (maxQuestions < 5 || maxQuestions > 50)) {
      throw ArgumentError('maxQuestions: tra 5 e 50');
    }

    final body = <String, dynamic>{
      'mode': mode.wireValue,
      'domains': domains,
      'difficulty': difficulty.wireValue,
      'culture': cultures,
      // ignore: use_null_aware_elements
      if (maxQuestions != null) 'maxQuestions': maxQuestions,
    };
    return _post('/api/games/single/start', body);
  }

  /// Recupera lo stato di una partita (game + lista mosse).
  ///
  /// GET /api/games/single/[id]
  ///
  /// Utile per riprendere una partita interrotta, o per validare lato
  /// client che il backend abbia effettivamente accettato l'ultima mossa.
  ///
  /// Response:
  /// ```
  /// {
  ///   'game': { ...riga single_games... },
  ///   'moves': [{ id, move_number, ... }, ...]
  /// }
  /// ```
  ///
  /// Errori comuni: 404 partita inesistente, 403 partita non dell'utente.
  Future<Map<String, dynamic>> getSingleGameState(String gameId) {
    if (gameId.isEmpty) throw ArgumentError('gameId non puo essere vuoto');
    return _get('/api/games/single/$gameId');
  }

  /// Esegue una mossa nella partita.
  ///
  /// POST /api/games/single/move
  ///
  /// In modalita' manaGuesses passare [answerValue] (l'utente risponde
  /// alla domanda di Mana). In modalita' userGuesses passare [userMessage]
  /// (l'utente fa una domanda libera).
  ///
  /// Response:
  /// ```
  /// {
  ///   'userMove': { id, move_number },
  ///   'manaMove': { id, move_number, content },
  ///   'questionsUsed': number
  /// }
  /// ```
  Future<Map<String, dynamic>> sendMove({
    required String gameId,
    AnswerValue? answerValue,
    String? userMessage,
  }) {
    if (gameId.isEmpty) throw ArgumentError('gameId non puo essere vuoto');
    if (answerValue == null && userMessage == null) {
      throw ArgumentError(
        'fornisci almeno uno tra answerValue (manaGuesses) o userMessage (userGuesses)',
      );
    }
    if (userMessage != null &&
        (userMessage.isEmpty || userMessage.length > 500)) {
      throw ArgumentError('userMessage: lunghezza tra 1 e 500');
    }

    final body = <String, dynamic>{
      'gameId': gameId,
      // ignore: use_null_aware_elements
      if (answerValue != null) 'answerValue': answerValue.wireValue,
      // ignore: use_null_aware_elements
      if (userMessage != null) 'userMessage': userMessage,
    };
    return _post('/api/games/single/move', body);
  }

  /// Chiude esplicitamente una partita.
  ///
  /// POST /api/games/single/end
  ///
  /// Usato quando l'utente abbandona ('abandoned'), o quando il backend
  /// non l'ha gia' chiusa automaticamente (es. partita interrotta da
  /// errore tecnico recuperabile). In molti casi il backend chiude da
  /// solo la partita all'interno di [sendMove] (es. quando l'utente
  /// indovina o esaurisce le domande); chiamare end in quei casi
  /// torna un 400 BAD_REQUEST.
  ///
  /// Response: `{ 'game': { ...stato finale completo... } }`
  Future<Map<String, dynamic>> endSingleGame({
    required String gameId,
    required GameResult result,
  }) {
    if (gameId.isEmpty) throw ArgumentError('gameId non puo essere vuoto');
    final body = <String, dynamic>{
      'gameId': gameId,
      'result': result.wireValue,
    };
    return _post('/api/games/single/end', body);
  }
}
