# Mana self-play bench

Harness per far giocare due istanze del modello AI una contro l'altra, in modo da:

- misurare la qualità di Mana (percentuale vittorie, numero medio di domande, costo medio per partita)
- identificare pattern di fallimento sistematici nei prompt
- alimentare un tuning iterativo dei prompt
- costruire un golden dataset per regressioni future

Il bench NON tocca Supabase, NON usa rate limiter, NON cifra niente. È un'utility offline che chiama direttamente il provider AI (OpenAI per default) e produce trace JSON in chiaro.

## Architettura

Due agenti, entrambi alimentati dallo stesso modello AI ma con prompt diversi:

- **ManaAgent** — usa esattamente gli stessi system prompt del backend reale (`api/_lib/ai/prompts/single-game.ts`). Garantisce coerenza tra quello che testiamo qui e quello che gira in produzione.
- **UserBot** — un giocatore simulato. Due varianti di prompt (definite in `bench/src/prompts/user-bot.ts`):
  - in modalità `mana_guesses` (Mana indovina, il bot ha il personaggio in mente): risponde con una delle 6 forme canoniche (Sì/No/Forse sì/Forse no/Non lo so/conferma-o-nega-guess).
  - in modalità `user_guesses` (l'utente indovina, Mana ha il personaggio): pone domande sì/no e tenta un guess quando si sente sicuro.

Il runner (`runner.ts`) coordina i turni e produce un `GameTrace` serializzabile.

## Stato attuale (PR #1 della Fase 5)

✅ Tipi del trace
✅ Prompt del bot utente
✅ Agenti (`ManaAgent`, `UserBot`)
✅ Runner di una singola partita (entrambe le modalità)
✅ CLI per smoke test

⏳ **In arrivo**: dataset di scenari, runner massivo, reporting aggregato, analisi sul parser, tuning iterativo dei prompt.

## Esempi d'uso

Richiede `OPENAI_API_KEY` nel file `.env` alla root del repo.

```bash
# modalità mana_guesses: Mana deve indovinare Pikachu
npm run bench -- \
  --mode mana_guesses \
  --target "Pikachu" \
  --domains cartoni \
  --difficulty easy \
  --age 8 \
  --max 20

# modalità user_guesses: il bot deve indovinare un personaggio scelto da Mana
npm run bench -- \
  --mode user_guesses \
  --domains personaggi-storici \
  --difficulty medium \
  --age 10 \
  --max 20

# output in JSON puro (utile per pipe verso altri tool)
npm run bench -- --mode user_guesses --domains musica --difficulty hard --max 20 --json
```

## Cosa NON fa il bench

- **Non migliora i prompt da solo**: il tuning resta un'attività umana. Il bench produce evidenza, noi decidiamo cosa cambiare.
- **Non usa il backend HTTP**: chiama direttamente le funzioni dei moduli `api/_lib/ai/`. Più veloce e isolato, ma non testa il backend end-to-end (rate limit, encryption, refund, safety).
- **Non confronta modelli**: per ora gira con il provider/modello configurato in env (`AI_PROVIDER`, `AI_MODEL`). Confronti tra provider verranno fatti più avanti.
