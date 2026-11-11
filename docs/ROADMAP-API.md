# Roadmap integrazioni API (LinkedIn, Reddit, Telegram, WhatsApp, Google Maps, OpenWeatherMap)

Creato: 2026-11-11. Fonte di verità dello stato: tabella `todos` della sessione + questo file.
Stati: [ ] da fare · [~] in corso · [x] fatto

## Progetti e repository
| Progetto | Repo | Stack |
|---|---|---|
| Menu Smart QR | federicocroletti-tech/menu-smart-qr | Angular, JSON mock, i18n it/en/fr/de |
| AirMap Italia GIS | federicocroletti-tech/airmap-italia-gis | Angular, GeoJSON/WMS/WFS |
| ETF Dip Alert | federicocroletti-tech/etf-dip-alert | alert ribassi ETF |
| Sito personale | federicocroletti-tech/federico-croletti-site | Angular Material, i18n |
| Sito Daniel Pantuso | (sito giardiniere, onrender.com) | sito vetrina |
| WhatsApp bot (esistente) | federicocroletti-tech/whatsapp-bot | Node.js, API Meta |

## App NUOVE (repo GitHub creati, privati, con solo README di specifiche)
| App | Repo | Locale | Stato |
|---|---|---|---|
| Bot Telegram per il ristoratore | federicocroletti-tech/ristoratore-telegram-bot | C:\Progetti\ristoratore-telegram-bot | repo creato, da implementare |
| Local Pack | federicocroletti-tech/local-pack | C:\Progetti\local-pack | repo creato, da implementare |

## Integrazioni su progetti ESISTENTI (registrate qui e nei todo di sessione)
- menu-smart-qr (clonato in C:\Progetti\menu-smart-qr): mappa, WhatsApp, meteo-menu
- it-lead-radar (repo esistente): sorgente Reddit per lead ristoratori + avviso Telegram (nessun repo nuovo)
- airmap-italia-gis, etf-dip-alert, federico-croletti-site, daniel-pantuso-giardiniere-site: vedi backlog
- Repo esistenti riusabili: whatsapp-bot (API Meta Node.js, per la fase 2 WhatsApp), local-demand-radar, moto-route-planner, taxi-opportunity-radar, stock-deep-alert, crypto-deep-alert (possibile canale Telegram condiviso)

## Fase 1 (in corso): Menu Smart QR, mappa + prenotazione WhatsApp
- [~] msq-map: mappa Google Maps + "Portami lì"
- [ ] msq-whatsapp: prenotazione/ordine via WhatsApp (link wa.me, fase 1 senza API a pagamento)
- [ ] msq-tests: test e verifica build/lint

### Decisioni di design
- Config per cliente in `client.json`: `location { address, lat, lng, placeId, mapsUrl, openingHours }`,
  `whatsapp { phone (E.164), enableReservation, defaultMessage }`, flag `enableMap`.
- Mappa: embed lazy (nessuna chiave per l'embed semplice; chiave Maps Embed API se serve il marker custom). Restringere la chiave per referrer HTTP.
- WhatsApp fase 1: `https://wa.me/<numero>?text=<messaggio url-encoded>`. Nessun dato salvato lato server (GDPR).
- Tutti i testi nei file i18n it/en/fr/de.

## Backlog
### Menu Smart QR
- [ ] msq-meteo-menu: menu sensibile al meteo (OpenWeatherMap), tag piatto
- [ ] msq-telegram-owner: bot Telegram per il ristoratore (piatto del giorno, disponibilità)
- [ ] msq-reddit-leads: lead da Reddit con avviso Telegram
### AirMap Italia GIS
- [ ] airmap-layer, airmap-alerts, airmap-geocoding, airmap-reddit
### ETF Dip Alert
- [ ] etf-telegram, etf-reddit-sentiment, etf-linkedin
### Sito personale
- [ ] site-live-widgets, site-linkedin-login, site-telegram-contacts, site-map-clients
### Sito Daniel Pantuso
- [ ] daniel-weather-calendar, daniel-quote-map, daniel-whatsapp-quote
### Prodotto
- [ ] local-pack: pacchetto replicabile per attività locali

## Prompt pronti
### P1 - Mappa in Menu Smart QR
> Nel progetto Menu Smart QR aggiungi la mappa del locale. Estendi `client.model.ts` e `client.json` con `location` (address, lat, lng, placeId, mapsUrl, openingHours) e il flag `enableMap`. Crea `RestaurantMapComponent` standalone con embed Google Maps caricato in lazy (IntersectionObserver), pulsante "Portami lì" con link alle indicazioni, orari di apertura, stati loading/error e fallback senza mappa. Integralo in `RestaurantHeaderComponent`/`MenuPageComponent` solo se `enableMap` è true. Aggiungi le traduzioni it/en/fr/de. Non rompere i clienti senza `location`. Aggiungi test e lancia build e lint.

### P2 - Prenotazione WhatsApp in Menu Smart QR
> Aggiungi la prenotazione via WhatsApp. Estendi il modello cliente con `whatsapp { phone, enableReservation, defaultMessage }`. Crea `WhatsappService` che genera il link `https://wa.me/<numero>?text=...` (numero E.164 validato, testo URL-encoded). Crea `ReservationCtaComponent` con un form (nome, persone, data, ora, note) validato, che compone il messaggio localizzato e apre WhatsApp. Mostralo solo se `enableReservation` è true. Traduzioni it/en/fr/de. Test unitari su generazione URL e validazione.

### P3 - Menu sensibile al meteo
> Aggiungi `WeatherService` con OpenWeatherMap (chiave in environment, cache 30 min). Aggiungi ai piatti il campo opzionale `weatherTags` (hot, cold, rainy). In `RecommendedSectionComponent` metti in evidenza i piatti coerenti col meteo attuale del locale (lat/lng da `location`), con fallback silenzioso se l'API non risponde.

### P4 - Bot Telegram per il ristoratore
> Crea un piccolo servizio (Node o Cloudflare Worker) con bot Telegram: `/piatto_del_giorno`, `/finito <piatto>`, `/disponibile <piatto>`, `/orari`. Accesso limitato a chat ID autorizzati. Persistenza dei dati su storage semplice e lettura da Menu Smart QR.

(Altri prompt da scrivere quando si passa alle rispettive voci.)

## Note e limiti API
- LinkedIn: niente lettura profili altrui senza partner program; per ora solo login OIDC/condivisione con approvazione.
- WhatsApp Cloud API: serve account Meta Business e template approvati; costi per conversazione.
- Reddit: limiti di rate e termini sull'uso commerciale dei dati.
- Google Maps: chiave con fatturazione, restringere per referrer/API.
- GDPR: informativa e minimizzazione dei dati.

## Registro avanzamento
- 2026-11-11: roadmap creata, 21 task inseriti. Avviata la Fase 1 (Menu Smart QR).
- 2026-11-11: analizzato il codice di menu-smart-qr (Angular 22, ContactBar con wa.me e mapsUrl già presenti; nessuna modifica al codice ancora). Creati i repo ristoratore-telegram-bot e local-pack con README. Monitor Reddit spostato come estensione di it-lead-radar.
- 2026-11-11 (chiusura giornata): nessun codice applicativo modificato. Repo nuovi pubblicati su main, roadmap versionata in questo file (copia di lavoro anche nella cartella di sessione Copilot). Nessun branch o PR aperto.
- Per ripartire: `cd C:\Progetti\menu-smart-qr; npm install; npm test`, poi usare i prompt P1 e P2 (mappa e WhatsApp). Task `msq-map` in corso, `msq-whatsapp` da fare.
- Prossimo passo: implementare mappa (embed senza chiave + directions) e form prenotazione WhatsApp in menu-smart-qr (util con spec, componenti RestaurantMap e ReservationForm, flag showMap/enableReservations, i18n it/en/fr/de). node_modules non ancora installato (serve npm install).
