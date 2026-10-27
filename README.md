# Menu Smart QR

Menu Smart QR e una web app Angular per creare menu digitali consultabili via QR code per ristoranti, bar, pub e pizzerie.

## Obiettivo commerciale

Offrire una demo professionale, responsive e multilingua che puo essere personalizzata rapidamente per clienti diversi cambiando solo file JSON.

## Funzionalita principali

- Frontend-only (nessun backend nella V1)
- Nessun login
- Dati menu, cliente e allergeni da JSON
- Multi-cliente tramite `app-config.json`
- Multilingua UI: italiano, inglese, francese, tedesco
- Theme personalizzabile per cliente
- SEO base (title, description, Open Graph, canonical, JSON-LD)
- Ricerca e filtri menu
- Sezioni consigliati, categorie dinamiche, contatti e orari
- Design responsive mobile-first
- App Android e iOS basate sulla stessa applicazione Angular tramite Capacitor

## Stack tecnico

- Angular (standalone components)
- TypeScript
- SCSS
- RxJS
- JSON statici in `src/assets`
- Capacitor per il packaging cross-platform su Android e iOS

## App mobile cross-platform

L'app mobile riutilizza la stessa UI e logica Angular della web app. Capacitor la
esegue in una WebView e fornisce i progetti nativi Android e iOS: non viene
mantenuta una seconda implementazione nativa.

Installa le dipendenze, genera le piattaforme una volta e sincronizza gli asset web:

```bash
npm ci
npx cap add android
npx cap add ios
npm run build:mobile
```

Apri il progetto della piattaforma da compilare:

```bash
npm run cap:open:android
npm run cap:open:ios
```

Android richiede Android Studio e Android SDK. Compilazione e firma iOS richiedono
macOS e Xcode. Dopo aver modificato l'app Angular, esegui `npm run build:mobile`
per ricostruire gli asset e sincronizzarli nei progetti nativi.

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

## Come modificare dati cliente

Ogni cliente ha la sua cartella:

`src/assets/clients/{client-id}/`

File principali:

- `client.json` (branding, contatti, SEO, feature flags, orari, note)
- `allergens.json`
- `menu/index.json` (config categorie)
- `menu/*.json` (dati categoria con items)

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

## Generare QR code

1. Pubblica il sito e copia URL finale.
2. Genera un QR code con un servizio/tool a scelta.
3. Inserisci il QR su tavoli, menu cartacei, vetrofanie o tovagliette.

## Roadmap futura (V2+)

- Backend API
- Pannello admin
- Gestione dinamica menu
- Gestione ordini via WhatsApp
- Prenotazione tavolo
- Analytics
- Integrazione recensioni Google
- Modello multitenant SaaS
