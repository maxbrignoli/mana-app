import 'package:flutter_test/flutter_test.dart';
import 'package:mana_app/features/game/game_api.dart';
import 'package:mana_app/features/game/game_types.dart';

/// Test sulle pre-condizioni di [GameApi]: garantiscono che chiamate
/// con argomenti palesemente invalidi vengano bloccate sul client invece
/// di consumare una request HTTP che il server rifiuterebbe comunque.
///
/// NON testiamo qui le chiamate HTTP reali contro un backend live:
/// quelle verranno aggiunte come integration test piu' avanti. Qui
/// usiamo un trasporto fake che fallisce subito se chiamato, cosi' un
/// test che inavvertitamente arrivasse alla rete fallirebbe in modo
/// rumoroso.
void main() {
  late GameApi gameApi;

  setUp(() {
    gameApi = GameApi(
      get: (_) async {
        fail('La validazione client doveva fallire prima della chiamata GET');
      },
      post: (_, _) async {
        fail('La validazione client doveva fallire prima della chiamata POST');
      },
    );
  });

  group('startSingleGame validations', () {
    test('rifiuta domains vuoti', () {
      expect(
        () => gameApi.startSingleGame(
          mode: SingleGameMode.userGuesses,
          domains: const [],
          difficulty: Difficulty.medium,
          cultures: const ['it'],
        ),
        throwsArgumentError,
      );
    });

    test('rifiuta cultures vuote', () {
      expect(
        () => gameApi.startSingleGame(
          mode: SingleGameMode.userGuesses,
          domains: const ['personaggi-storici'],
          difficulty: Difficulty.medium,
          cultures: const [],
        ),
        throwsArgumentError,
      );
    });

    test('rifiuta maxQuestions troppo basso', () {
      expect(
        () => gameApi.startSingleGame(
          mode: SingleGameMode.userGuesses,
          domains: const ['personaggi-storici'],
          difficulty: Difficulty.medium,
          cultures: const ['it'],
          maxQuestions: 3,
        ),
        throwsArgumentError,
      );
    });

    test('rifiuta maxQuestions troppo alto', () {
      expect(
        () => gameApi.startSingleGame(
          mode: SingleGameMode.userGuesses,
          domains: const ['personaggi-storici'],
          difficulty: Difficulty.medium,
          cultures: const ['it'],
          maxQuestions: 100,
        ),
        throwsArgumentError,
      );
    });
  });

  group('sendMove validations', () {
    test('rifiuta gameId vuoto', () {
      expect(
        () => gameApi.sendMove(gameId: '', answerValue: AnswerValue.yes),
        throwsArgumentError,
      );
    });

    test('rifiuta chiamata senza answerValue ne userMessage', () {
      expect(() => gameApi.sendMove(gameId: 'abc'), throwsArgumentError);
    });

    test('rifiuta userMessage vuoto', () {
      expect(
        () => gameApi.sendMove(gameId: 'abc', userMessage: ''),
        throwsArgumentError,
      );
    });

    test('rifiuta userMessage troppo lungo (>500)', () {
      expect(
        () => gameApi.sendMove(gameId: 'abc', userMessage: 'x' * 501),
        throwsArgumentError,
      );
    });
  });

  group('endSingleGame validations', () {
    test('rifiuta gameId vuoto', () {
      expect(
        () => gameApi.endSingleGame(gameId: '', result: GameResult.abandoned),
        throwsArgumentError,
      );
    });
  });

  group('getSingleGameState validations', () {
    test('rifiuta gameId vuoto', () {
      expect(() => gameApi.getSingleGameState(''), throwsArgumentError);
    });
  });

  group('enum wire values', () {
    test('SingleGameMode usa snake_case', () {
      expect(SingleGameMode.manaGuesses.wireValue, 'mana_guesses');
      expect(SingleGameMode.userGuesses.wireValue, 'user_guesses');
    });

    test('AnswerValue usa snake_case', () {
      expect(AnswerValue.yes.wireValue, 'yes');
      expect(AnswerValue.maybeYes.wireValue, 'maybe_yes');
      expect(AnswerValue.dontKnow.wireValue, 'dont_know');
    });

    test('GameResult usa snake_case', () {
      expect(GameResult.userWon.wireValue, 'user_won');
      expect(GameResult.userLost.wireValue, 'user_lost');
      expect(GameResult.abandoned.wireValue, 'abandoned');
    });
  });
}
