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

Le migrazioni `001`-`003` sono state applicate al progetto Supabase e i dati
iniziali dei tre locali demo sono stati importati. La connessione dell'API
pubblica su Render non è ancora verificata: prima di considerare attive le
prenotazioni configura le variabili indicate qui sotto e inserisci i dati reali
di turni, tavoli e documenti legali.

L'app legge profilo, allergeni, indice menu e categorie dall'endpoint
`GET /api/v1/restaurants/:id/content`; l'API Express li legge dalla tabella
`restaurant_content`. Le prenotazioni sono controllate e confermate tramite
l'API, che registra hold, ospite, conferma e consensi in PostgreSQL. Il menu e
il profilo non hanno ancora una schermata di modifica: il seed JSON inserisce
solo i record mancanti e non sovrascrive i dati esistenti; dopo l'importazione il
database resta la fonte runtime.

Il blueprint `render.yaml` configura il sito statico e l'API Node su Render. Il
database rimane su Supabase. Prima del deploy, aggiungi nel servizio API Render
le variabili segrete:

- `DATABASE_URL`: stringa PostgreSQL Supabase, preferibilmente session pooler.
- `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`: valori dal progetto Supabase.
- `DATABASE_SSL=require`; `IDEMPOTENCY_SECRET` viene generato dal blueprint.
- `ALLOWED_ORIGINS`: URL HTTPS del sito statico Render, inserito nel servizio API.
- `API_BASE_URL` è collegato automaticamente all'host dell'API Render.

Non inserire credenziali nel repository. Dopo il deploy iniziale, il comando
`server:deploy` applica le migrazioni e importa i dati JSON iniziali. In locale,
configura le variabili di `server/.env.example` nel tuo ambiente, poi esegui:

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

**Le prenotazioni online restano disabilitate finché il ristorante non configura
in Supabase gli orari/turni, la sala e i tavoli, e in `client_data.reservations`
i campi `bookingTermsUrl`, `privacyNoticeUrl`, `bookingTermsVersion` e
`privacyNoticeVersion`.** Questa configurazione è
necessaria: il repository non contiene una planimetria reale né documenti legali
da pubblicare. Il form non invia una conferma se i link legali non sono validi.

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
