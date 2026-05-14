# Mana — Operations & Monitoring

Questo documento descrive come operare e monitorare il backend Mana in produzione. È pensato per essere un punto di partenza utile per gestire l'app quotidianamente e fronteggiare le situazioni più comuni: bug in produzione, picchi di traffico, errori del modello AI, richieste di assistenza utenti.

## Architettura in produzione

Mana gira interamente su servizi managed:

- **Vercel** — hosting delle Vercel Functions in `api/`, edge network, log automatico delle invocazioni
- **Supabase** — database PostgreSQL + autenticazione + storage
- **Upstash Redis** — rate limiting (sliding window) con HTTP API
- **OpenAI** (o Anthropic) — modello AI di gioco + moderation + classifier safety
- **Sentry** (opzionale) — error tracking centralizzato

I segreti vivono nelle env vars di Vercel. Mai nel codice, mai in chat, mai in repo.

## Logging

I log strutturati prodotti dal modulo `api/_lib/logging/logger.ts` sono JSON, automaticamente catturati da Vercel. Ogni log ha:

- `timestamp` ISO 8601
- `level`: debug, info, warn, error
- `message`: testo descrittivo
- `context`: oggetto con campi specifici (gameId, userId, provider, cost, ecc.)

### Come accedere ai log Vercel

1. Dashboard Vercel → progetto → tab **Logs**
2. Filtri utili:
   - `level=error` per gli errori
   - `route=/api/games/single/move` per uno specifico endpoint
   - Range temporale (default ultime 24h)
3. Per query complesse: l'output JSON è cercabile per substring; usare la barra di ricerca.

### Pattern di log significativi

Alcuni messaggi chiave da cercare:

- `single game started` — partita creata, contesto con cost AI stimato
- `single game move rejected by safety` — input bloccato dalla pipeline, contesto con verdict e classifierCategory
- `unhandled error` — eccezione non gestita, da indagare in Sentry
- `failed to add rage event` — la RPC ha fallito durante una penalità (raro ma possibile)

## Error tracking con Sentry

### Setup

1. Account su https://sentry.io (free tier 5k errori/mese)
2. Creare un progetto Node.js
3. Copiare il DSN
4. Vercel → progetto → Settings → Environment Variables → aggiungere `SENTRY_DSN`
5. Redeploy

Quando `SENTRY_DSN` non è settato, il backend funziona normalmente ma Sentry è in no-op mode. Niente errori, niente comportamento alterato — solo niente tracking.

### Cosa va a Sentry

- Eccezioni non gestite (`Error` non-`HttpError`)
- HttpError 5xx (anche se gestite, indicano problemi server-side)

Non vanno a Sentry: HttpError 4xx (auth, validation, rate limit, ecc.). Sono "errori previsti" e farebbero rumore.

## Metriche del sistema

Endpoint admin per statistiche aggregate:

```
GET /api/admin/metrics
Authorization: Bearer <jwt-admin>
```

Restituisce:
- utenti totali, attivi negli ultimi 7 giorni, cancellati
- partite single in corso, completate oggi, multiplayer in corso
- gemme circolanti, totale spese/acquistate/penalità a vita
- rage events ultime 24h, profili a rage 4/4

Per usarlo serve un utente con flag `is_admin=TRUE` in `profiles`. Si setta manualmente via SQL dopo aver fatto il signup del proprio account:

```sql
UPDATE public.profiles SET is_admin = TRUE WHERE email = 'tuo@email.com';
```

## Dashboard di terzi

Le dashboard delle piattaforme che usiamo forniscono molte metriche utili in modo gratuito:

- **Vercel**: invocazioni, errori, latenza p50/p95/p99, banda. https://vercel.com/dashboard
- **Supabase**: query lente, connessioni, uso DB. https://supabase.com/dashboard → progetto → Reports
- **Upstash**: comandi/giorno (utile per non sforare il free tier). https://console.upstash.com
- **OpenAI**: consumo token, costo cumulativo, breakdown per modello. https://platform.openai.com/usage
- **Sentry** (se configurato): errori in tempo reale, raggruppamenti, trend.

## Operazioni comuni

### Promuovere un utente a admin

```sql
UPDATE public.profiles SET is_admin = TRUE WHERE email = '...';
```

### Soft-delete forzato di un utente (per richiesta GDPR)

```sql
UPDATE public.profiles
SET deleted_at = now(),
    display_name = 'Utente cancellato',
    email = NULL,
    avatar_id = 'avatar_default'
WHERE id = '...';
```

Le partite e gli acquisti restano (obblighi legali).

### Aggiungere gemme manualmente (per problemi tecnici / refund)

```sql
UPDATE public.gems_balance
SET balance = balance + 10
WHERE user_id = '...';
```

Loggare l'operazione nell'audit_log a mano:

```sql
INSERT INTO public.audit_log (actor_type, event_type, target_user_id, details)
VALUES ('admin', 'gems_granted_manually', '...', '{"amount": 10, "reason": "refund"}');
```

### Reset rage_level (caso clemenza)

```sql
UPDATE public.profiles SET rage_level = 0 WHERE id = '...';
```

### Verifica un singolo utente

```sql
SELECT p.email, p.rage_level, p.deleted_at, g.balance
FROM public.profiles p
LEFT JOIN public.gems_balance g ON g.user_id = p.id
WHERE p.email = '...';
```

## Troubleshooting

### Tutti gli endpoint danno 500

Sintomo: dashboard Vercel mostra errori 500 a tappeto su tutti gli endpoint.

Probabili cause:
1. **Env vars mancanti**: la validazione Zod fallisce e tutti gli endpoint crashano subito. Verificare nella Vercel UI che tutte le variabili obbligatorie siano presenti.
2. **Supabase down**: controllare https://status.supabase.com
3. **OpenAI down**: controllare https://status.openai.com

`GET /api/health` aiuta a diagnosticare: indica quale check sta fallendo.

### Un utente non riesce a giocare ma altri sì

Sintomo: un solo utente segnala errori.

Possibili cause:
1. **Rate limit attivo**: controllare in Upstash dashboard se l'utente ha rate limit hits recenti
2. **Gemme a zero**: query `gems_balance` per quell'utente
3. **Rage level 4 e gemme negative**: bilanciare manualmente

### Pipeline safety blocca tutto

Sintomo: tutti gli input vengono rifiutati come offensivi.

Probabili cause:
1. Classificatore in errore o quota OpenAI esaurita → controllare logs per `pipeline_error`
2. Bug nel classifier prompt — verifica con prompt diretto a `gpt-5.4-nano` sulla dashboard OpenAI

Il fallback è `'allow'`: se la pipeline va in errore, il gioco prosegue. Se invece tutto viene classificato come offensive, è il classifier stesso che ha un problema, non la safety in sé.

### Costi OpenAI crescono troppo

Verifica:
1. Dashboard OpenAI → Usage → breakdown per modello
2. Se `gpt-5.4-mini` (model di gioco) è troppo alto: tuning del system prompt (Fase 5) o limite più stretto sui token output
3. Se `gpt-5.4-nano` (classifier) è troppo alto: stiamo classificando tanto → probabile bot abuse → controllare rate limiter

### Database lento

Supabase dashboard → Reports → Query Performance. Identifica le query più lente. Possibili azioni:

1. Aggiungere indici (creare una nuova migration)
2. Ottimizzare il join applicativo
3. Aumentare il tier Supabase se servono più risorse

## Piano di disaster recovery

Lo stato attuale è "best effort":

- Backup automatici giornalieri Supabase, retention limitata sul free tier
- Repository Git con tutta la storia su GitHub
- Env vars duplicate (locale + Vercel) — manualmente

In caso di disastro totale (perdita Supabase project):
1. Provisioning nuovo progetto Supabase
2. Applicare tutte le migration in ordine: `supabase db push`
3. Restore manuale dell'ultimo backup giornaliero scaricato dalla dashboard
4. Aggiornare le env vars Vercel con i nuovi URL/key
5. Redeploy

Su un'app con utenti veri questo va testato periodicamente. Per ora MVP, abbiamo accettato l'esposizione.

---

*Documento di lavoro. Si aggiorna man mano che emergono pattern operativi reali.*
