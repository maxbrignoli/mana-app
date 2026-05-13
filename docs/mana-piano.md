# Mana — Piano di Lavoro

*Versione 1 · 12 maggio 2026*

## Filosofia del piano

Il piano è organizzato in **fasi sequenziali**. Ogni fase parte solo quando la precedente è chiusa o quasi: questo riduce il rischio di rifare il lavoro perché le fondamenta si rivelano sbagliate. La precedenza è data alla **parte tecnologica e infrastrutturale**, in coerenza con la richiesta: senza fondamenta solide, ogni feature di gioco costruita sopra rischia di essere riscritta. Con fondamenta solide, ogni feature si aggiunge a tempi prevedibili.

Le risorse sono solo due: **l'autore del progetto** (Massimo) e **Claude** come assistente di progettazione e sviluppo. Questo impone un vincolo importante: non si può lavorare in parallelo su più fronti, e ogni fase deve produrre qualcosa di stabile prima di passare alla successiva.

Il piano è organizzato in tre **macro-blocchi**:

- **Blocco A — Fondamenta tecniche** (Fasi 1-4): tutta l'infrastruttura senza cui non si può costruire nulla di robusto. Si chiude prima di toccare il gioco vero e proprio.
- **Blocco B — MVP del gioco** (Fasi 5-8): il prodotto minimo pubblicabile sugli store. Single player completo, grafica di qualità con Mana animata in Rive, gemme e acquisti funzionanti, niente multiplayer. È il primo rilascio reale.
- **Blocco C — Espansione completa** (Fasi 9-12): tutto il resto. Multiplayer, leaderboard, achievement, sfide del giorno. Verranno rilasciate come aggiornamenti.

C'è poi un **Blocco D — Trasversale** che attraversa tutto il piano: marketing, aspetti legali, supporto utenti, monitoring. Sono attività che partono in punti diversi del progetto e proseguono in parallelo, non sono fasi a sé.

Il MVP è il punto critico del piano: rappresenta il momento in cui il progetto passa da "esperimento privato" a "prodotto pubblicato". Tutte le decisioni prima dell'MVP devono essere prese pensando a "cosa serve per arrivarci"; tutte le decisioni dopo l'MVP devono essere prese pensando a "cosa migliora il prodotto già pubblicato senza romperlo".

---

## Blocco A — Fondamenta tecniche

### Fase 1 — Setup del progetto e ambienti

L'obiettivo è creare lo scheletro tecnico su cui costruire tutto, con processi solidi per evitare di accumulare debito tecnico fin dall'inizio.

Si parte creando il progetto **Flutter** in un nuovo repository GitHub dedicato (separato dall'attuale `mana` che ospita il prototipo HTML). Si configurano tre ambienti separati: **dev** (per lavorare in locale), **staging** (per testare in condizioni simili alla produzione ma su un sotto-dominio diverso), **production** (quello pubblico finale). Vercel viene configurato per servire entrambi gli ambienti staging e production con deploy automatici dai relativi branch Git.

Si decide qui anche la struttura del repository: monorepo con frontend Flutter e backend Vercel functions nello stesso albero, oppure due repository separati. Si configura il sistema di **CI/CD**: ogni push deve far girare automaticamente i test, il linter e le build di entrambe le piattaforme. Si imposta un sistema di **versionamento semantico** per le release.

Si crea infine la struttura cartelle del codice (architettura a moduli: auth, game, profile, gems, ecc.) e si configura un **design system** di base con i colori, i font e le costanti tematiche già allineate all'estetica Art Nouveau definita nel documento di progetto.

**Deliverable della fase:** repository pronto, ambienti funzionanti, CI/CD attivo, build vuote che si deployano correttamente su tutti gli ambienti.

### Fase 2 — Database e schema dati

L'obiettivo è progettare e implementare lo schema dati completo del sistema, anche per funzionalità che non sono nell'MVP. Modificare uno schema dati in produzione è doloroso, meglio pensarci bene una volta sola.

Si crea il progetto **Supabase**, si configurano i tier appropriati per dev/staging/production. Si progetta lo schema delle tabelle principali: utenti, profili (con avatar, età, paese, cultura, difficoltà preferita, lingue, gemme correnti, timestamp dell'ultima ricarica gemme), domini, sessioni di gioco, mosse di gioco (domande/risposte), achievement sbloccati, livelli di achievement, amicizie, partite multiplayer, leaderboard ELO.

Si scrivono le **migration** versionate: ogni cambiamento dello schema diventa un file di migrazione che può essere applicato a tutti gli ambienti in ordine. Si configurano gli **indici** per le query più frequenti (lookup utente per ID, leaderboard per country e fascia ELO, partite in pending per utente, ecc.). Si definiscono le **row-level security policy** di Supabase: ogni utente può leggere/scrivere solo i propri dati.

Si crea uno script di **seed** per popolare staging e dev con dati realistici di test.

**Deliverable della fase:** database modellato, migration versionate, security policy attive, dati di seed disponibili in dev e staging.

### Fase 3 — Backend sicuro

L'obiettivo è trasformare l'attuale `/api/chat` (oggi aperto e basico) in un backend di produzione: sicuro, monitorato, e con tutta la logica di gioco lato server.

Si aggiunge **l'autenticazione JWT**: tutte le rotte protette richiedono un token valido emesso da Supabase Auth. Si configura il middleware che verifica il token a ogni richiesta e blocca quelle non autenticate.

Si implementa il **rate limiting** per utente e per IP, con soglie diverse per le rotte (es. `/api/chat` ha limiti più stringenti di `/api/profile`). I limiti vengono memorizzati in cache veloce (es. Vercel KV o Upstash Redis).

Si sposta la **game logic lato server**: lo stato di una partita non vive più nel browser ma nel database. Il client manda azioni ("ho risposto sì alla domanda corrente"), il server valida, aggiorna lo stato, e risponde. Questo è il punto critico per la sicurezza delle leaderboard: il client non può "dichiararsi vincitore", il server vede tutto. Si introduce il concetto di **ID di sessione** per ogni partita, e di mossa firmata che il server valida prima di processare.

Si imposta la **validazione del payload** ovunque: ogni endpoint controlla che la richiesta sia ben formata, di dimensioni ragionevoli, con i tipi giusti. Si bloccano i tentativi di sovrascrivere il system prompt, di scegliere un modello AI non consentito, di chiamare con payload anormalmente grandi.

Si configura il **monitoring** di base: log strutturati, metriche di richieste/secondo, errori 4xx/5xx, latenze, costi per endpoint. Strumenti possibili: Vercel Analytics integrato, Sentry per gli errori applicativi.

Si implementa la **pipeline di safety per gli input utente**, descritta in dettaglio nel documento di progetto. Comprende: classificazione di ogni input (domanda di gioco / altro neutro / altro offensivo), verifica della formulazione delle domande, sistema di penalità progressive in gemme per linguaggio offensivo, gestione del rage level con decay temporale, validazione del personaggio in multiplayer, contatore abbandoni. Tecnologicamente sfrutta la Moderation API di OpenAI (gratuita) come primo filtro, combinata con una chiamata LLM leggera per classificazione semantica. Tutto è server-side, non manipolabile dal client.

**Deliverable della fase:** backend con auth JWT, rate limit, game state lato server, safety pipeline attiva, monitoring attivo. Tutte le chiamate sono firmate e tracciate.

### Fase 4 — Integrazione AI

L'obiettivo è preparare l'integrazione con il provider AI in modo pulito e mantenibile, lasciando aperta la possibilità di cambiare provider in futuro (configurabile, non multi-provider).

Si definisce un'**astrazione interna** del concetto di "chiamata AI": una funzione `askMana(systemPrompt, conversationHistory, params)` che internamente chiama il provider configurato. Il provider attuale (OpenAI, Anthropic, ecc.) è una variabile d'ambiente, cambiarla in futuro non richiede modifiche al codice di gioco.

Si implementa il **caching del system prompt**: si verifica che funzioni correttamente per il provider scelto, si misura quanto effettivamente abbatte i costi.

Si costruisce un primo **system prompt base** che incorpora le regole del gioco. Il system prompt sarà arricchito con esempi few-shot durante la Fase 5 (test bench).

Si implementa la **gestione degli errori AI**: timeout, rate limit del provider, risposte malformate, contenuti rifiutati dal provider per policy. Per ogni caso si definisce un comportamento di fallback (es. ritentare con backoff, mostrare un messaggio comprensibile all'utente, loggare per analisi).

**Deliverable della fase:** astrazione AI completa, caching attivo e misurato, gestione errori robusta, primo system prompt funzionante in test.

---

## Blocco B — MVP del gioco

### Fase 5 — Test bench AI e tuning

L'obiettivo è scegliere il modello AI da usare e affinare il system prompt fino a una qualità accettabile. Questa fase è critica: il successo del gioco dipende qui.

Si costruisce un **test bench**: un piccolo strumento che fa girare partite automatiche, in cui un modello AI fa Mana e un altro modello (più potente, tipo Claude Opus) finge di essere un giocatore. Si gira la stessa batteria di partite (es. 50-100 partite con personaggi predefiniti) per ciascun candidato modello (GPT-5 nano, GPT-5 mini, DeepSeek V4 Flash, Gemini Flash, Claude Haiku) e si misurano metriche oggettive: percentuale di vittorie, numero medio di domande per vincere, qualità soggettiva delle domande (votata a mano su un campione).

Si fa **tuning iterativo del system prompt**: si aggiungono esempi few-shot, si raffinano le istruzioni sulla difficoltà, si testano i comportamenti su età e culture diverse. Ogni modifica viene validata sul test bench.

Si decide qui il **modello finale** e si congelano i prompt di base. Si documentano i risultati dei test per riferimento futuro.

Si valuta anche la **strategia di costo**: dato il modello scelto, qual è il costo atteso per partita? È sostenibile con il modello economico delle gemme?

**Deliverable della fase:** modello scelto, system prompt finalizzato, test bench riutilizzabile per future ottimizzazioni, documento di benchmark con costi e qualità misurati.

### Fase 6 — App Flutter: onboarding e profilo

L'obiettivo è costruire la prima parte dell'app vera e propria: tutto ciò che riguarda l'identità dell'utente.

Si implementano le schermate di **onboarding**: introduzione narrativa con Mana, richiesta dell'età, presentazione del concetto di gioco. La rilevazione del paese via IP avviene qui, ed è il default per il filtro culturale.

Si costruiscono **registrazione e login**: con email/password e con i provider social (Google, Apple). Integrazione completa con Supabase Auth. Schermata di recupero password.

Si crea il **profilo utente**: scelta dell'avatar, modifica del nickname (interno, non visibile agli altri), visualizzazione del proprio ID univoco, gestione delle impostazioni (lingua, notifiche, domini attivi, difficoltà, cultura, fascia d'età). Tutto sincronizzato con il database.

Si introducono i **flussi legali**: accettazione di privacy policy e termini di servizio, gestione del consenso ai dati per minori (con flusso di approvazione genitore se rilevante per età), opt-in alle notifiche.

**Deliverable della fase:** un utente può scaricare l'app, creare un account, configurare il suo profilo. Niente gioco ancora, ma tutta la parte di identità funziona end-to-end.

### Fase 7 — Grafica e personaggio Mana

L'obiettivo è dare al gioco la sua identità visiva e portare Mana al livello di qualità che si addice a un prodotto pubblicato. Questa è una fase a sé perché è laboriosa, ha competenze specifiche, e va affrontata in parallelo (e prima del completamento) della fase successiva di costruzione del gioco vero e proprio.

La grafica del gioco si articola su più livelli, ognuno con considerazioni proprie. Il primo è l'**identità visiva globale**: palette colori definitiva, font, stile delle icone, design dei domini, look delle classifiche, animazioni di transizione tra schermate. L'estetica Art Nouveau e ispirata ai tarocchi resta la direzione, ma va declinata in modo coerente su decine di componenti UI. Si costruisce qui un **design system** completo che farà da bibbia per tutto lo sviluppo successivo.

Il secondo livello è **Mana stessa**, che è il vero cuore della grafica. La scala di possibili realizzazioni di Mana va da una illustrazione SVG semplice (come quella attuale, il "Livello 0") fino a un avatar 3D real-time con lip-sync sintetizzato (il "Livello 4", obiettivo di lungo periodo). Per l'MVP la scelta è una via di mezzo ambiziosa ma fattibile: **Mana realizzata in Rive**, lo standard di animazione vettoriale 2D più potente per Flutter. Rive permette di costruire un personaggio interattivo che reagisce in tempo reale alle azioni del giocatore: cambio di espressione quando arriva una risposta, occhi che seguono il dito, animazioni di pensiero mentre Mana sta consultando l'oracolo, esultanza alla vittoria, sconforto alla sconfitta. Una libreria di stati e transizioni che dà l'illusione che Mana sia viva, senza ricorrere a video pre-renderizzati (che avrebbero il problema insormontabile del lip-sync con il testo dinamico) né a generazione video AI (oggi non fattibile in tempo reale).

La produzione di Mana in Rive richiede competenze specifiche. Le opzioni sono tre: imparare a usare Rive (curva di apprendimento media, qualche settimana per risultati professionali), commissionare l'animazione a un freelance Rive (qualche centinaio di euro su piattaforme tipo Fiverr o Upwork), oppure partire da un template Rive esistente e personalizzarlo. La scelta verrà fatta al momento. In tutti i casi, il design del personaggio (proporzioni, palette, stile degli abiti, capelli, palla di cristallo) va definito prima della produzione delle animazioni, perché un cambio successivo è costoso.

Il terzo livello è la **galleria di asset minori**: avatar degli utenti (set preimpostato di 30-50 icone in stile coerente con Mana), icone dei domini di personaggi, illustrazioni degli achievement, sfondi per le classifiche, animazioni di celebrazione per le vittorie. Anche qui si decide se commissionare, generare con AI generativa (Midjourney, Stable Diffusion) e poi rifinire, o disegnare a mano.

Il quarto livello, da considerare ma non incluso nell'MVP, è la **versione vocale di Mana**: una voce text-to-speech sintetizzata che pronuncia le domande mentre vengono mostrate, con lip-sync sui movimenti delle labbra animati in Rive. Tecnologicamente fattibile con strumenti come ElevenLabs (per la voce) e i sistemi di lip-sync automatico (per la sincronizzazione con il movimento delle labbra in Rive). Questa è la grande feature che potrebbe trasformare il gioco da "carino" a "incredibile" — ma comporta complessità aggiuntiva e costi per uso, motivo per cui resta fuori dall'MVP e viene considerata come obiettivo della v2.0 o successiva.

L'obiettivo a lungo termine, da considerare per future versioni maggiori del gioco, è il salto a un **avatar 3D real-time** con full lip-sync e gestures più ricche. Strumenti come Ready Player Me combinati con motori 3D incorporati in Flutter (Flame engine, oppure embed di Unity) lo rendono tecnicamente possibile, ma è un investimento che ha senso solo dopo aver validato il prodotto con un buon riscontro sul Livello Rive.

**Deliverable della fase:** design system completo, Mana realizzata in Rive con set completo di espressioni e animazioni, galleria avatar e icone, identità visiva pronta da integrare nell'app.

### Fase 8 — App Flutter: single player + gemme + acquisti

L'obiettivo è completare l'MVP. Si costruisce il gioco vero (single player) e tutto il sistema economico delle gemme che lo regge, integrando tutta la grafica prodotta nella fase precedente.

Si implementano le **due modalità single player** già definite nel documento: Mana indovina (l'utente pensa al personaggio), Utente indovina (Mana sceglie). Le schermate di gioco, l'integrazione di Mana animata in Rive con tutti i suoi stati, la gestione delle 5 risposte possibili, la richiesta di hint, la conclusione partita.

Si costruisce il **sistema gemme** completo: rigenerazione automatica ogni 2 ore fino a max 10 lato server (non lato client), consumo all'inizio di ogni partita, consumo aggiuntivo per gli hint. La logica vive lato server per essere sicura.

Si integrano gli **in-app purchases** con i pacchetti di gemme. Configurazione iniziale di RevenueCat o Apple StoreKit + Google Play Billing direttamente. Test in sandbox prima del rilascio. Configurazione fiscale e bancaria per ricevere i pagamenti.

Si fa il **beta test interno**: tu, Isabel, qualche amico fidato. Si raccolgono feedback, si correggono i bug critici.

Si prepara la **pubblicazione store**: account Apple Developer ($99/anno) e Google Play ($25 una tantum) attivati, materiali marketing pronti (screenshot, descrizioni in italiano e inglese, video promozionale breve), submission con tutta la documentazione richiesta dagli store (privacy policy, classificazione età, eventuali permessi richiesti).

Si supera la **review degli store** (è il momento più imprevedibile: può essere veloce o può richiedere iterazioni). Si rilascia l'MVP.

**Deliverable della fase:** MVP pubblico sugli store, single player funzionante con Mana animata in Rive, gemme e acquisti operativi, prima base utenti reale.

---

## Blocco C — Espansione completa

### Fase 9 — Achievement progressivi

L'obiettivo è aggiungere il sistema degli achievement, che è relativamente indipendente e dà valore immediato a chi ha già giocato (premia retroattivamente i traguardi raggiunti).

Si modella nel database la **struttura degli achievement** a scale: definizione dei livelli, soglie, gemme ricompensa. Si implementa la logica di **calcolo automatico**: a ogni partita conclusa, il backend verifica quali achievement si sono sbloccati o avanzati di livello. Nei casi previsti accredita le gemme.

Si costruiscono le **schermate di profilo dedicate**: vista degli achievement raggiunti, di quelli da raggiungere (con i livelli visibili), animazione di sblocco quando un nuovo livello viene raggiunto.

Si implementa l'**easter egg dei sette giorni**: tracciamento delle presenze quotidiane, premio random 5-20 gemme allo scattare del settimo giorno, ripartenza automatica.

Si retro-attribuiscono gli achievement agli utenti già esistenti (chi aveva già giocato partite prima del rilascio degli achievement riceve i livelli che gli spettano).

**Deliverable della fase:** sistema achievement completo, easter egg attivo, profilo arricchito.

### Fase 10 — Multiplayer asincrono

L'obiettivo è la grande feature di espansione: il gioco a due. È anche la fase più complessa tecnicamente.

Si implementa il **sistema amici**: aggiunta tramite ID, visualizzazione lista, gestione delle richieste.

Si costruisce il **matchmaking**: per amici (sfida diretta), o casuale con i filtri descritti nel documento di progetto (country, fascia d'età, range ELO ±10% espandibile fino a ±20%, fallback contro Mana).

Si implementano le **due modalità multiplayer** (Duello dove ognuno sceglie un personaggio, Gara dove Mana sceglie un personaggio comune). Tutto rigorosamente asincrono: il backend tiene lo stato, il client legge e scrive azioni quando l'utente è online.

Si costruisce la **dashboard partite**: vista delle partite in corso, di quelle dove tocca a te, di quelle in attesa dell'altro, di quelle pronte da iniziare.

Si implementano i **timer di 30 secondi per mossa** lato server (non lato client) e il **timeout per inattività** che assegna la vittoria all'avversario.

Si integrano le **notifiche push** con Firebase Cloud Messaging: ogni evento di interesse (tuo turno, l'altro ha risposto, hai vinto/perso, qualcuno ti ha sfidato) genera una notifica se l'utente l'ha attivata.

**Deliverable della fase:** multiplayer funzionante, notifiche attive, dashboard delle partite.

### Fase 11 — Leaderboard e classifiche

L'obiettivo è il sistema competitivo, che dà senso al multiplayer e alla progressione.

Si implementa il **sistema ELO** sul database: ogni partita PvP aggiorna il rating dei due giocatori secondo la formula standard. Si decide il valore K (la "volatilità" del rating) e i bound minimi/massimi.

Si costruiscono le **quattro leaderboard**: vs Mana (per percentuale o numero di vittorie), amici (per rapporto vittorie/giocate), country (per ELO), globale (per ELO). Schermate dedicate con paginazione, ricerca della propria posizione, evidenziazione dei propri amici nella classifica country/globale.

Si configurano i **calcoli ricorrenti**: ogni notte un job ricalcola posizioni delle leaderboard, ogni settimana c'è un eventuale reset/decay (da decidere).

**Deliverable della fase:** quattro leaderboard live, sistema ELO funzionante.

### Fase 12 — Sfida del giorno e polishing

L'obiettivo è chiudere tutte le funzionalità del documento di progetto.

Si implementa la **sfida del giorno**: un tema specifico (dominio, difficoltà, vincolo) generato giornalmente, una mini-leaderboard di chi vince in giornata, punti bonus al ranking ELO per chi partecipa.

Si fa **polishing generale**: revisione di tutte le schermate, animazioni più curate, suoni eventualmente, qualità della scrittura di Mana, microtransizioni.

Si fa una **revisione UX completa** in base a tutto il feedback ricevuto dal momento del rilascio MVP. Si correggono i punti deboli che si sono manifestati con l'uso reale.

**Deliverable della fase:** prodotto completo come da documento di progetto.

---

## Blocco D — Attività trasversali

Queste attività non sono fasi sequenziali ma corrono in parallelo, partendo a momenti diversi del piano.

### Marketing

Il marketing parte **prima della Fase 8** (prima del rilascio MVP). Si costruisce una **landing page** del gioco (riusando il prototipo o costruendo ex novo), che spiega cos'è Mana, mostra screenshot, e raccoglie email di interessati in attesa del rilascio. Si presidiano i canali social pertinenti (Instagram, TikTok, magari Reddit): il personaggio di Mana è un ottimo soggetto per contenuti brevi.

Al momento del rilascio MVP si fa una **piccola campagna**: post sui canali social, eventuale press release verso siti che parlano di giochi/app per bambini in Italia, contatti con qualche micro-influencer del settore family/parenting.

Dopo il rilascio si imposta un loop di **analytics e iterazione**: si guardano i numeri (download, retention, conversione gratis→pagante), si raccolgono recensioni, si itera sulla comunicazione di marketing in base ai dati.

Nelle fasi 9-12 ogni nuova feature può essere accompagnata da contenuti dedicati ("Multiplayer arrivato!", "Ecco la prima sfida del giorno!").

### Legale e compliance

Gli aspetti legali partono **prima della Fase 6** (prima dell'onboarding utenti), perché senza non si può raccogliere il primo iscritto. Servono: **privacy policy** dettagliata (dati raccolti, base giuridica GDPR, trasferimenti extra-UE per le API AI, diritti utenti, contatti), **termini di servizio**, **cookie policy** per la versione web, e nel caso di utenti minori la gestione del consenso genitoriale (un tema delicato perché in alcune giurisdizioni richiede flussi specifici).

Si valuta la necessità di costituire una **forma giuridica adeguata** per ricevere i ricavi dagli store: partita IVA, eventuale società. Si configurano gli aspetti fiscali con un commercialista.

Si valutano i requisiti specifici degli store: **Apple e Google hanno regole stringenti per app per bambini**. La review può essere lunga e richiedere modifiche. Meglio leggere bene le linee guida prima di sottomettere.

### Supporto utenti

Da Fase 8 in poi serve un canale di supporto, anche minimo. Ne sufficiente un indirizzo email pubblico monitorato. Più avanti, se i volumi crescono, si valuta un sistema strutturato (Crisp, Intercom, o simili).

Si predispongono **risposte preimpostate** ai problemi più frequenti (acquisto gemme non andato a buon fine, ho perso il mio account, mi è stato bannato l'amico, ecc.).

### Monitoraggio e operations

Da Fase 3 in poi (dal primo deploy del backend "vero") serve presidiare costantemente i numeri operativi: costi delle API, errori, latenze, partite anomale. Si configurano **alert** che notificano l'autore quando qualcosa va fuori soglia (es. costo orario sopra una certa cifra, errori 5xx in aumento, picchi di traffico).

Si pianificano **backup** del database (Supabase ne fa automaticamente, ma è bene verificare). Si imposta una procedura di **disaster recovery** documentata: se qualcosa va davvero storto, cosa fare per recuperare.

---

## Sintesi: cronologia ideale

Il flusso operativo del progetto, letto in modo lineare, è il seguente:

Si parte mettendo in piedi tutte le **fondamenta tecniche** (Fasi 1-4): repository, ambienti, database, backend sicuro, integrazione AI. In parallelo, durante queste fasi, si avvia il **lavoro legale di base** (privacy policy, terms of service) e si comincia a costruire la **presenza marketing** (landing page in attesa, social).

Si arriva poi al **test del modello AI** (Fase 5), che è il momento della verità sulla qualità del gioco. Se i risultati non sono soddisfacenti, si itera sul system prompt finché lo sono, prima di costruire altro sopra.

Si entra quindi nella costruzione dell'**MVP del gioco** (Fasi 6-8): identità utente, produzione della grafica e di Mana animata in Rive, costruzione del gioco single player con gemme e acquisti. Si chiude con il **rilascio sugli store**, il primo grande traguardo del progetto.

Da qui parte la vita reale del prodotto. Si **espande** con achievement (Fase 9), poi con il **multiplayer** che è la grande feature di crescita (Fase 10), poi con le **classifiche competitive** (Fase 11), e infine con il **polishing e la sfida del giorno** (Fase 12).

In tutto questo arco, le **attività trasversali** (marketing, legale, supporto, operations) accompagnano il progetto, intensificandosi nei momenti di rilascio e poi diventando attività di routine.

Il piano è progettato per essere **resiliente alle sorprese**: ogni fase ha un punto di chiusura chiaro, e l'MVP è il primo momento in cui il prodotto produce valore esterno. Anche se per qualche motivo il progetto si interrompesse dopo l'MVP, ci sarebbe comunque un'app pubblicata che funziona e genera ricavi, anche se piccoli. Tutte le fasi successive sono **incrementi** rispetto a quel punto di partenza.

---

*Piano di lavoro · soggetto a revisione*
