# Mana — Schema del Database

*Draft v1 · 13 maggio 2026*

## Premessa

Questo documento descrive lo schema dati di Mana così come è stato discusso e deciso fino a questo punto. Lo schema è completo: comprende tutte le funzionalità del prodotto, anche quelle che non saranno nell'MVP iniziale (multiplayer, leaderboard, sfide del giorno), perché definire ora la struttura completa evita refactoring dolorosi quando aggiungeremo le feature successive.

Il database è PostgreSQL ospitato su Supabase. Si fa affidamento sulle estensioni standard di Supabase: `auth.users` per l'autenticazione (gestita da Supabase Auth), `pgcrypto` per la cifratura a riposo di campi sensibili, `uuid-ossp` per la generazione di UUID.

Tutte le tabelle hanno **Row-Level Security (RLS)** attiva. Le policy specifiche sono indicate per ciascuna tabella.

## Principi di design

Lo schema è guidato da alcuni principi che richiamo qui per riferimento:

**Soft delete con anonimizzazione**: i profili utente non vengono mai cancellati fisicamente. Quando un utente chiede cancellazione, i dati personali vengono anonimizzati ma il record resta. Questo serve sia per l'integrità referenziale (le sue partite passate continuano a far senso) sia per gli obblighi legali.

**Conservazione integrale delle partite**: tutte le partite, single player e multiplayer, sono conservate per sempre, con i testi integrali delle domande e risposte. Necessario per obblighi legali (eventuali richieste delle autorità su contenuti illeciti) e per calcoli statistici (achievement, ELO, leaderboard).

**Cifratura dei contenuti sensibili**: i campi che contengono testo libero scritto dall'utente (domande in modalità 2, risposte libere) sono cifrati a riposo tramite `pgcrypto`. La chiave di cifratura vive in un secret manager esterno, non nel database.

**ID privato a 9 cifre**: ogni utente ha, oltre al UUID interno, un ID numerico di 9 cifre generato casualmente, garantito unico, e mai riutilizzato anche dopo cancellazione. È l'ID condivisibile tra amici.

**i18n nel client**: il database memorizza chiavi di traduzione (es. `ach_first_win`), non testi tradotti. Le traduzioni vivono nei bundle del client Flutter. Eccezione: i contenuti generati dagli utenti (nomi di personaggi scelti, ecc.) restano come testo libero.

**Audit log esteso**: ogni operazione critica viene loggata in una tabella append-only dedicata, con timestamp e contesto.

---

## Le tabelle

### 1. `profiles`

**Scopo**: contiene i dati anagrafici e di gioco di ogni utente. Estende `auth.users` di Supabase con tutto quello che serve all'applicazione.

**Colonne principali**:

- `id` — UUID, FK a `auth.users.id`, primary key
- `private_id` — `bigint` di 9 cifre (100000000 - 999999999), unique, NOT NULL, mai modificabile
- `display_name` — `text`, nome visibile dell'utente nel proprio profilo (non visibile ad altri)
- `email` — `text`, sincronizzato con `auth.users.email`
- `age` — `smallint`, l'età dichiarata in registrazione
- `country_code` — `text`, ISO 3166-1 alpha-2 (es. "IT"), rilevato da IP al primo avvio
- `cultures` — `text[]`, lista di culture conosciute dall'utente (es. `["it","us"]`)
- `preferred_language` — `text`, codice lingua (es. "it", "en")
- `preferred_difficulty` — `text`, enum: `"easy" | "medium" | "hard"`, default da età
- `avatar_id` — `text`, riferimento a un avatar preimpostato (es. `"avatar_owl_01"`)
- `rage_level` — `smallint`, 0-4, default 0
- `abandoned_games_count` — `int`, contatore griefing multiplayer, default 0
- `created_at` — `timestamptz`, default now()
- `deleted_at` — `timestamptz`, null se attivo, valorizzato in caso di soft delete

**Indici**: unique su `private_id`, indice su `country_code` (per matchmaking).

**RLS**: l'utente vede e modifica solo il proprio record (`auth.uid() = id`). Nessun altro utente vede mai questa tabella direttamente.

**Note**: il `private_id` è generato all'atto della registrazione con un retry loop in caso di collisione. Mai più riutilizzato dopo soft delete (vincolo applicativo, non DB).

### 2. `user_settings`

**Scopo**: preferenze e toggle dell'utente che non rientrano nei dati anagrafici di base.

**Colonne**:

- `user_id` — UUID, FK a `profiles.id`, primary key
- `active_domains` — `text[]`, lista dei domini attivi (es. `["disney","marvel","anime"]`), default tutti
- `notifications_friends` — `boolean`, default true
- `notifications_own_matches` — `boolean`, default true
- `notifications_daily_challenge` — `boolean`, default false
- `marketing_consent` — `boolean`, default false
- `updated_at` — `timestamptz`

**RLS**: l'utente vede e modifica solo il proprio record.

**Note**: tabella separata da `profiles` perché si aggiorna spesso (toggle quotidiani) mentre `profiles` ha dati più stabili.

### 3. `gems_balance`

**Scopo**: traccia le gemme correnti dell'utente e il timestamp dell'ultima rigenerazione automatica.

**Colonne**:

- `user_id` — UUID, FK a `profiles.id`, primary key
- `balance` — `int`, gemme correnti, default 10 (nuovo utente)
- `last_regen_at` — `timestamptz`, timestamp dell'ultima gemma rigenerata
- `lifetime_purchased` — `int`, contatore di gemme acquistate a vita
- `lifetime_spent` — `int`, contatore di gemme spese a vita
- `lifetime_penalty` — `int`, contatore di gemme perse per penalità

**RLS**: l'utente legge solo il proprio balance. Le modifiche sono server-side soltanto (mai dal client), tramite functions Supabase autenticate o backend Vercel con service_role.

**Note**: separare il balance dal profilo permette aggiornamenti frequenti senza toccare i dati anagrafici. La rigenerazione automatica viene calcolata ogni volta che il backend serve una richiesta: differenza tra `now()` e `last_regen_at`, divisa per il periodo di ricarica (2h), additiva al balance fino al max di 10.

### 4. `single_games`

**Scopo**: ogni partita single player giocata, conservata per sempre.

**Colonne**:

- `id` — UUID, primary key
- `user_id` — UUID, FK a `profiles.id`
- `mode` — `text`, enum: `"mana_guesses" | "user_guesses"`
- `target_character` — `text`, il personaggio in gioco (cifrato; null in modalità "mana_guesses" finché l'utente non lo rivela)
- `domain_selected` — `text[]`, domini attivi al momento della partita
- `difficulty` — `text`, difficoltà al momento della partita
- `culture` — `text[]`, culture attive al momento della partita
- `max_questions` — `smallint`, limite di domande per questa partita
- `questions_used` — `smallint`, contatore di domande consumate
- `hints_used` — `smallint`, contatore hint richiesti
- `result` — `text`, enum: `"user_won" | "user_lost" | "abandoned" | "in_progress"`
- `gems_spent` — `int`, gemme spese in questa partita (incluse penalità)
- `started_at` — `timestamptz`
- `ended_at` — `timestamptz`, null se in corso
- `ai_model_used` — `text`, riferimento al modello AI usato per questa partita (per analytics)
- `daily_challenge_id` — UUID, FK a `daily_challenges.id`, null se non partecipa a sfida del giorno

**Indici**: su `user_id`, `started_at` DESC, `daily_challenge_id`.

**RLS**: l'utente legge solo le proprie partite. Nessun cliente vede le partite di altri (eccetto eventualmente leaderboard aggregate, che vengono lette da view dedicate).

### 5. `single_game_moves`

**Scopo**: ogni domanda/risposta di una partita single player. Cifrato per la parte di testo libero.

**Colonne**:

- `id` — UUID, primary key
- `game_id` — UUID, FK a `single_games.id`
- `move_number` — `smallint`, sequenza nella partita (1, 2, 3, ...)
- `actor` — `text`, enum: `"user" | "mana"`
- `question_text` — `text`, **cifrato**, contenuto della domanda
- `answer_value` — `text`, enum: `"yes" | "no" | "maybe_yes" | "maybe_no" | "dont_know" | "guess"`
- `guess_character` — `text`, **cifrato**, riempito se è un tentativo di guess
- `was_correct` — `boolean`, true se è il guess vincente
- `flagged_as_offensive` — `boolean`, default false (per analisi successive)
- `created_at` — `timestamptz`

**Indici**: su `game_id`, `move_number`.

**RLS**: l'utente legge solo le mosse delle proprie partite. Anche il `service_role` ha accesso, ovviamente, per il backend.

### 6. `multiplayer_games`

**Scopo**: partite a due, asincrone, con timer 30s/mossa.

**Colonne**:

- `id` — UUID, primary key
- `mode` — `text`, enum: `"duel" | "race"`
- `player1_id` — UUID, FK a `profiles.id`, chi ha creato la sfida
- `player2_id` — UUID, FK a `profiles.id`, l'altro giocatore
- `target_character_p1` — `text`, **cifrato**, in Duello = personaggio scelto da player1 che p2 deve indovinare
- `target_character_p2` — `text`, **cifrato**, in Duello = personaggio scelto da player2 che p1 deve indovinare
- `target_character_shared` — `text`, **cifrato**, in Gara = unico personaggio scelto da Mana
- `state` — `text`, enum: `"waiting_p1" | "waiting_p2" | "in_progress" | "finished" | "abandoned_by_p1" | "abandoned_by_p2"`
- `current_turn` — `text`, enum: `"p1" | "p2"`, di chi è il turno
- `current_turn_expires_at` — `timestamptz`, scadenza del timer 30s
- `winner_id` — UUID, FK a `profiles.id`, null se non finita o pareggio
- `elo_change_p1` — `int`, variazione ELO assegnata a p1 (positiva o negativa)
- `elo_change_p2` — `int`, variazione ELO assegnata a p2
- `started_at` — `timestamptz`
- `ended_at` — `timestamptz`

**Indici**: su `player1_id`, `player2_id`, `state`, `current_turn_expires_at`.

**RLS**: entrambi i player vedono la partita (con la condizione `auth.uid() IN (player1_id, player2_id)`). Il campo `target_character` dell'altro player non è mai visibile lato client (si filtra a livello applicativo).

### 7. `multiplayer_moves`

**Scopo**: ogni mossa di una partita multiplayer.

**Colonne**:

- `id` — UUID, primary key
- `game_id` — UUID, FK a `multiplayer_games.id`
- `actor_id` — UUID, FK a `profiles.id`, chi ha fatto la mossa
- `move_number` — `smallint`
- `question_text` — `text`, **cifrato**
- `answer_value` — `text`, stessi valori di `single_game_moves`
- `guess_character` — `text`, **cifrato**
- `was_correct` — `boolean`
- `flagged_as_offensive` — `boolean`
- `created_at` — `timestamptz`

**RLS**: visibile solo ai due player della partita.

### 8. `friendships`

**Scopo**: amicizie confermate tra utenti.

**Colonne**:

- `user_a_id` — UUID, FK a `profiles.id`
- `user_b_id` — UUID, FK a `profiles.id`
- `created_at` — `timestamptz`
- PRIMARY KEY composito su (`user_a_id`, `user_b_id`)
- CHECK constraint: `user_a_id < user_b_id` (ordinamento canonico per evitare duplicati)

**Indici**: su `user_a_id`, `user_b_id` separatamente.

**RLS**: ogni utente vede solo le righe in cui appare (`auth.uid() IN (user_a_id, user_b_id)`).

**Note**: il vincolo di ordinamento garantisce che ogni coppia esista una volta sola (evita di avere sia A-B che B-A). Lato applicativo si ordina prima di inserire.

### 9. `friend_requests`

**Scopo**: richieste di amicizia in pending. Una richiesta viene rimossa (anche con eliminazione fisica) quando accettata o rifiutata.

**Colonne**:

- `id` — UUID, primary key
- `requester_id` — UUID, FK a `profiles.id`
- `target_id` — UUID, FK a `profiles.id`
- `created_at` — `timestamptz`
- UNIQUE su (`requester_id`, `target_id`)

**RLS**: chi ha mandato la richiesta e chi la riceve vedono il record.

### 10. `elo_ratings`

**Scopo**: punteggio ELO corrente di ogni utente (per leaderboard country e globale).

**Colonne**:

- `user_id` — UUID, FK a `profiles.id`, primary key
- `elo_country` — `int`, ELO calcolato sulle partite del proprio paese, default 1200
- `elo_global` — `int`, ELO globale, default 1200
- `last_updated_at` — `timestamptz`

**RLS**: lettura pubblica (necessario per leaderboard), scrittura solo server-side.

**Note**: l'ELO si aggiorna a fine di ogni partita multiplayer. Il valore iniziale di 1200 è lo standard scacchistico.

### 11. `elo_history`

**Scopo**: storico delle variazioni ELO per analytics e debugging.

**Colonne**:

- `id` — UUID, primary key
- `user_id` — UUID, FK a `profiles.id`
- `game_id` — UUID, FK a `multiplayer_games.id`
- `elo_country_before` — `int`
- `elo_country_after` — `int`
- `elo_global_before` — `int`
- `elo_global_after` — `int`
- `created_at` — `timestamptz`

**RLS**: lettura solo per l'utente proprietario (per le proprie analitiche). Scrittura solo server-side.

### 12. `user_achievements`

**Scopo**: per ogni utente, il livello sbloccato di ogni achievement.

**Colonne**:

- `user_id` — UUID, FK a `profiles.id`
- `achievement_key` — `text`, chiave i18n dell'achievement (es. `"ach_speed_guesser"`)
- `current_level` — `smallint`, 0-4 (0 = non sbloccato)
- `unlocked_at_level_1` — `timestamptz`, null se non ancora sbloccato
- `unlocked_at_level_2` — `timestamptz`
- `unlocked_at_level_3` — `timestamptz`
- `unlocked_at_level_4` — `timestamptz`
- PRIMARY KEY composito (`user_id`, `achievement_key`)

**RLS**: l'utente vede solo i propri achievement. Scrittura solo server-side.

**Note**: la **definizione** degli achievement (quali esistono, quali soglie hanno, quante gemme danno) vive nel codice del client e nel backend, non nel database. Solo i progressi degli utenti sono in tabella.

### 13. `rage_events`

**Scopo**: log delle offese commesse da ogni utente. Necessario per calcolare il decay del rage level (-1 ogni 14 giorni di buon comportamento).

**Colonne**:

- `id` — UUID, primary key
- `user_id` — UUID, FK a `profiles.id`
- `event_type` — `text`, enum: `"insult_no_question" | "insult_in_question" | "inappropriate_character_choice"`
- `rage_level_at_event` — `smallint`, livello al momento dell'evento (per ricostruzione storica)
- `gem_penalty` — `int`, gemme tolte come penalità (1, 2, 5 o 10)
- `context_game_id` — UUID, FK a `single_games.id` o `multiplayer_games.id` (polimorfica), null se l'evento è fuori partita
- `context_game_type` — `text`, enum: `"single" | "multi" | "outside_game"`
- `created_at` — `timestamptz`

**Indici**: su `user_id`, `created_at` DESC.

**RLS**: solo server-side. L'utente vede solo il proprio `rage_level` aggregato (nel `profiles`).

### 14. `abandoned_games_log`

**Scopo**: log dettagliato degli abbandoni di partite multiplayer (per griefing detection). Il contatore aggregato vive in `profiles.abandoned_games_count`, qui ci sono i dettagli.

**Colonne**:

- `id` — UUID, primary key
- `user_id` — UUID, FK a `profiles.id`, chi ha abbandonato
- `game_id` — UUID, FK a `multiplayer_games.id`
- `created_at` — `timestamptz`

**RLS**: solo server-side.

### 15. `daily_challenges`

**Scopo**: la sfida del giorno generata automaticamente da un job notturno.

**Colonne**:

- `id` — UUID, primary key
- `challenge_date` — `date`, unique
- `theme_key` — `text`, chiave i18n del tema (es. `"theme_disney_classic"`, `"theme_anime_80s"`)
- `forced_domain` — `text[]`, eventuali domini forzati per quel giorno
- `forced_difficulty` — `text`, eventuale difficoltà forzata
- `bonus_elo_for_winners` — `int`, bonus ELO per chi completa
- `created_at` — `timestamptz`

**RLS**: lettura pubblica (tutti vedono la sfida del giorno). Scrittura solo da job server.

### 16. `daily_challenge_results`

**Scopo**: per ogni utente, il risultato della sua partita di sfida del giorno.

**Colonne**:

- `challenge_id` — UUID, FK a `daily_challenges.id`
- `user_id` — UUID, FK a `profiles.id`
- `game_id` — UUID, FK a `single_games.id`
- `result` — `text`, enum: `"won" | "lost"`
- `questions_used` — `smallint`
- `completed_at` — `timestamptz`
- PRIMARY KEY composito (`challenge_id`, `user_id`)

**RLS**: l'utente vede i propri risultati. La mini-leaderboard giornaliera è esposta tramite una view aggregata che non rivela altri dati personali.

### 17. `gem_purchases`

**Scopo**: log di tutti gli acquisti di gemme. Necessario per refund e dispute.

**Colonne**:

- `id` — UUID, primary key
- `user_id` — UUID, FK a `profiles.id`
- `package_key` — `text`, riferimento al pacchetto (es. `"pkg_20_gems"`)
- `gems_purchased` — `int`, quante gemme date
- `price_cents` — `int`, prezzo pagato in centesimi
- `currency` — `text`, ISO 4217 (es. "EUR")
- `platform` — `text`, enum: `"ios" | "android" | "web"`
- `platform_transaction_id` — `text`, ID transazione dallo store (per verifica)
- `status` — `text`, enum: `"pending" | "completed" | "refunded" | "failed"`
- `created_at` — `timestamptz`
- `completed_at` — `timestamptz`
- `refunded_at` — `timestamptz`

**Indici**: su `user_id`, `created_at` DESC, `platform_transaction_id` (per lookup verifica).

**RLS**: l'utente vede solo i propri acquisti. Solo server-side scrive.

### 18. `audit_log`

**Scopo**: log append-only di operazioni critiche.

**Colonne**:

- `id` — UUID, primary key
- `timestamp` — `timestamptz`, default now()
- `actor_user_id` — UUID, FK a `profiles.id`, null se attore di sistema
- `actor_type` — `text`, enum: `"user" | "admin" | "system" | "external_request"`
- `event_type` — `text`, es. `"account_created"`, `"gems_purchased"`, `"account_banned"`, `"refund_issued"`, `"data_disclosed_to_authority"`, `"profile_anonymized"`
- `target_user_id` — UUID, FK a `profiles.id`, su chi ricade l'evento (può coincidere con actor)
- `details` — `jsonb`, payload variabile in base al tipo
- `ip_address` — `inet`, null se non disponibile

**Indici**: su `timestamp` DESC, `actor_user_id`, `target_user_id`, `event_type`.

**RLS**: nessun accesso dal client. Solo backend con service_role.

**Note**: append-only significa che le righe non vengono mai aggiornate o cancellate. La policy di RLS lato Supabase blocca esplicitamente UPDATE e DELETE anche per il service_role (configurazione di sicurezza extra).

---

## Note trasversali

### Cifratura

I campi marcati come **cifrato** (`question_text`, `guess_character`, `target_character*`) vengono cifrati a riposo tramite funzioni `pgp_sym_encrypt` di `pgcrypto`. La chiave di cifratura simmetrica vive nel backend (variabile d'ambiente, mai nel client). Il database memorizza ciphertext binario.

Decisione di design: una **singola chiave di cifratura** per tutta l'applicazione (non per-utente), per semplicità. La rotazione periodica della chiave può essere fatta con re-encryption batch se servirà.

### Indici

Oltre agli indici esplicitamente menzionati in ogni tabella, ne andranno aggiunti altri data-driven dopo aver osservato il comportamento reale delle query. PostgreSQL fornisce ottime tool per query plan analysis (`EXPLAIN`, `pg_stat_statements`) che useremo nei mesi successivi al lancio.

### Migrations

Ogni cambiamento futuro dello schema sarà gestito tramite file di migration versionati. Supabase fornisce un sistema integrato di migration via CLI (`supabase db push`). I file vivranno in una cartella `supabase/migrations/` del repo, ognuno timestampato.

### Backup e disaster recovery

Supabase fornisce automaticamente backup giornalieri sul piano gratuito (con retention limitata). Per il prodotto reale valuteremo se attivare backup con retention maggiore. Procedura di disaster recovery: nel caso peggiore, ripristinare l'ultimo backup giornaliero significa perdere al massimo 24h di dati. Per applicazioni come la nostra è un compromesso accettabile.

### Volume e scaling

Stima preliminare a regime: 10.000 utenti attivi, 5 partite/giorno medie, 20 mosse/partita = 1M record di `single_game_moves` al giorno. In un anno = 365M record. PostgreSQL gestisce volumi così senza problemi, ma serve attenzione agli indici e alla strategia di archiviazione dei dati molto vecchi (eventualmente partitioning per data).

---

## Capitolo SQL — Statement di creazione

Questa sezione conterrà gli statement `CREATE TABLE` completi quando lo schema sarà approvato e si passerà all'implementazione. Per ora il documento si ferma qui — l'obiettivo prima è validare il design.

---

*Documento di lavoro · soggetto a revisione*
