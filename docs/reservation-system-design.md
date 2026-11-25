# Progetto del sistema di prenotazione

## Stato attuale verificato

Menu Smart QR e una SPA Angular standalone, con contenuti caricati da JSON statici tramite `HttpClient`. E stata aggiunta una fondazione API Node.js/Express con schema e runner di migrazione PostgreSQL, ma non e ancora collegata alla UI e non e configurata nella pubblicazione statica di `render.yaml`. Il backend ora include la verifica server-side dei token Supabase Auth, la tabella membership e policy RLS di sola lettura per tenant; la migrazione non e ancora stata applicata o verificata su un progetto Supabase reale. Il pannello amministrativo e le relative API restano da implementare.

Il controllo prenotazioni esistente e un modulo di contatto WhatsApp: raccoglie nome, telefono, data, ora, coperti e note, poi compone un messaggio. Non verifica orari o disponibilita e non crea una prenotazione confermata; si trova in `src/app/features/menu/components/reservation-panel/`. L'API ora implementa ricerca di disponibilita, hold temporaneo, conferma, recupero e cancellazione tramite codice, ma schema e concorrenza non sono stati verificati con un PostgreSQL reale. Build TypeScript e test senza database passano.

Il codice copre solo un primo backend tecnico: il flusso cliente, i dati reali di configurazione del ristorante, API amministrative, ruoli, notifiche e pagamenti non sono implementati.

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

Le route cliente e la route membership sono implementate in `server/src/app.ts`; le route amministrative di prenotazione sono ancora proposte. L'autenticazione Supabase e validazione PostgreSQL restano da completare con un progetto reale.

| Metodo e percorso | Stato | Uso ed esito principale |
|---|---|---|
| `GET /api/v1/restaurants/{restaurantId}/availability?date=&time=&partySize=` | Implementata, non verificata con DB | Cerca una data e ora specifiche; durata e regole vengono risolte dal server. L'esito non garantisce il tavolo. |
| `POST /api/v1/restaurants/{restaurantId}/reservation-holds` | Implementata, non verificata con DB | Richiede un hold per tavoli scelti o assegnazione automatica e una chiave idempotente. Restituisce scadenza, tavoli e token. |
| `POST /api/v1/reservations` | Implementata, non verificata con DB | Registra dati guest e consensi per un hold valido e restituisce codice/stato. |
| `GET /api/v1/reservations/{confirmationCode}` | Implementata, non verificata con DB | Recupera dati minimi con il codice di conferma. |
| `POST /api/v1/reservations/{confirmationCode}/cancellation` | Implementata, non verificata con DB | Cancella la prenotazione e segnala se la richiesta e oltre il termine; non esegue trattenute. |
| `GET /api/v1/me/restaurants` | Implementata, API testata con verifier/store mock; RLS non verificata su DB reale | Richiede un access token Supabase valido e delega la lettura delle membership alla sessione PostgreSQL con ruolo `authenticated`. |
| `GET /api/v1/admin/reservations?date=&status=` | Proposta | Vista giornaliera per personale autorizzato. |
| `POST /api/v1/admin/reservations` | Proposta | Inserisce prenotazione telefonica/manuale. |
| `PATCH /api/v1/admin/reservations/{id}` | Proposta | Modifica assegnazione, stato, coperti effettivi o eccezione. |
| `POST /api/v1/admin/table-blocks` | Proposta | Blocca tavolo o area per un intervallo. |

Le API amministrative richiedono identita e autorizzazioni server-side separate da quelle cliente; la SPA non deve contenere credenziali database o chiavi `service_role`. Il primo accesso staff e in sola lettura e richiede una membership provisionata dal titolare; non esiste ancora un flusso di invito o bootstrap del proprietario. Le route del provider di pagamento non fanno parte dell'MVP.

## Motore di disponibilita e concorrenza

- Validare sul server apertura, turno, chiusure, slot configurabili, durata e riassetto. Lo slot di arrivo non equivale alla durata occupata.
- Calcolare soluzioni da capienza e combinazioni configurate, escludendo prenotazioni attive, prenotazioni manuali e blocchi.
- L'endpoint di ricerca e informativo; la creazione dell'hold ripete tutte le verifiche in transazione.
- Il servizio implementa lock delle righe tavolo in ordine deterministico e la migrazione definisce un vincolo di esclusione GiST sugli intervalli attivi. Una collisione concorrente e gestita come conflitto; questa proprieta non e stata ancora verificata su PostgreSQL reale.
- La scadenza viene controllata nel servizio e pulita da un job periodico. La durata e configurabile tra 5 e 10 minuti; lo schema usa 7 minuti come valore iniziale.
- Chiavi idempotenti per creazione/conferma; nessuna riga per minuto, gli slot sono configurabili a 15 o 30 minuti.
- Il cambiamento coperti/tavolo dopo conferma richiede una nuova allocazione atomica e genera un evento.

## Garanzia economica e privacy

La fase pagamenti e successiva all'affidabilita di hold, concorrenza e cancellazioni. Le opzioni future sono no-garanzia, preautorizzazione, deposito per persona/fisso o prepagamento, eventualmente limitati a gruppi o turni configurati. Policy, eccezioni, motivo di trattenuta e rimborsi sono tracciati; l'applicazione non inventa termini legali o importi.

Usare Checkout/Payment Element o tokenizzazione di un provider conforme. Persistono solo identificativi provider e stati; non memorizzare numero carta o CVV. I webhook verificati e idempotenti, non il redirect browser, determinano l'esito.

Raccogliere solo nome e recapito necessari; marketing separato. Retention configurabile, anonimizzazione/cancellazione e accesso per ruolo. Allergie e note sanitarie non entrano nel flusso base; se necessarie richiedono raccolta e retention separate.

## Migrazione e fasi

1. Completato in parte: aggiunti servizio Node.js API, schema PostgreSQL, runner migrazione, verifica server-side dei token Supabase e policy RLS di lettura per membership e dati tenant. Il menu JSON e la SPA restano indipendenti; la configurazione Render e ancora statica. Le route pubbliche booking restano sul server e usano i codici casuali; la chiave DB deve rimanere solo nell'ambiente server. Autenticazione, policy e connessione non sono state ancora verificate su un progetto Supabase reale.
2. Configurare il servizio API e i segreti in un ambiente server; applicare e verificare le migrazioni su Supabase, inclusi test con due utenti e due ristoranti; configurare ristorante, sale, tavoli, orari e policy con dati approvati dal gestore. Non introdurre una pianta dimostrativa in produzione.
3. MVP successivo: integrazione frontend, dati reali di configurazione, test transazionali su PostgreSQL, area personale essenziale, audit e verifica del flusso completo.
4. Successivo: autenticazione/ruoli amministrativi, dashboard, editor pianta, aggiornamenti disponibilita live, esportazione, notifiche e gestione avanzata delle eccezioni.
5. Ultimo: provider pagamenti, webhook e policy economiche approvate. Nessuna integrazione pagamenti prima dei test concorrenza/cancellazione.

## Verifiche richieste prima del rilascio

Test unitari di durata/capienza/combinazioni e transizioni; test PostgreSQL concorrenti sullo stesso tavolo e hold scaduti; test API di idempotenza e cancellazione; test webhook nella fase dedicata; E2E e accessibilita con tastiera, zoom 200% e viewport mobile. La disponibilita frontend non e mai una garanzia di prenotazione.
