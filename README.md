# Menu Smart QR

Menu Smart QR e una web app Angular per creare menu digitali consultabili via QR code per ristoranti, bar, pub e pizzerie.

## Obiettivo commerciale

Offrire una demo professionale, responsive e multilingua configurabile per più locali, con PostgreSQL come archivio runtime dei dati.

## Funzionalita principali

- Menu Angular pubblico, senza login
- Dati menu, cliente e allergeni letti da PostgreSQL; i JSON nel repository sono il seed iniziale
- Multi-cliente tramite `app-config.json`
- Multilingua UI: italiano, inglese, francese, tedesco
- Theme personalizzabile per cliente
- SEO base (title, description, Open Graph, canonical, JSON-LD)
- Ricerca e filtri menu
- Sezioni consigliati, categorie dinamiche, contatti e orari
- Mappa Google Maps nel footer, caricata su richiesta e configurabile per cliente con `contacts.mapsUrl` e il flag `showMap` (attiva se omesso, disattivata con `false`)
- Immagini dei piatti lazy e opzionali tramite `imageUrl`, `imageAlt` e `showImages`
- Ricerca senza distinzione di accenti in nomi, descrizioni, ingredienti, tag, note e codici; filtri disponibilità/categorie e ripristino filtri
- Carrello per ristorante persistito localmente, con totale, quantità accessibili e invio WhatsApp
- Prenotazioni con richiesta WhatsApp di fallback, scelta/assegnazione tavolo, scadenza hold visibile e gestione tramite codice di conferma
- Design responsive mobile-first
- Componenti Ionic per selezione lingua, ricerca e navigazione tra categorie
- App Android e iOS basate sulla stessa applicazione Angular tramite Capacitor
- API Node.js/Express per contenuti e prenotazioni, con persistenza PostgreSQL

## Stack tecnico

- Angular (standalone components)
- TypeScript
- SCSS
- RxJS
- JSON in `src/assets` come seed iniziale per PostgreSQL
- Ionic UI per controlli mobile multipiattaforma
- Capacitor per il packaging cross-platform su Android e iOS
- Node.js, Express e PostgreSQL per la fondazione API prenotazioni

## App mobile cross-platform

L'app mobile riutilizza la stessa UI e logica Angular della web app. Capacitor la
esegue in una WebView e fornisce i progetti nativi Android e iOS: non viene
mantenuta una seconda implementazione nativa.

Ionic fornisce i controlli adattivi per la ricerca, la selezione della lingua e
le categorie; menu, dati, temi e regole applicative restano condivisi con Angular.

Installa le dipendenze, genera le piattaforme una volta e sincronizza gli asset web:

```powershell
npm ci
npx cap add android
npx cap add ios
$env:API_BASE_URL = "https://menu-smart-qr-api.onrender.com"
npm run build:mobile
```

Apri il progetto della piattaforma da compilare:

```bash
npm run cap:open:android
npm run cap:open:ios
```

La build pubblica è una SPA statica. `npm run build` inietta nel documento HTML
iniziale title, description, lingua e Open Graph del cliente selezionato, così
anche crawler e anteprime social ricevono metadati senza eseguire JavaScript.
Configura `seo.canonicalUrl` e `seo.ogImage` con URL reali del cliente prima
della pubblicazione. `npm run build:mobile` genera i file web e li sincronizza
nei progetti Android e iOS. Android richiede Android Studio,
Android SDK e JDK 21; da Windows puoi generare l'APK debug con:

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21"
cd android
.\gradlew.bat assembleDebug
```

L'APK è scritto in `android/app/build/outputs/apk/debug/app-debug.apk`.
Compilazione e firma iOS richiedono macOS e Xcode. Per il web, pubblica
`dist/menu-smart-qr/browser` su un hosting statico con fallback delle rotte
verso `index.html` (il file `render.yaml` contiene la configurazione Render).

## PostgreSQL, Supabase e API

Le migrazioni `001`-`005` sono state applicate al progetto Supabase e i dati
iniziali dei tre locali demo sono stati importati. L'API pubblica su Render e
la verifica disponibilità del demo Pizzeria Vesuvio sono state provate live.
La migrazione `005` aggiunge configurazione dimostrativa di turni e tavoli solo
per Pizzeria Vesuvio; non costituisce una planimetria o disponibilità reale di
un locale operativo.

L'app legge profilo, allergeni, indice menu e categorie dall'endpoint
`GET /api/v1/restaurants/:id/content`; l'API Express li legge dalla tabella
`restaurant_content`. Le prenotazioni sono controllate e confermate tramite
l'API, che registra hold, ospite, conferma e consensi in PostgreSQL. Il menu e
il profilo non hanno ancora una schermata di modifica: il seed JSON inserisce
solo i record mancanti e non sovrascrive i dati esistenti; dopo l'importazione il
database resta la fonte runtime.

Se `API_BASE_URL` non è configurato, il sito mostra i contenuti JSON inclusi in
modalità demo e disabilita ordini e prenotazioni, con un avviso visibile. Se
l'API è configurata ma non raggiungibile, il sito mostra l'errore senza
ripiegare silenziosamente sui dati demo.

Il blueprint `render.yaml` configura il sito statico e l'API Node su Render. Il
database rimane su Supabase. Nel servizio API Render, imposta queste variabili:

- `DATABASE_URL` è preconfigurato con l'endpoint Session Pooler Supabase senza
  password.
- `DATABASE_PASSWORD`: password PostgreSQL Supabase, inserita come segreto Render
  separato. Non richiede percent-encoding.
- `SUPABASE_URL` e `ALLOWED_ORIGINS` sono preconfigurati nel blueprint per i
  servizi correnti; aggiorna `ALLOWED_ORIGINS` se cambia il dominio del sito.
- `SUPABASE_PUBLISHABLE_KEY`: valore `publishable` dal progetto Supabase.
- Per il sito statico, `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` sono
  utilizzati solo dal login del backoffice. La chiave `publishable` è destinata
  al browser; non inserire mai `service_role` o credenziali database nel sito.
  Configura la chiave anche nel servizio statico Render: il blueprint la
  dichiara senza un valore predefinito.
- `DATABASE_SSL=require` obbliga la connessione TLS; per il pooler Supabase il
  driver non verifica la catena del certificato. Per verificare anche
  l'identità del server, configura nel driver il certificato CA Supabase.
  `IDEMPOTENCY_SECRET` viene generato dal blueprint.
- `API_BASE_URL` è collegato automaticamente all'host dell'API Render.

Non inserire credenziali nel repository. Dopo il deploy iniziale, il comando
`server:deploy` applica le migrazioni e importa i dati JSON iniziali. In locale,
configura le variabili di `server/.env.example` nel tuo ambiente (il file è un
modello e non viene caricato automaticamente), poi esegui:

```powershell
npm run server:build
npm run server:migrate
npm run server:seed
npm run server:start
```

In un secondo terminale, `npm start` avvia Angular e inoltra `/api` a
`localhost:3000`. Verifica API e log di deploy; `npm run server:test` esegue i
test HTTP/unitari e `npm run server:build` controlla la compilazione del server.
Per creare una build mobile da collegare all'API remota, imposta `API_BASE_URL`
all'URL HTTPS del servizio API prima di `npm run build:mobile`. Il piano gratuito
Render è adatto a prove, ma può sospendere il servizio API dopo inattività; per
prenotazioni in produzione seleziona un piano sempre attivo.

**Il demo Pizzeria Vesuvio restituisce disponibilità per gli orari configurati,
ma la conferma dal sito resta disabilitata finché non vengono pubblicati URL
validi per `bookingTermsUrl` e `privacyNoticeUrl` nel profilo del ristorante.**
Le tabelle attuali sono dimostrative e non descrivono una sala reale. Bar Milano
e The Corner Pub non hanno ancora una configurazione di prenotazione equivalente.

Il backoffice non include ancora funzioni per modificare menu, orari, tavoli,
regole o documenti. Per il piano multi-ristorante, i limiti attuali e la
gestione prudente degli ambienti, vedere
[il piano operativo SaaS multi-tenant](./docs/saas-multitenant-rollout.md).
La pagina di accesso del backoffice è disponibile su `/admin`; nella prima
versione consente accesso e consultazione delle prenotazioni per le membership
già provisionate, non la modifica dei contenuti.

Il pannello cliente consente di recuperare una prenotazione con il codice di
conferma e, se ancora cancellabile, di richiederne la cancellazione. Durante la
prenotazione online, la UI mostra il timer dell'hold e i nomi dei tavoli
restituiti dall'API; il cliente può scegliere una combinazione disponibile o
lasciare l'assegnazione al ristorante. Se l'API o i documenti legali non
consentono la prenotazione online, il pannello può aprire una richiesta
WhatsApp, controllata dal flag `enableReservationWhatsappFallback` e
`reservations.whatsappFallbackEnabled`. La richiesta WhatsApp non è una
prenotazione confermata: il locale deve rispondere e confermare.

## Avvio progetto

Se il repository include `package.json`:

```bash
npm install
npm run start
```

In alternativa, puoi usare comandi Angular CLI equivalenti nel tuo workspace.

## Struttura cartelle (estratto)

```text
src/
  app/
    core/
      models/
      services/
    features/menu/
      pages/menu-page/
      components/
    shared/
      pipes/
      utils/
  assets/
    app-config.json
    i18n/
      it.json
      en.json
      fr.json
      de.json
    clients/
      pizzeria-vesuvio/
      bar-milano/
      the-corner-pub/
```

## Come cambiare cliente demo

Modifica `src/assets/app-config.json`:

```json
{
  "activeClient": "pizzeria-vesuvio"
}
```

Valori demo disponibili:

- `pizzeria-vesuvio`
- `bar-milano`
- `the-corner-pub`

## Dati iniziali dei clienti

Ogni cliente ha la sua cartella:

`src/assets/clients/{client-id}/`

File principali:

- `client.json` (branding, contatti, SEO, feature flags, orari, note)
- `allergens.json`
- `menu/index.json` (config categorie)
- `menu/*.json` (dati categoria con items)

`npm run server:seed` importa i contenuti nel database solo quando il record non
esiste già. L'app legge i dati dal database; non esiste ancora un pannello admin
per modificarli. Dopo l'import iniziale, aggiorna il contenuto tramite Supabase
SQL/API amministrativa, non modificando soltanto i JSON locali.

## Abilitare/disabilitare categorie menu

Nel file `menu/index.json`, per ogni categoria:

```json
{
  "id": "antipasti",
  "enabled": true,
  "file": "antipasti.json"
}
```

Imposta `enabled: false` per nascondere la categoria senza toccare il codice.

## Aggiungere una nuova categoria

1. Crea il file categoria, esempio:
   `src/assets/clients/{client-id}/menu/insalate.json`
2. Inserisci struttura categoria con `id`, `name`, `order`, `enabled`, `items`.
3. Aggiungi la categoria in `menu/index.json` con `file: "insalate.json"`.
4. Verifica che ogni item abbia i campi richiesti (`id`, `name`, `description`, `price`, `currency`, flags, `order`, ...).

## Modificare un piatto

Apri il file della categoria e aggiorna il blocco item:

- nome e descrizione localizzate (`it`, `en`, `fr`, `de`)
- prezzo e valuta
- allergeni
- disponibilita e badge (`recommended`, `vegetarian`, `vegan`, `spicy`, `glutenFree`)

## Gestione lingue

- Lingue supportate UI: `it`, `en`, `fr`, `de`
- Traduzioni UI in `src/assets/i18n/*.json`
- Lingua utente salvata in `localStorage`
- Fallback testo localizzato:
  1. lingua corrente
  2. italiano
  3. inglese
  4. primo valore disponibile
  5. stringa vuota

## Cambiare colori e tema

Nel `client.json` modifica:

```json
"theme": {
  "primary": "#C62828",
  "secondary": "#F9A825",
  "background": "#FFF8F2",
  "surface": "#FFFFFF",
  "text": "#212121",
  "muted": "#4B5563",
  "border": "#D1D5DB"
}
```

Questi valori vengono convertiti in CSS variables globali.

## Pubblicare il sito

Puoi pubblicare la build statica su:

- Netlify
- Vercel
- GitHub Pages
- Hosting statico tradizionale (Nginx/Apache/CDN)

La pipeline GitHub Actions esegue i test, sincronizza Capacitor e compila un APK
debug per ogni push su `main` e pull request verso `main`. L'APK viene allegato
come artifact al workflow; la firma per Google Play richiede credenziali Android
protette e va configurata separatamente prima del rilascio pubblico.

## Generare QR code

1. Pubblica il sito e copia URL finale.
2. Genera un QR code con un servizio/tool a scelta.
3. Inserisci il QR su tavoli, menu cartacei, vetrofanie o tovagliette.

## Roadmap futura (V2+)

- Collegamento del flusso Angular all'API prenotazioni
- Pannello admin
- Gestione dinamica menu
- Gestione ordini via WhatsApp
- Prenotazione tavolo
- Analytics
- Integrazione recensioni Google
- Modello multitenant SaaS
