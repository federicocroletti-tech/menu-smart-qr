# Progetto del sistema di prenotazione

## Stato attuale verificato

Menu Smart QR è una SPA Angular standalone. Con l'API configurata, profilo, allergeni e menu vengono caricati da PostgreSQL tramite l'API Node.js/Express; i JSON nel repository restano anche configurazione seed. `render.yaml` configura il sito statico e l'API. Il backend usa Supabase Auth per le route protette e include membership e policy RLS di lettura. Le migrazioni `001`-`005` sono state applicate al progetto remoto; la salute API e la ricerca disponibilità erano state verificate live. Il profilo Pizzeria Vesuvio, i recapiti, gli orari e i tavoli sono però dimostrativi e non identificano un esercente reale.

CR-01 mantiene Vesuvio non prenotabile finché il titolare non fornisce documenti approvati: i link locali demo non sono più configurati, il profilo seed disabilita `reservations.enabled` e `enableReservations` e la migrazione `009_disable_demo_reservations.sql` disabilita il booking PostgreSQL per quel profilo. Il seed sincronizza il solo blocco di configurazione prenotazioni dal JSON, senza sovrascrivere il resto dei contenuti. Anche bypassando la UI, l'API rifiuta hold/conferme se i due URL HTTPS e le relative versioni non sono configurati e allineati tra contenuto pubblico e regole DB.

La validazione del wall time usa il fuso del ristorante: rifiuta minuti già trascorsi e orari inesistenti al cambio primaverile; per l'ora ripetuta autunnale Europe/Rome usa l'istanza standard successiva, coerente con `AT TIME ZONE` di PostgreSQL. Conferma e rilascio restituiscono `410` per un hold scaduto, incluse le richieste ripetute; la doppia conferma valida resta idempotente, la doppia cancellazione restituisce `409`. I test unitari coprono la logica frontend; il test d'integrazione copre il flusso PostgreSQL, incluse versioni legali, concorrenza, DST, replay e scadenza.

**Verifica live CR-01 eseguita su Neon di test:** bootstrap completato, migrazione `009_disable_demo_reservations.sql` applicata e suite PostgreSQL passata (40 test). Il flusso HTTP ha verificato hold, conferma idempotente, recupero, cancellazione, scadenza, concorrenza e orari Europe/Rome. Produzione Supabase/Render non è stata modificata; il profilo Vesuvio resta disabilitato perché mancano documenti legali approvati.

La UI cliente ora crea un hold prima della conferma e ne mostra la scadenza con conto alla rovescia e i nomi dei tavoli restituiti dall'API; permette l'assegnazione al ristorante o la selezione di un tavolo disponibile. Il codice ricevuto consente di recuperare i dettagli e richiedere la cancellazione dall'interfaccia. Quando la prenotazione online non è configurata o fallisce, un link WhatsApp prepara una richiesta non vincolante; è disattivabile con `enableReservationWhatsappFallback` o `reservations.whatsappFallbackEnabled`. La UI non presenta la richiesta WhatsApp come prenotazione confermata. Queste interazioni frontend hanno test unitari mirati; l'integrazione PostgreSQL end-to-end resta soggetta alla procedura di verifica riportata sotto.

Non esiste ancora un backoffice o un'API autenticata per modificare autonomamente menu e configurazioni. I tavoli aggiunti dalla migrazione `005` sono dati dimostrativi solo per Pizzeria Vesuvio, non una planimetria reale. Notifiche automatiche e pagamenti non sono implementati.

## Flusso cliente proposto

1. Selezionare data, ora di arrivo e numero di persone.
2. Il server determina durata e disponibilita usando turno, orari, regole, capienza, blocchi e prenotazioni.
3. Mostrare solo opzioni disponibili e chiedere come assegnare il posto: scelta del tavolo o assegnazione del ristorante.
4. Se il cliente sceglie, il server crea un hold atomico di 7 minuti sul tavolo o sulla combinazione selezionata. Per l'assegnazione del ristorante, il server sceglie e blocca una soluzione compatibile.
5. Raccogliere contatto essenziale e consensi obbligatori espliciti; il consenso marketing e separato, facoltativo e non preselezionato.
6. Confermare l'hold lato server e generare un codice di conferma non enumerabile. Nessuna conferma dipende dal solo frontend.
7. Consentire modifica o cancellazione in base a termini configurati dal ristorante e registrare ogni transizione.
8. Solo in una fase successiva avviare un'eventuale garanzia tramite provider esterno; lo stato definitivo deriva dal webhook verificato.

Se l'hold scade o il tavolo diventa incompatibile, non confermare: proporre una nuova disponibilita e non sovrascrivere la scelta senza avviso.

## Modello di dominio proposto

I dati persistenti saranno PostgreSQL; le strutture del menu resteranno JSON statici e fuori dal nuovo bounded context.

| Entita | Responsabilita e relazioni principali |
|---|---|
| `Restaurant` | Identita, fuso orario e configurazioni operative; radice dei dati del locale. |
| `DiningArea` | Sala o area di un ristorante; contiene tavoli. |
| `RestaurantTable` | Nome, forma, coordinate normalizzate, dimensioni, rotazione, capienza min/standard/max, caratteristiche e prenotabilita online. |
| `TableCombination` | Combinazione ammessa di tavoli; relazione molti-a-molti con `RestaurantTable`. |
| `OpeningHours` | Giorni e intervalli ordinari di apertura. |
| `ServiceShift` | Turno e durata standard di occupazione; distingue arrivo e fine occupazione. |
| `AvailabilityRule` | Intervallo slot, tempi di riassetto, anticipo, ritardo massimo e regole di capienza. |
| `Closure` | Chiusure straordinarie o intervalli di blocco; puo riguardare un locale, un'area o un tavolo. |
| `Guest` | Contatto minimo necessario alla prenotazione; niente dati carta o dati sanitari non necessari. |
| `Reservation` | Codice pubblico casuale, stato, modo di assegnazione, coperti iniziali/aggiornati/arrivati, durata e scadenza hold. |
| `ReservationTable` | Tavoli assegnati alla prenotazione e intervallo di occupazione; consente assegnazioni combinate. |
| `PaymentGuarantee` | Solo metadati provider e stato di garanzia, senza PAN/CVV; introdotta nella fase pagamenti. |
| `ReservationEvent` | Audit append-only: autore, data, stato precedente/nuovo e motivazione. |
| `Notification` | Stato e riferimento a notifiche inviate, senza duplicare inutilmente dati personali. |
| `ConsentRecord` | Tipo, versione dell'informativa/condizioni, esito e data del consenso. |

Capienza effettiva e coperti non sono un unico campo sovrascrivibile: `party_size_initial`, `party_size_current` e `party_size_arrived` restano distinti; gli eventi memorizzano autore, orario e motivazione degli aggiornamenti.

## Stati e transizioni

Stati persistenti: `draft`, `holding`, `awaiting_guarantee`, `confirmed`, `seated`, `completed`, `cancelled_by_guest`, `cancelled_by_restaurant`, `no_show`, `expired`.

Transizioni ammesse: `draft -> holding -> confirmed`; `holding -> awaiting_guarantee -> confirmed` solo se una policy configurata richiede garanzia; `holding -> expired`; `confirmed -> seated -> completed`; `confirmed -> cancelled_by_guest|cancelled_by_restaurant|no_show`. Le modifiche di orario, coperti o tavolo dopo la conferma generano eventi e una nuova verifica di disponibilita. Non applicare transizioni economiche automatiche per differenze percentuali di coperti.

Gli stati garanzia previsti sono `not_required`, `pending`, `authorized`, `captured`, `refunded`, `partially_refunded`, `failed`, `expired` e `disputed`. Importi, termini di cancellazione e testo legale restano configurabili e richiedono approvazione del titolare e revisione professionale.

## Contratti API e stato implementativo

Le route cliente, membership, lista staff e gestione prenotazioni sono implementate in `server/src/app.ts`; le scritture amministrative usano un access token Supabase verificato e le query PostgreSQL operano con ruolo `authenticated` e policy RLS già previste. L'API è collegata al progetto remoto, ma l'isolamento RLS con utenti e tenant distinti richiede ancora test dedicati su quel database.

| Metodo e percorso | Stato | Uso ed esito principale |
|---|---|---|
| `GET /api/v1/restaurants/{restaurantId}/availability?date=&time=&partySize=` | Implementata e verificata live per il demo Pizzeria Vesuvio | Cerca una data e ora specifiche; durata e regole vengono risolte dal server. L'esito non garantisce il tavolo. |
| `POST /api/v1/restaurants/{restaurantId}/reservation-holds` | Implementata; test end-to-end live da eseguire | Richiede configurazione booking attiva, due URL HTTPS e versioni coerenti, oltre a una chiave idempotente. Restituisce scadenza, tavoli e token. |
| `POST /api/v1/reservation-holds/release` | Implementata; test PostgreSQL end-to-end disponibile | Rilascia in modo idempotente un hold non confermato usando il token nel body, non nell'URL. |
| `POST /api/v1/reservations` | Implementata; test end-to-end live da eseguire | Richiede hold attivo, accettazioni esplicite e le versioni correnti dei due documenti; restituisce lo stesso codice sui replay della conferma valida. |
| `GET /api/v1/reservations/{confirmationCode}` | Implementata; test end-to-end live da eseguire | Recupera dati minimi con il codice di conferma. |
| `POST /api/v1/reservations/{confirmationCode}/cancellation` | Implementata; test end-to-end live da eseguire | Cancella la prenotazione e segnala se la richiesta e oltre il termine; non esegue trattenute. |
| `GET /api/v1/me/restaurants` | Implementata, API testata con verifier/store mock; RLS non verificata su DB reale | Richiede un access token Supabase valido e delega la lettura delle membership alla sessione PostgreSQL con ruolo `authenticated`. |
| `GET /api/v1/admin/restaurants/{restaurantId}/reservations?date=&status=&limit=&offset=` | Implementata, API testata con store mock; RLS non verificata su DB reale | Vista giornaliera filtrata e paginata per un membro autenticato del ristorante; restituisce contatto minimo. |
| `POST /api/v1/admin/restaurants/{restaurantId}/reservations` | Implementata | Crea una prenotazione manuale confermata. Richiede `Idempotency-Key`, contatto minimo, tavoli, intervallo ISO-8601 e motivo. |
| `PATCH /api/v1/admin/reservations/{id}` | Implementata | Aggiorna stato, intervallo e/o coperti con controllo transizione, `If-Match: "<revision>"` e vincoli di collisione. |
| `POST /api/v1/admin/restaurants/{restaurantId}/table-blocks` | Implementata | Blocca un tavolo per un intervallo; rifiuta prenotazioni attive o blocchi sovrapposti. |
| `DELETE /api/v1/admin/restaurants/{restaurantId}/table-blocks/{blockId}` | Implementata | Rimuove un blocco del ristorante. |
| `GET /api/v1/admin/restaurants/{restaurantId}/table-blocks?from=&to=` | Implementata | Legge blocchi sovrapposti all'intervallo. |
| `GET /api/v1/admin/restaurants/{restaurantId}/availability-rules` | Implementata | Legge regole e versioni dei documenti legali per i membri. |
| `PUT /api/v1/admin/restaurants/{restaurantId}/availability-rules` | Implementata | Aggiorna hold, coperti massimi, prenotazione online e preavviso di cancellazione. |
| `GET /api/v1/admin/restaurants/{restaurantId}/availability-exceptions?from=&to=` | Implementata | Legge eccezioni nell'intervallo richiesto. |
| `PUT /api/v1/admin/restaurants/{restaurantId}/availability-exceptions` | Implementata | Crea o sostituisce l'eccezione di apertura/chiusura per una data. |
| `GET /api/v1/admin/restaurants/{restaurantId}/notifications?limit=` | Implementata | Legge lo stato delle notifiche senza esporre recapiti o payload provider. |
| `GET /api/v1/admin/restaurants/{restaurantId}/reservations/export?from=&to=` | Implementata | Esporta CSV per un intervallo limitato; richiede ruolo owner/admin e protegge le celle da formula injection. |
| `PATCH /api/v1/reservations/{confirmationCode}` | Implementata | Modifica data/ora/coperti con `Idempotency-Key` e `If-Match: "<revision>"`; il server ricalcola e rialloca atomicamente il tavolo. Il `GET` restituisce revision ed ETag. |

Le route `/api/v1/admin/**` richiedono access token Supabase verificato; le mutazioni richiedono membership `owner` o `admin` verificata lato server e in RLS, mentre la lista giornaliera resta disponibile ai membri staff. La prenotazione guest usa codice opaco e token hold, senza riutilizzare l'autenticazione staff. La SPA non contiene credenziali database o chiavi `service_role`. Non esiste ancora un flusso di invito o bootstrap del proprietario.

### Errori HTTP e idempotenza

Gli errori API hanno forma `{ "error": "<messaggio>" }`: `400` per parametri/body non validi o chiavi idempotenti mancanti; `401` per token mancante/non valido; `404` per risorse non trovate o non accessibili nel tenant; `409` per chiave riutilizzata con payload diverso, versione legale obsoleta, transizione non consentita o collisione tavolo; `410` per hold scaduto, anche nei replay di conferma/rilascio; `412` per revisione o versione legale superata; `413` per body eccessivo; `428` se manca `If-Match`; `429` per rate limit; `503` se booking o documenti legali non sono configurati; `500` per errore interno senza dettagli database. Le route di modifica/cancellazione restituiscono inoltre `late` per una cancellazione oltre il preavviso configurato. La chiave idempotente della modifica viene memorizzata con hash e risultato nella stessa transazione; hold e conferma mantengono le proprie garanzie idempotenti. Ogni aggiornamento di prenotazione incrementa una revisione DB, così richieste concorrenti basate su una versione obsoleta falliscono senza sovrascrivere l'aggiornamento più recente.

Conferme, modifiche e cancellazioni scrivono un outbox transazionale in `notifications` con deduplicazione. Lo stato iniziale è `queued`: la consegna effettiva richiede un worker/provider di messaggistica configurato e non viene dichiarata riuscita senza tale integrazione. Le API non restituiscono indirizzi email o numeri telefonici nel feed notifiche.

## Motore di disponibilita e concorrenza

- Validare sul server apertura, turno, chiusure, slot configurabili, durata e riassetto. Lo slot di arrivo non equivale alla durata occupata.
- Calcolare soluzioni da capienza e combinazioni configurate, escludendo prenotazioni attive, prenotazioni manuali e blocchi.
- L'endpoint di ricerca e informativo; la creazione dell'hold ripete tutte le verifiche in transazione.
- Il servizio implementa lock delle righe tavolo in ordine deterministico e la migrazione definisce un vincolo di esclusione GiST sugli intervalli attivi. Una collisione concorrente e gestita come conflitto; questa proprieta non e stata ancora verificata su PostgreSQL reale.
- La scadenza viene controllata nel servizio e pulita da un job periodico. Hold scaduti restituiscono `410` sia in conferma sia in rilascio; una conferma ripetuta resta idempotente, mentre replay di hold scaduto e doppia cancellazione sono conflitti espliciti. La durata e configurabile tra 5 e 10 minuti; lo schema usa 7 minuti come valore iniziale.
- Chiavi idempotenti per creazione/conferma; nessuna riga per minuto, gli slot sono configurabili a 15 o 30 minuti.
- Il cambiamento coperti/tavolo dopo conferma richiede una nuova allocazione atomica e genera un evento.

## Garanzia economica e privacy

La fase pagamenti e successiva all'affidabilita di hold, concorrenza e cancellazioni. Le opzioni future sono no-garanzia, preautorizzazione, deposito per persona/fisso o prepagamento, eventualmente limitati a gruppi o turni configurati. Policy, eccezioni, motivo di trattenuta e rimborsi sono tracciati; l'applicazione non inventa termini legali o importi.

Usare Checkout/Payment Element o tokenizzazione di un provider conforme. Persistono solo identificativi provider e stati; non memorizzare numero carta o CVV. I webhook verificati e idempotenti, non il redirect browser, determinano l'esito.

Raccogliere solo nome e recapito necessari; marketing separato. Retention configurabile, anonimizzazione/cancellazione e accesso per ruolo. Allergie e note sanitarie non entrano nel flusso base; se necessarie richiedono raccolta e retention separate.

## Migrazione e fasi

1. Completato: servizio Node.js API, schema PostgreSQL, runner migrazioni `001`-`005`, verifica server-side token Supabase, policy RLS di lettura tenant e deploy Render/Supabase. La ricerca disponibilità è stata verificata live sul demo Vesuvio. La chiave DB rimane solo nell'ambiente server.
2. In corso: aggiungere test automatizzati di build/test API alla CI e progettare i controlli d'isolamento con due tenant/utenti. Le configurazioni dei tavoli demo non devono essere riutilizzate come dati reali di un ristorante.
3. Prossimo: verificare su staging i flussi PostgreSQL hold, conferma, consultazione e cancellazione; configurare documenti legali approvati prima di abilitare la conferma nel demo.
4. In corso: UI dashboard, editor pianta, aggiornamenti disponibilita live e integrazione del worker/provider per consegnare gli eventi outbox.
5. Ultimo: provider pagamenti, webhook e policy economiche approvate. Nessuna integrazione pagamenti prima dei test concorrenza/cancellazione.

## Verifiche richieste prima del rilascio

Test unitari di durata/capienza/combinazioni e transizioni; test PostgreSQL concorrenti sullo stesso tavolo e hold scaduti; test API di idempotenza e cancellazione; test webhook nella fase dedicata; E2E e accessibilita con tastiera, zoom 200% e viewport mobile. La disponibilita frontend non e mai una garanzia di prenotazione.

### Procedura riproducibile per i flussi PostgreSQL

Per CR-01 la suite include il rifiuto di URL/versioni legali assenti o incoerenti, test di mapping Europe/Rome per gli orari DST, `410` ripetuto per conferma e rilascio dopo scadenza, e replay idempotente della conferma.

Il test d'integrazione `server/src/reservation-service.postgres.spec.ts` esercita via HTTP hold, riuso della chiave idempotente, conferma ripetuta, recupero, cancellazione, concorrenza e scadenza. Le migrazioni usano lo schema `public`: eseguirle solo sul database Neon dedicato ai test, mai su Supabase produzione.

In `server/.env`, `DATABASE_URL` e `RESERVATION_TEST_DATABASE_URL` devono puntare entrambi al database Neon di test: `DATABASE_URL` serve al runner delle migrazioni, mentre il test apre il pool con `RESERVATION_TEST_DATABASE_URL`. Questa configurazione locale non cambia il servizio Render, dove `DATABASE_URL` resta collegato a Supabase e la password è un segreto separato. Il test d'integrazione rifiuta host diversi da Neon e PostgreSQL locale (usato dalla CI).

Eseguire in PowerShell:

```powershell
$env:REQUIRE_RESERVATION_TEST_DATABASE = "true"
npm run server:build
npm run server:test-db:bootstrap
npm run server:migrate:neon
npm run server:test:neon
```

Il bootstrap locale è limitato agli host Neon; la suite crea e rimuove record sintetici. Senza `RESERVATION_TEST_DATABASE_URL` il caso viene saltato; un test saltato non costituisce una verifica PostgreSQL. Il runner richiede PostgreSQL con le estensioni abilitate dalle migrazioni `001` e `002`.

CR-01 aggiunge la migrazione `009_disable_demo_reservations.sql`; applicarla al database Neon di test prima della verifica. La migrazione di produzione non è stata eseguita.
