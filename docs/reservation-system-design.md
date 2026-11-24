# Progetto del sistema di prenotazione

## Stato attuale verificato

Menu Smart QR e una SPA Angular standalone, con contenuti caricati da JSON statici tramite `HttpClient`. La pubblicazione configurata in `render.yaml` e statica: il repository non contiene API server, database, autenticazione, ruoli o pannello amministrativo.

Il controllo prenotazioni esistente e un modulo di contatto WhatsApp: raccoglie nome, telefono, data, ora, coperti e note, poi compone un messaggio. Non verifica orari o disponibilita e non crea una prenotazione confermata. Questo comportamento si trova in `src/app/features/menu/components/reservation-panel/`.

## Flusso cliente proposto

1. Selezionare data, ora di arrivo e numero di persone.
2. Il server determina durata e disponibilita usando turno, orari, regole, capienza, blocchi e prenotazioni.
3. Mostrare solo opzioni disponibili e chiedere come assegnare il posto: scelta del tavolo o assegnazione del ristorante.
4. Se il cliente sceglie, il server crea un hold atomico di 7 minuti sul tavolo o sulla combinazione selezionata. Per l'assegnazione del ristorante, il server sceglie e blocca una soluzione compatibile.
5. Raccogliere contatto essenziale e consensi obbligatori espliciti; il consenso marketing e separato, facoltativo e non preselezionato.
6. Confermare l'hold lato server e generare un codice casuale univoco. Nessuna conferma dipende dal solo frontend.
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

## Contratti API proposti

Le route seguenti sono un progetto, non API gia presenti nel repository.

| Metodo e percorso | Uso | Esito principale |
|---|---|---|
| `GET /api/v1/restaurants/{restaurantId}/availability?date=&time=&partySize=` | Cerca disponibilita; durata e regole sono risolte dal server. | Slot e soluzioni compatibili, mai autoritativi per la conferma. |
| `POST /api/v1/restaurants/{restaurantId}/reservation-holds` | Richiede hold per tavoli scelti o assegnazione automatica; richiede chiave idempotente. | Hold con scadenza, tavoli e token opaco. |
| `POST /api/v1/reservations` | Completa dati guest e consensi per un hold valido. | Codice conferma e stato server. |
| `GET /api/v1/reservations/{confirmationCode}` | Recupera la prenotazione tramite codice non enumerabile. | Dati minimi e operazioni consentite. |
| `POST /api/v1/reservations/{confirmationCode}/cancellation` | Richiede cancellazione secondo la policy attiva. | Stato aggiornato o richiesta di gestione manuale. |
| `GET /api/v1/admin/reservations?date=&status=` | Vista giornaliera per personale autorizzato. | Lista paginata e filtrata. |
| `POST /api/v1/admin/reservations` | Inserisce prenotazione telefonica/manuale. | Prenotazione con autore di audit. |
| `PATCH /api/v1/admin/reservations/{id}` | Modifica assegnazione, stato, coperti effettivi o eccezione. | Risorsa aggiornata con evento di audit. |
| `POST /api/v1/admin/table-blocks` | Blocca tavolo o area per un intervallo. | Blocco registrato e applicato alle ricerche successive. |

Le API amministrative richiedono identita e autorizzazioni server-side separate da quelle cliente; la SPA non deve contenere segreti amministrativi. Le route del provider di pagamento non fanno parte dell'MVP.

## Motore di disponibilita e concorrenza

- Validare sul server apertura, turno, chiusure, slot configurabili, durata e riassetto. Lo slot di arrivo non equivale alla durata occupata.
- Calcolare soluzioni da capienza e combinazioni configurate, escludendo prenotazioni attive, prenotazioni manuali e blocchi.
- L'endpoint di ricerca e informativo; la creazione dell'hold ripete tutte le verifiche in transazione.
- PostgreSQL serializza la selezione con lock delle righe tavolo in ordine deterministico e un vincolo di esclusione GiST sugli intervalli attivi per tavolo. Una collisione concorrente viene rifiutata e produce un nuovo risultato di disponibilita.
- Scadenza hold verificata a ogni operazione e pulita da un job periodico. Gli hold scaduti non occupano tavoli anche se il job non e ancora passato.
- Chiavi idempotenti per creazione/conferma; nessuna riga per minuto, gli slot sono configurabili a 15 o 30 minuti.
- Il cambiamento coperti/tavolo dopo conferma richiede una nuova allocazione atomica e genera un evento.

## Garanzia economica e privacy

La fase pagamenti e successiva all'affidabilita di hold, concorrenza e cancellazioni. Le opzioni future sono no-garanzia, preautorizzazione, deposito per persona/fisso o prepagamento, eventualmente limitati a gruppi o turni configurati. Policy, eccezioni, motivo di trattenuta e rimborsi sono tracciati; l'applicazione non inventa termini legali o importi.

Usare Checkout/Payment Element o tokenizzazione di un provider conforme. Persistono solo identificativi provider e stati; non memorizzare numero carta o CVV. I webhook verificati e idempotenti, non il redirect browser, determinano l'esito.

Raccogliere solo nome e recapito necessari; marketing separato. Retention configurabile, anonimizzazione/cancellazione e accesso per ruolo. Allergie e note sanitarie non entrano nel flusso base; se necessarie richiedono raccolta e retention separate.

## Migrazione e fasi

1. Mantenere menu JSON e SPA Angular; aggiungere un servizio Node.js API e PostgreSQL separati. La configurazione Render attuale e statica, quindi API e database richiedono servizi e variabili d'ambiente dedicati.
2. Creare schema e migrazioni senza importare prenotazioni: il repository non contiene prenotazioni persistenti. Configurare ristorante, sale, tavoli, orari e policy con dati approvati dal gestore; non introdurre una pianta dimostrativa in produzione.
3. MVP: disponibilita server-side, hold atomico, assegnazione cliente/ristorante, dati/consensi, conferma e cancellazione, area personale essenziale e audit.
4. Successivo: editor pianta, aggiornamenti disponibilita live, esportazione, notifiche e gestione avanzata delle eccezioni.
5. Ultimo: provider pagamenti, webhook e policy economiche approvate. Nessuna integrazione pagamenti prima dei test concorrenza/cancellazione.

## Verifiche richieste prima del rilascio

Test unitari di durata/capienza/combinazioni e transizioni; test PostgreSQL concorrenti sullo stesso tavolo e hold scaduti; test API di idempotenza e cancellazione; test webhook nella fase dedicata; E2E e accessibilita con tastiera, zoom 200% e viewport mobile. La disponibilita frontend non e mai una garanzia di prenotazione.
