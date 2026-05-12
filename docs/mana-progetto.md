# Mana — Documento di Progetto

*Versione 1 · 11 maggio 2026*

## Premessa

Mana nasce come un piccolo gioco "indovina chi" per Isabel (8-10 anni), figlia del proponente. Lungo il percorso di sviluppo l'idea evolve grazie a un'osservazione della stessa Isabel: "Perché non lo facciamo un gioco per tutti?". Da quel momento il progetto cambia natura: da semplice gioco familiare a piccola app pubblica, pensata per essere distribuita sugli store, monetizzata in modo equo, e tecnicamente solida.

Lo spirito resta però quello iniziale: un gioco con un'anima, con un personaggio (Mana, la giovane oracolo) che accompagna l'utente attraverso le sue domande. L'estetica è ispirata ai tarocchi e all'Art Nouveau — magica ma non infantile, gradevole anche per un adulto.

Questo documento riassume le decisioni prese durante la fase di discussione strategica, organizzate in quattro categorie: aspetti economici e di business model, tecnologia, funzionalità del gioco, e core delle domande/risposte. La parte grafica resta da definire in dettaglio.

---

## 1. Modello economico e di business

### Obiettivo

L'obiettivo dichiarato è "guadagnarci qualcosa, anche poco". Non si punta a costruire un business da milioni di euro, ma nemmeno a regalare un servizio. L'app deve almeno coprire i costi di esercizio e idealmente generare un piccolo margine. Questo orienta tutte le scelte successive: il modello economico deve essere sostenibile anche con pochi utenti paganti, le tecnologie scelte devono minimizzare i costi fissi, e l'esperienza utente non deve essere snaturata da pubblicità invadenti o limitazioni eccessive.

### I costi reali per partita

Le partite hanno un costo concreto in termini di chiamate alle API dei modelli linguistici. Una partita media consiste in circa venti scambi di domande e risposte, ognuno dei quali è una chiamata al modello AI. Il costo per partita varia enormemente in base al modello scelto: si va da circa 30-50 centesimi con il modello più capace (Claude Opus 4.5) fino a una frazione di centesimo con i modelli economici come GPT-5 nano o Gemini Flash-Lite.

Per un gioco pubblico questi numeri sono determinanti. Con mille utenti che giocano una partita al giorno, parliamo della differenza tra trecento e tre euro al giorno di costi.

### Il caching del system prompt

Una leva fondamentale per abbattere i costi è il caching del system prompt, ovvero della parte di istruzioni che precede ogni chiamata e che spiega al modello le regole del gioco. Praticamente tutti i grandi provider (OpenAI, Anthropic, DeepSeek, Google) supportano questa funzionalità, alcuni in modo automatico, altri richiedendo configurazione esplicita. Lo sconto va dal 50% al 90% sul costo dei token in cache.

Nel nostro caso il caching è particolarmente conveniente per due motivi. Primo, il system prompt è lungo e relativamente stabile: contiene le regole del gioco, lo stile di Mana, ed eventualmente esempi few-shot di partite ben condotte. Secondo, tutte le partite di tutti gli utenti del mondo passano attraverso la stessa API key (la nostra, lato server). Questo significa che la cache resta sempre calda: anche con poche partite all'ora, il prompt è sempre già processato e gli sconti si applicano dalla prima chiamata di ogni partita.

### L'approccio few-shot

Sfruttando il caching gratuito o quasi, possiamo permetterci di allungare il system prompt con esempi concreti di buone partite. Questa tecnica, nota come few-shot prompting, è spesso più efficace della pura descrizione testuale: il modello impara per imitazione vedendo come dovrebbe comportarsi in casi reali.

Costruiremo questi esempi con un approccio misto: una parte verrà scritta a mano per illustrare pattern strategici specifici (come restringere dopo una risposta ambigua, quando fare un guess, come gestire le risposte "non lo so"), una parte verrà estratta da partite reali particolarmente ben riuscite giocate durante i test.

### Strategie di monetizzazione

Diverse strade sono state valutate, e la scelta è caduta su un sistema basato su gemme, descritto in dettaglio nella sezione sulle funzionalità. In sintesi: il gioco è gratuito ma ogni partita consuma una gemma, le gemme si rigenerano lentamente nel tempo, e chi vuole giocare di più può acquistarle in pacchetti. Questo modello ha tre vantaggi importanti: tutti possono provare il gioco senza barriere, gli utenti casuali non pagano mai, e i pochi utenti molto attivi finanziano la struttura.

### Multi-provider come strategia

La scelta del modello AI da utilizzare è rinviata a una fase di test sul campo. Il framework architetturale però è già chiaro: il sistema sarà costruito per essere multi-provider, in modo da poter usare diversi modelli in scenari diversi (ad esempio un modello economico per le prime domande di categorizzazione e un modello più capace per il finale e il guess) e per non rimanere bloccati su un singolo fornitore in caso di problemi di prezzo, downtime o policy.

---

## 2. Architettura tecnologica

### Multi-piattaforma con Flutter

L'obiettivo di distribuire il gioco sugli store (Apple App Store e Google Play) impone una scelta tecnologica precisa: serve un'app nativa o cross-platform compilata. Una web app, anche se installabile come PWA, non viene accettata in modo pulito sull'App Store.

La scelta è Flutter, il framework di Google basato sul linguaggio Dart. Con Flutter si scrive una sola volta il codice e si compila per iOS, Android e Web da un'unica base. Questo è cruciale per due motivi: ci permette di pubblicare ovunque senza moltiplicare gli sforzi, e ci dà gratis una versione browser del gioco, ottima per il marketing (un link condivisibile, niente installazione) e per chi preferisce giocare al PC.

Flutter offre inoltre un sistema di animazioni molto potente, che ci sarà utile per dare vita a Mana — un personaggio che vive sullo schermo, che fa espressioni, che parla, che reagisce alle azioni dell'utente.

### Backend serverless su Vercel

Il backend del gioco vive su Vercel come function serverless. Il prototipo iniziale è già in produzione: una function `/api/chat` riceve le richieste dall'app, le inoltra all'API del modello AI con la chiave segreta del server, e restituisce la risposta al client. Questa architettura risolve immediatamente un problema critico di sicurezza: la chiave API non transita mai per il dispositivo dell'utente.

In fase di crescita la stessa infrastruttura sarà estesa con autenticazione, rate limiting, logica di gioco lato server e validazione delle partite. La function `/api/chat` resta la porta unica di comunicazione tra app e modello AI.

### Database e autenticazione: Supabase

Per gestire utenti, punteggi, leaderboard e storico, serve un database. La scelta è Supabase, che offre PostgreSQL serverless più un sistema di autenticazione utenti completo (email, login social Google/Apple, recupero password, verifica email). Il piano gratuito è generoso per la fase iniziale e la migrazione a piani superiori è graduale.

Avere autenticazione e database nello stesso servizio semplifica molto l'architettura: invece di gestire integrazioni multiple, abbiamo un unico provider per tutta la persistenza.

### Sicurezza del backend

Questo è uno dei punti più delicati. Un backend aperto come quello attuale è chiamabile da chiunque conosca l'URL: qualcuno potrebbe costruire la propria app o un proprio sistema utilizzando la nostra API a costo zero. Inoltre, senza validazione lato server, un utente smaliziato potrebbe modificare il JavaScript dell'app e dichiararsi vincitore di partite mai giocate, falsando le classifiche.

La soluzione richiede una difesa a strati. **Autenticazione obbligatoria**: solo utenti registrati possono chiamare l'API, con un token JWT verificato a ogni richiesta. **Rate limiting**: limiti rigidi sul numero di chiamate per utente per intervallo di tempo. **Validazione del payload**: il server controlla che ogni richiesta sia plausibile in lunghezza e contenuto, e impedisce al client di scegliere modello o sovrascrivere il system prompt. **Logica di gioco lato server**: il backend tiene lo stato delle partite (chi gioca, quante domande sono state fatte, chi ha vinto), il client manda solo le risposte alle domande e riceve istruzioni; non può "dichiarare" un risultato. **Rilevamento abusi**: pattern sospetti come partite troppo veloci, IP che cambiano continuamente, o frequenze anomale vengono flaggate e l'utente può essere bannato.

### Vercel + GitHub: deployment continuo

Il codice vive su GitHub (repository `maxbrignoli/mana`). Vercel è collegato al repository: ogni push sul branch principale triggera un deploy automatico, che richiede circa trenta secondi. L'URL di produzione è già attivo: `mana-lake.vercel.app`. La variabile d'ambiente `ANTHROPIC_API_KEY` è impostata in modo cifrato su Vercel e mai esposta al client.

---

## 3. Funzionalità del gioco

### Le due modalità di gioco

Il gioco si articola attorno a due modalità principali, simmetriche tra loro.

Nella prima modalità, **Mana indovina**, è l'utente a pensare a un personaggio. Mana fa domande chiuse a cui l'utente risponde con una di cinque possibilità: sì, no, forse sì, forse no, non lo so. La possibilità di rispondere "forse" o "non so" è centrale: rende il gioco realistico (raramente uno conosce un personaggio in ogni dettaglio) e dà al modello AI informazioni più sfumate da elaborare. Quando Mana crede di aver capito chi è il personaggio, tenta di indovinare. Se finisce le domande disponibili senza azzeccarci, l'utente vince.

Nella seconda modalità, **l'utente indovina**, i ruoli sono invertiti: Mana sceglie segretamente un personaggio e l'utente fa domande libere, in linguaggio naturale. Mana risponde con le stesse cinque opzioni e l'utente può tentare di indovinare il nome quando vuole.

### I domini dei personaggi

In modalità "Mana indovina" non si applica alcun filtro: l'utente è libero di pensare a chi vuole, e Mana deve farsi le sue ipotesi dal nulla. In modalità "Utente indovina", invece, l'utente può guidare Mana indicando da quali domini pescare il personaggio. Questo migliora drasticamente la giocabilità: senza un'idea del "campo", Mana potrebbe scegliere un personaggio completamente sconosciuto all'utente, generando frustrazione.

I domini previsti includono: Disney/Pixar, Marvel, Star Wars, anime e manga, videogiochi, libri per ragazzi, animali (reali e mitologici), personaggi storici, cinema e serie TV, sport, musica, personaggi italiani. Tutti i domini sono selezionati di default, e l'utente può deselezionare quelli che non gli interessano. L'unica regola è che almeno un dominio deve restare attivo, altrimenti Mana non saprebbe da dove pescare. La selezione è ricordata: la prossima volta che si apre l'app, i filtri sono come l'ultima volta.

### Età e difficoltà

Due parametri ulteriori modellano l'esperienza: l'età dell'utente e il livello di difficoltà. L'età viene chiesta in fase di registrazione e ha un duplice ruolo: filtra i personaggi che Mana può proporre (un bambino di sette anni non riceve personaggi horror anche se ha il dominio "Cinema" attivo) e imposta automaticamente una difficoltà di default ragionevole (5-7 anni: facile, 8-15: medio, 16+: difficile). L'utente può sempre cambiare la difficoltà manualmente.

La difficoltà a sua volta agisce su più dimensioni. Sulla **notorietà** dei personaggi proposti: facile pesca solo dai super-famosi (Topolino, Pikachu), difficile può scegliere anche secondari ben noti. Sulla **complessità delle domande**: facile usa frasi dirette e semplici, difficile può fare domande sottili e strategiche. Sul **numero di domande** disponibili: facile più domande, difficile meno. Sugli **aiutini**: a difficoltà bassa Mana può lasciar cadere indizi utili senza che vengano richiesti, a difficoltà alta mai.

### Filtro geografico e culturale

Una variabile importante che spesso viene trascurata nei giochi di questo tipo è la pertinenza culturale dei personaggi. Un anime giapponese mai arrivato in Italia è inutilizzabile per un giocatore italiano. Per gestire questa dimensione, l'app rileva il paese dell'utente dall'indirizzo IP al primo avvio e imposta come "cultura conosciuta" di default quel paese. Da quel momento, il parametro resta stabile e si cambia solo manualmente dalle impostazioni — non si modifica automaticamente se l'utente va in vacanza, evitando sorprese del tipo "ora Mana parla solo in tedesco".

L'utente può modificare i filtri culturali in qualsiasi momento, attivando o disattivando altre culture conosciute. Un italiano che ha vissuto in Giappone può attivare anche la cultura giapponese e ricevere domande sugli anime di nicchia. Un appassionato di K-drama può aggiungere la cultura coreana.

### Multiplayer asincrono

Il gioco supporta partite tra utenti, ma con un vincolo di sicurezza fondamentale: i giocatori non comunicano mai direttamente tra loro. Mana è sempre l'intermediaria. Questo elimina alla radice ogni rischio di esposizione dei bambini a contatti non desiderati e rende l'app utilizzabile in sicurezza anche dai più piccoli.

Sono previste due modalità multiplayer. Nella **Modalità Duello** entrambi i giocatori scelgono in segreto un personaggio e lo comunicano solo a Mana; ognuno fa domande a Mana sul personaggio dell'altro, e vince chi indovina per primo. Nella **Modalità Gara** è Mana a scegliere un singolo personaggio segreto e entrambi i giocatori fanno domande in parallelo (senza vedere quelle dell'avversario), vince chi arriva al nome per primo.

Tutte le partite multiplayer sono **asincrone**: un giocatore può avere più partite contemporaneamente in vari stati (attesa di risposta dell'altro, proprio turno di rispondere, da iniziare). Per evitare partite eterne, c'è un **timer di 30 secondi** per ogni mossa (domanda o risposta) quando si è in multiplayer; in single player non c'è invece alcun limite. Se un giocatore non risponde entro un tempo configurabile (es. 24 ore), l'altro vince per inattività.

### Identificativo utente e sistema amici

Ogni giocatore ha un ID univoco, ma questo ID non è mai visibile o cercabile da nessun altro utente all'interno dell'app. L'unica persona che vede l'ID di un utente è l'utente stesso, nelle sue impostazioni. Se vuole giocare con un amico, glielo comunica privatamente (a voce, via WhatsApp del genitore, su un foglietto) e l'amico inserisce quell'ID per aggiungerlo alla propria lista. Al termine di una partita è possibile aggiungere l'avversario alla propria lista amici con un click.

Quando un utente cerca una partita con un avversario casuale, il matchmaking applica tre filtri: per country, per fascia d'età e per range di punteggio (più o meno il 10%). Se entro un tempo ragionevole non trova nessuno, allarga il range di punteggio progressivamente; oltre il 20% rimuove il filtro country. Il filtro per fascia d'età non viene mai rimosso: un adulto non viene mai accoppiato con un bambino. Se neppure così si trova un avversario, l'app propone all'utente di giocare contro Mana.

### Leaderboard

Esistono quattro classifiche distinte: la classifica delle vittorie contro Mana, quella tra amici, quella nazionale (gli altri giocatori del proprio paese) e quella globale. La classifica amici è speciale: si basa sul rapporto vittorie/partite giocate, in stile "percentuale di successo", per non penalizzare chi gioca raramente ma vince sempre. Le altre tre classifiche usano invece un sistema **ELO** (lo stesso degli scacchi): battere un avversario molto più forte vale tanti punti, battere un avversario più debole ne vale pochi. Questo crea un sistema di matchmaking equilibrato e dà valore al ranking.

### Achievement progressivi

Gli achievement non sono semplici "ricompense binarie" (lo prendi o non lo prendi), ma sono organizzati a **scala progressiva**: ogni achievement ha più livelli, ognuno con un traguardo via via più difficile e una ricompensa in gemme crescente. Lo schema di base prevede quattro livelli con una progressione 1, 2, 5, 10 gemme — una sequenza geometrica naturale che fa percepire chiaramente la differenza tra un piccolo traguardo e uno notevole. Per alcuni achievement particolarmente rari la scala può estendersi a più livelli o avere ricompense superiori (fino a 25 gemme o più), per altri molto comuni si può ridurre a meno livelli.

Il principio è che si gioca per battere il proprio record. Una volta sbloccato il primo livello, ne resta visibile il successivo come prossimo obiettivo. Tutti gli achievement sono **trasparenti**: l'utente vede dall'inizio tutti i livelli previsti e le gemme che daranno, così sa cosa lo aspetta e può scegliere quali traguardi inseguire.

Esempio concreto, achievement "Indovinare velocemente": livello 1 con vittoria in 20 domande dà 1 gemma; livello 2 con vittoria in 18 domande dà 2 gemme; livello 3 con vittoria in 15 domande dà 5 gemme; livello 4 con vittoria in 10 domande dà 10 gemme. Un giocatore che progredisce nella scala accumula 18 gemme complessive su questo achievement nel corso del tempo.

La logica progressiva si applica naturalmente a diverse categorie di traguardi: i traguardi di **quantità** (numero di partite vinte, di amici aggiunti, di domini esplorati), i traguardi di **abilità** (indovinare in poche domande, vincere streak consecutivi, battere avversari più forti nel ranking ELO), i traguardi di **varietà** (vincere su tutti i domini, su tutte le difficoltà, con personaggi di culture diverse), e i traguardi di **multiplayer** (sfide vinte, ranking ELO raggiunto, sfide del giorno completate).

Alcuni achievement narrativi o di "prima volta" restano necessariamente binari: la prima vittoria in assoluto, la prima sfida del giorno completata, l'aggiunta del primo amico. Per questi si fissa una singola ricompensa, di solito 5 gemme.

### L'easter egg dei sette giorni

Una meccanica speciale è prevista per premiare la presenza moderata e costante: dopo sette giorni consecutivi in cui l'utente ha giocato almeno una partita al giorno, riceve un piccolo regalo "a sorpresa" — un numero di gemme variabile in modo random tra cinque e venti. La meccanica è **ripetibile**: ogni nuova serie di sette giorni consecutivi di presenza fa scattare di nuovo il bonus.

Importante notare la differenza tra questa meccanica e la classica "streak quotidiana" alla Duolingo: qui non si premia la quantità di partite (basta una al giorno), e l'incentivo è alla **frequenza moderata**, non al consumo intensivo. Per i bambini è una meccanica salutare: passa a salutare Mana ogni giorno e c'è un piccolo dono, ma non sentirsi obbligati a "macinare" partite per non perdere la streak.

### Personalizzazione del profilo

Ogni utente può personalizzare il proprio profilo con un avatar scelto da un set preimpostato di icone. Non si caricano foto personali — per i bambini è una garanzia di sicurezza, e per gli adulti semplifica la gestione della privacy.

### Sfida del giorno

Per dare un motivo in più ad aprire l'app, è prevista una "sfida del giorno": ogni giorno un tema specifico (es. "solo personaggi Disney", "solo anime giapponesi", "personaggi degli anni 80") con una mini-classifica giornaliera. Vincere la sfida del giorno dà punti bonus al ranking. Importante: **non è incentivata la giocata quotidiana sistematica** (non c'è la "streak" di giorni consecutivi tipo Duolingo), perché il pubblico include bambini e non vogliamo creare meccaniche di dipendenza.

### Sistema delle gemme

Le gemme sono la valuta del gioco. Ogni nuovo utente inizia con dieci gemme. Ogni partita giocata costa una gemma; ogni suggerimento richiesto (hint) costa due gemme; in modalità multiplayer paga la gemma solo chi crea la partita, non chi accetta una sfida ricevuta. Le gemme si **rigenerano automaticamente**: una nuova gemma ogni due ore, fino a un massimo di dieci. Se l'utente ne ha più di dieci (per esempio dopo aver acquistato un pacchetto o sbloccato achievement), la rigenerazione si ferma finché non scende sotto i dieci. Questo crea un pavimento minimo gratuito (un utente casuale che gioca una partita ogni due ore non spende mai), ma incentiva chi vuole giocare di più ad acquistare pacchetti.

I pacchetti acquistabili sono quattro: 10 gemme a 0,99 euro, 20 gemme a 1,99 euro, 50 gemme a 3,99 euro, 100 gemme a 6,99 euro. I tagli sono studiati per essere accessibili anche per un acquisto impulsivo da parte di un genitore, e per offrire qualche vantaggio scalare a chi compra pacchetti più grandi.

### Notifiche

Le notifiche push sono configurabili. Servono per avvisare l'utente che è arrivato il suo turno in una partita multiplayer, o che un amico ha appena finito una partita avviata con lui. L'utente può disattivarle completamente o regolarle a granularità fine (solo amici, solo proprie partite, mai). Questo è un punto sensibile considerando il target bambini.

### Funzionalità non incluse

Per chiarezza si elencano alcune cose **deliberatamente escluse**:

- **Storico/replay delle partite**: una volta finita una partita non si rivede né si rigioca. Mantiene il gioco leggero e protegge la privacy.
- **Streak compulsive di giorni consecutivi**: non vogliamo spingere sulla compulsività e sull'accumulo di partite. L'unica meccanica vagamente in questa direzione è l'easter egg dei sette giorni descritto sopra, che però premia la presenza minima (una partita al giorno è sufficiente) e non la quantità.
- **Comunicazione diretta tra giocatori**: tutto passa da Mana, mai chat libere.
- **Profili pubblici cercabili**: gli ID sono privati, niente "username" cercabili.

---

## 4. Funzionalità del core domande/risposte

### Il problema della qualità

Il successo del gioco dipende quasi interamente dalla qualità delle domande e delle risposte di Mana. Se le domande sono goffe, ripetitive, o fuori bersaglio, l'utente perde interesse rapidamente. Se Mana sceglie personaggi sconosciuti o inadatti, l'utente si frustra. Se le risposte sono incoerenti, il gioco perde credibilità.

Questo è il punto su cui Mana deve **superare i concorrenti esistenti** come l'app Akinator. Akinator funziona ma — secondo l'utente — fa a volte domande strane, segno che la logica sottostante è basata su regole semi-rigide e non su comprensione reale. Mana, basandosi su un LLM, ha il potenziale per fare meglio: ragionare davvero su ogni partita, adattarsi al contesto, capire le sfumature.

### Tre dimensioni di personalizzazione

Tre parametri dell'utente influenzano il comportamento di Mana, e ognuno agisce su leve diverse:

**L'età** è prima di tutto un filtro di **sicurezza**: decide quali personaggi Mana può proporre. Un bambino di sette anni non vede personaggi di film horror, contenuti adulti, o tematiche cupe, anche se ha selezionato il dominio "Cinema". Un adolescente può vedere personaggi di un range più ampio. È un filtro hard, non negoziabile.

**La cultura/country** è un filtro di **pertinenza**: decide quali personaggi sono effettivamente conosciuti dall'utente. Un personaggio italiano (Pimpa, Calimero, Geronimo Stilton) viene proposto solo a chi ha attivato la cultura italiana. Un personaggio globale (Mickey Mouse) è proposto a tutti. Un anime di nicchia, mai uscito dal Giappone, viene proposto solo a chi ha attivato la cultura giapponese.

**La difficoltà** è un filtro di **notorietà e stile**: dato il pool di personaggi accettabili (per età) e conosciuti (per cultura), la difficoltà sceglie quanto famosi devono essere e in che modo Mana fa le domande. Facile = solo iconici, domande dirette, linguaggio semplice. Difficile = anche secondari noti, domande strategiche, linguaggio articolato.

In sintesi: l'**età** decide **cosa esiste**, la **cultura** decide **cosa è noto**, la **difficoltà** decide **quanto è ovvio**.

### Effetti sulle domande

Oltre alla scelta dei personaggi, i tre parametri impattano anche il modo in cui Mana formula le domande. Per un utente di otto anni le domande devono essere brevi, dirette, con concetti concreti. Per un utente di vent'anni possono essere più sottili e includere sfumature. Difficoltà facile = domande dirette ("è un animale?"); difficoltà difficile = domande strategiche ("ha mai usato un'arma da fuoco nella sua storia?"). Cultura italiana = domande che usano riferimenti italiani naturali ("è un personaggio Disney?"); cultura giapponese = domande che presuppongono familiarità con strutture narrative locali ("viene da uno shōnen?").

### Costruzione dinamica del system prompt

Tutto questo va comunicato al modello AI tramite il system prompt, e va fatto in modo preciso. Tipo: "L'utente ha 9 anni, cultura italiana, difficoltà medio. Scegli personaggi conosciuti in Italia, adatti a 9 anni, di notorietà media. Esempi: Geronimo Stilton, Vaiana, Lupin III. Linguaggio semplice ma curato. Una domanda alla volta."

Il problema è il **combinatorio**: cinque fasce d'età, dieci culture, tre difficoltà = 150 combinazioni. Scrivere 150 set di esempi è insostenibile. La soluzione è un approccio a **ricetta dinamica**: una parte fissa con le regole del gioco (sempre uguale, sempre cacheata), una parte variabile con i parametri specifici della partita, e un set di esempi few-shot scelti al volo da una libreria taggata per "tipo di lezione" (es. "buone domande per età bassa", "buone scelte per difficoltà media", "gestione di forse-sì in contesto Marvel"). Gli esempi si combinano dinamicamente in base al profilo dell'utente.

### Punti aperti per la prossima fase

Sul core domande/risposte sono ancora da definire diversi dettagli:

- Comportamento preciso di Mana sui "forse sì/forse no" — quanto peso dare a queste risposte ambigue
- Logica decisionale per il timing del guess: quando Mana decide di tentare invece di continuare con le domande
- Cosa succede se Mana riconosce contraddizioni nelle risposte dell'utente (ha sbagliato? sta barando?)
- Comportamento esatto degli hint: cosa fornisce Mana quando l'utente spende due gemme per un suggerimento
- Validazione in Modalità 1 quando l'utente "dice di aver pensato a un personaggio" ma non lo dichiara — c'è modo di intercettare cambi di idea?
- Gestione del multilingua: se un utente italiano gioca in inglese ma pensa a Geronimo Stilton, come si comporta Mana?
- Strategia per i modelli economici: testare GPT-5 nano, GPT-5 mini, DeepSeek V4 Flash, Gemini 2.5 Flash, Claude Haiku 4.5 e confrontarli su una batteria di partite reali per scegliere il vincitore (o un mix dinamico).

---

## 5. Stato attuale e prossimi passi

Il prototipo iniziale del gioco è già online all'indirizzo `mana-lake.vercel.app`. Si tratta della versione "Isabel only" — un singolo file HTML con React, frontend e backend separati ma molto semplici, Mana disegnata in SVG, le due modalità di gioco funzionanti, una piccola UI in stile Art Nouveau. È funzionante ma è un punto di partenza, non un punto di arrivo: la quasi totalità di quanto descritto in questo documento (multiplayer, gemme, achievement, multi-provider, autenticazione, leaderboard) deve ancora essere costruito.

I prossimi passi naturali, in ordine di priorità, sono:

1. **Discussione della parte grafica** — non ancora affrontata. Include il ridisegno di Mana, l'identità visiva del gioco, il design di tutte le schermate, le animazioni di transizione, gli avatar disponibili, le icone degli achievement e dei domini. È una categoria a sé.

2. **Riapertura dei dettagli economici e tecnici** — varie scelte concrete sono state rinviate: provider AI da scegliere, prezzi finali dei pacchetti gemme, dimensionamento dei rate limit, design preciso del database. Tutte queste decisioni vanno prese prima di iniziare a costruire il prodotto vero.

3. **Costruzione vera dell'app Flutter** — una volta chiariti i punti sopra. Si tratterà di un lavoro consistente, da affrontare a moduli (prima l'autenticazione e il profilo, poi le modalità di gioco singolo, poi il multiplayer, poi il sistema gemme e gli acquisti).

4. **Test e tuning del core AI** — in parallelo allo sviluppo, costruire un test bench che metta a confronto diversi modelli su partite reali e identifichi il miglior compromesso costo/qualità.

5. **Pubblicazione sugli store** — l'ultima fase, una volta che il prodotto è pronto. Richiede un account sviluppatore Apple (99 €/anno) e un account Google Play (25 € una tantum), oltre alla preparazione di materiali di marketing (screenshot, descrizioni, video promozionali) e all'allineamento con le policy degli store, che per app rivolte anche ai bambini sono particolarmente stringenti.

---

*Documento di lavoro · soggetto a revisione*
