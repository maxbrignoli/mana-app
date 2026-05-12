# Mana — L'Oracolo

App Flutter cross-platform (iOS, Android, Web) per il gioco "indovina chi" basato su AI.

> Versione produttiva. Per il prototipo HTML originale: [maxbrignoli/mana](https://github.com/maxbrignoli/mana).

## Requisiti

- Flutter 3.41.9+ (Dart 3.11+)
- Per iOS: Xcode + CocoaPods
- Per Android: Android SDK 36, JDK 17+

## Come si lavora qui

```bash
# Clone
git clone https://github.com/maxbrignoli/mana-app.git
cd mana-app

# Dipendenze
flutter pub get

# Esegui (web)
flutter run -d chrome

# Esegui (iOS sim)
flutter run -d "iPhone 16"

# Lint + test (gli stessi della CI)
flutter analyze --fatal-infos
flutter test
```

## Workflow di sviluppo

- Branch separato per ogni modifica
- Pull Request sempre, mai commit diretti su `main`
- CI deve essere verde prima del merge
- Auto-merge abilitato quando i check passano

## Struttura

In evoluzione. Il bootstrap iniziale è la struttura standard generata da `flutter create`.

## Licenza

MIT
