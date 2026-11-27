# Piano operativo SaaS multi-tenant

## Scopo e perimetro iniziale

Costruire un servizio per più ristoranti senza duplicare applicazioni o database
per ogni cliente. L'app cliente resta pubblica via QR/link; il backoffice
richiede autenticazione. Ogni ristorante può gestire solo i propri dati e i
propri clienti/prenotazioni. Non aggiungere pagamenti, SMS o servizi a pagamento
in questa fase. Nessuna risorsa cloud a pagamento va attivata senza consenso.

Il piano gratuito è un vincolo per prototipi e pilot, non una garanzia di
disponibilità o capacità produttiva. Prima di creare risorse separate, verificare
limiti e fatturazione correnti degli account Render e Supabase. Il repository
configura Render con `plan: free`; lo stato del piano Supabase va controllato
nella console del progetto, non è deducibile dal codice.

## Stato verificato nel repository

- Il menu è una SPA Angular pubblica; oggi seleziona un `activeClient` statico
  in `src/assets/app-config.json`, non risolve il tenant da un URL.
- I contenuti pubblici sono letti da `restaurant_content`; i JSON sotto
  `src/assets/clients/` sono dati seed, non un editor.
- Esistono utenti Supabase Auth, membership e ruoli `owner`, `admin`, `staff`.
  Le API espongono la lista dei ristoranti dell'utente e una lista prenotazioni
  autorizzata per membership.
- Le policy RLS presenti concedono lettura ai membri. Non esiste un backoffice
  né un'API autenticata per modificare menu o configurazioni.
- Il menu e la disponibilità/prenotazione pubblici usano identificativi di
  ristorante nella richiesta. Questi endpoint non devono esporre dati gestionali
  o dati personali di altri tenant.
- È stato aggiunto `/admin` con login Supabase e lettura delle membership e
  prenotazioni via API. Il client Supabase usa la chiave pubblicabile (mai la
  `service_role`); il sito statico richiede `SUPABASE_PUBLISHABLE_KEY` nelle
  variabili Render. L'accesso non include registrazione pubblica.
- Il backoffice non modifica ancora menu, orari o disponibilità. Il primo owner
  e le membership vanno provisionati in modo controllato; non esiste ancora
  un'interfaccia di provisioning.
- `render.yaml` descrive un sito statico e un'API su Render; usa un solo set di
  risorse configurato e non definisce ambienti staging separati.
- La CI esegue test frontend e build mobile. Sono stati aggiunti controlli CI
  per la build e i test dell'API.

## Architettura obiettivo

1. Una sola applicazione cliente multi-tenant, con URL/QR per ristorante.
2. Un backoffice operatori distinto nel prodotto (inizialmente può condividere
   repository e API), con login Supabase e permessi verificati sul server.
3. Una console della piattaforma per provisioning e assistenza, separata dai
   ruoli del ristorante e non esposta come funzione admin pubblica.
4. Un database PostgreSQL condiviso con `restaurant_id` e controlli server-side
   per ogni dato privato. Mantenere RLS come difesa aggiuntiva e testare anche
   le query API che usano il pool backend.

Il menu pubblico resta visibile a chi possiede il link. L'isolamento garantisce
che un operatore veda e modifichi solo il proprio ristorante e che i dati
personali delle prenotazioni non siano visibili agli altri locali. Se in futuro
si richiede che i clienti finali non possano visitare il menu pubblico di un
altro locale, servirà autenticazione cliente o un requisito equivalente: il QR
pubblico, da solo, non può fornire tale restrizione.

## Ambienti remoti e segreti

| Ambiente | Uso | Dati e configurazione |
|---|---|---|
| Locale | Sviluppo e test | Dati sintetici; variabili impostate nella shell o nel profilo locale non versionato. `.env.example` è un modello e non viene caricato automaticamente. |
| CI | Test automatici | Nessun DB di produzione; test unitari/API senza segreti live. Test d'integrazione con PostgreSQL richiederanno un DB effimero o dedicato. |
| Staging | Prova pre-rilascio | Richiede progetto/database Supabase separato, API e sito separati e dati sintetici. Crearlo solo se la quota gratuita degli account lo consente; mai collegarlo al DB di produzione. |
| Produzione | Sito e API live attuali | Sito e API Render configurati nel Blueprint; Supabase remoto. Conservare segreti solo nelle impostazioni protette del provider. |

Regole operative:

- Non committare password, token, chiavi `service_role`, dump di clienti o file
  `.env`. La chiave pubblicabile Supabase non sostituisce l'autorizzazione API.
- Usare valori e credenziali distinti per locale, staging e produzione; il
  backend di staging non deve poter raggiungere il DB di produzione.
- Applicare migrazioni additive e compatibili prima del codice che le usa.
  Fare backup verificabile prima di ogni migrazione che modifica/elimina dati.
- Non copiare dati personali di produzione in staging. Usare clienti e
  prenotazioni sintetici.
- Prima di rilasciare: CI verde, test isolamento tra due tenant, controllo
  health/readiness, verifica log e piano di rollback dell'applicazione.
- Il piano gratuito può sospendere o limitare servizi. Finché resta gratuito,
  dichiarare il progetto un pilot/demo e non promettere SLA, uptime o backup
  gestiti senza averli verificati nel piano provider.

## Fasi e criteri di uscita

### Fase 0 — Baseline e qualità continua

- Congelare i flussi cliente attuali con test di menu, disponibilità,
  prenotazione e cancellazione.
- Eseguire build e test backend in CI insieme ai test frontend.
- Conservare il comportamento attuale della demo e non scrivere prenotazioni
  reali nei test.
- Il login/consultazione backoffice costituisce il primo slice implementato;
  il sito statico non lo abilita finché la chiave pubblicabile non è impostata
  nell'ambiente Render.

**Gate:** CI fallisce su errore TypeScript o test backend/frontend e passa
integralmente prima di ogni merge.

### Fase 1 — Confini tenant e ruoli

- Definire le autorizzazioni effettive di `owner`, `admin` e `staff`.
- Verificare tutte le route: autenticazione, membership sul ristorante richiesto,
  autorizzazione per operazione e query tenant-scoped. La protezione UI non è
  un controllo di sicurezza.
- Aggiungere casi incrociati con tenant A/utente A e tenant B/utente B:
  lettura, modifica, ID inesistente e token senza membership.
- Definire provisioning sicuro del primo owner e invito/rimozione operatori.

**Gate:** test automatizzati provano che A non legge né modifica dati privati di
B; accessi non autorizzati restituiscono errore senza side effect.

### Fase 2 — API e modello modificabile

- Definire schema e validazione server-side per profilo, menu, categorie,
  allergeni, orari, turni, tavoli/capienze, chiusure, regole e link/versioni dei
  documenti legali.
- Aggiungere API di lettura/scrittura protette da membership e ruolo.
- Tracciare autore e data delle modifiche; prevedere revisione/pubblicazione e
  recupero della versione precedente prima di esporre cambi al menu pubblico.
- Separare i dati pubblici da prenotazioni, contatti e altri dati privati.

**Gate:** test di schema, permessi, audit, pubblicazione e rollback; nessun
segreto o dato personale è incluso nell'endpoint pubblico menu.

### Fase 3 — Backoffice MVP

- Login/logout e selezione del ristorante tra le membership dell'utente.
- Editor profilo e contatti; poi menu/prezzi/allergeni; poi orari e regole,
  tavoli/capienze, chiusure e documenti.
- Vista prenotazioni giornaliera con filtri e azioni consentite per ruolo.
- Stati chiari per salvataggio, validazione, errore e pubblicazione; controlli
  responsive e accessibili.

**Gate:** un owner pilota configura un tenant di prova senza interventi manuali
su database o file JSON; uno staff vede solo le funzioni autorizzate.

### Fase 4 — URL cliente per tenant e flusso end-to-end

- Risolvere il locale da slug/host e caricare solo contenuti pubblicati di quel
  locale; mantenere URL demo esistenti durante la transizione.
- Generare URL/QR specifici e controllare anteprime/SEO per tenant.
- Verificare disponibilità → hold → conferma → consultazione → annullamento
  usando dati isolati e documenti di test.

**Gate:** test browser su due tenant, desktop e mobile; nessuna regressione nel
menu pubblico e nessuna prenotazione cross-tenant.

### Fase 5 — Pilot e operatività

- Onboarding controllato di pochi locali pilota, supporto e procedura di
  disattivazione/esportazione.
- Verificare backup, ripristino, log, errori, limiti del piano gratuito e
  contenimento dei dati personali.
- Tenere un rollback applicativo e non eseguire migrazioni distruttive durante
  il pilot.

**Gate:** prove di restore e checklist tenant/security completate prima di
allargare il pilot.

### Fase futura — Container e cloud scelto

Non selezionare oggi un provider cloud non richiesto. Quando sarà scelto:

1. Containerizzare prima l'API con immagine riproducibile, utente non-root,
   health check e nessun segreto nell'immagine.
2. Eseguire la stessa immagine in locale/staging/produzione, passando segreti e
   configurazione dall'ambiente o dal secret manager del provider.
3. Mantenere PostgreSQL come servizio persistente esterno o migrare DB con piano
   separato di backup, restore e cutover; non conservare dati nel filesystem
   effimero del container.
4. Pubblicare prima in staging, verificare migrazioni e flussi, poi spostare il
   traffico in modo reversibile.
5. Valutare il sito statico separatamente: non è necessario containerizzarlo
   solo perché l'API usa Docker.

La scelta del cloud, costi, rete, dominio, backup/SLA e migrazione database
restano decisioni future da fare con requisiti e preventivi reali.

## Decisioni commerciali ancora da prendere

Il repository non determina prezzo, modello di abbonamento, supporto,
contrattualistica, retention dei dati o eventuale white-label. Non sono stati
assunti né configurati pagamenti o servizi commerciali. Prima della vendita
servono decisioni esplicite su questi punti e una verifica legale/operativa
professionale adeguata al mercato in cui verrà offerto il servizio.
