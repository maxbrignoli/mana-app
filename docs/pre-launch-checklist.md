# Checklist pre-launch

Lista di cose da sistemare PRIMA del lancio pubblico dell'app sugli store. Si aggiorna man mano che emergono.

## Infrastruttura email

- [ ] Acquistare dominio (es. `mana-game.com` o simile)
- [ ] Configurare DNS del dominio
- [ ] Aprire account su un provider email transazionale (raccomandato: Resend)
- [ ] Configurare SPF + DKIM + DMARC sul dominio per il provider scelto
- [ ] Configurare SMTP custom su Supabase (Authentication → Settings → SMTP)
- [ ] Sostituire i template email di default (Confirm signup, Reset password, Magic link) con versioni branded in italiano, mittente `noreply@<dominio>`
- [ ] Verificare deliverability con mail-tester.com o simili
- [ ] Configurare deep link (Universal Links iOS + Android App Links) per il callback di Supabase: quando l'utente clicca il link di conferma o reset nella mail, deve riaprire l'app invece di una pagina web

## Token e credenziali

- [ ] Ruotare GitHub PAT (`ghp_agFO...`)
- [ ] Ruotare Vercel PAT (`vcp_0og7...`)
- [ ] Ruotare Anthropic API key (`sk-ant-api03-uOI_aZdDjFab9_M1toV5lFsI...`)
- [ ] Ruotare OpenAI API key usata in chat sessione del 15/05/2026
- [ ] Audit di tutti i segreti che potrebbero essere transitati in chat / repo
- [ ] Configurare env vars di produzione su Vercel con i nuovi valori (e nessun altro)

## Legale (Fase 6 — PR rimandato)

- [ ] Redigere Privacy Policy (in italiano, conforme GDPR)
- [ ] Redigere Terms of Service
- [ ] Schermata di accettazione PP + ToS al primo avvio (anche per utenti anonimi)
- [ ] Gestione consenso minori (parental consent dove richiesto)
- [ ] Opt-in notifiche

## Compliance store

- [ ] Privacy nutrition label App Store (cosa raccogliamo, perché)
- [ ] Data Safety form Google Play
- [ ] Età minima dichiarata (PEGI / ESRB rating)
- [ ] Pagine "Supporto" e "Privacy Policy" pubbliche su URL stabile

## Supabase

- [ ] Verificare che il piano free regga il traffico atteso o passare al Pro
- [ ] Backup periodici verificati (test restore almeno una volta)
- [ ] Rate limit auth (es. signup per IP) configurati

## Sicurezza

- [ ] Sentry attivato in production (DSN configurato, error tracking testato)
- [ ] Verifica che nessuna chiave privata sia mai esposta nel client Flutter
- [ ] Test penetration base (Burp Suite / OWASP ZAP) sugli endpoint backend
- [ ] CAPTCHA / hCaptcha sui signup se emerge abuso

## App stores

- [ ] Account Apple Developer ($99/anno) attivo
- [ ] Account Google Play Developer ($25 una tantum) attivo
- [ ] Bundle identifier finalizzato (es. `com.maxbrignoli.mana`)
- [ ] App icon, screenshot, descrizione store finalizzati
- [ ] Modalità ospite + recovery account documentati per i revisori store

## Auth social

- [ ] Configurare Google Sign-In: OAuth client ID su Google Cloud Console (uno per Android, uno per iOS), abilitare provider Google su dashboard Supabase con client ID/secret
- [ ] Configurare Sign in with Apple: Services ID + Key su Apple Developer Portal (richiede account a $99/anno), abilitare provider Apple su dashboard Supabase
- [ ] Implementare schermata di login con bottoni "Accedi con Google" / "Accedi con Apple" lato Flutter (`auth.signInWithOAuth(OAuthProvider.google|apple)`)
- [ ] Sign in with Apple è obbligatorio per pubblicare su App Store se ci sono altri provider social — non saltare

## Cleanup tecnici

- [ ] Implementare cleanup periodico utenti anonimi inattivi (es. >90 giorni senza login)
- [ ] Logging strutturato verificato in produzione
- [ ] Health check pubblico documentato

## Operations

- [ ] Account admin (`profiles.is_admin = true`) creato per ogni persona del team
- [ ] On-call / monitoring: chi controlla i log Sentry?
- [ ] Procedura supporto utenti definita (canale, SLA)
- [ ] Documento `docs/operations.md` aggiornato con eventuali nuove procedure
