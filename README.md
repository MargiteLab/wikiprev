# WikiPrev - Archivio di previsioni verificabili

Una piattaforma per raccogliere previsioni nel tempo e controllarle quando arriva la loro scadenza.

## Funzionalità
- Aggiunta di previsioni con autore, fonte, link, categoria, data della previsione e scadenza
- Ricerca, filtro per categoria e per intervallo di scadenza, ordinamento
- In evidenza la previsione con la scadenza più vicina, con priorità a quelle appena scadute
- Accesso riservato alle persone invitate, con link via email (senza password)
- Per ogni previsione si sa chi l'ha caricata

## Due modalità

- **Condivisa (Supabase):** i dati stanno in un database PostgreSQL su [Supabase](https://supabase.com)
  e li vedono tutte le persone invitate. Si attiva compilando `js/config.js`.
- **Locale:** se `js/config.js` è vuoto, le previsioni restano solo nel browser.
  Utile per provare l'interfaccia.

## Struttura del progetto

```
index.html                    struttura della pagina
css/style.css                 stili
js/config.js                  indirizzo e chiave pubblica di Supabase
js/model.js                   categorie predefinite e validazione
js/store-supabase.js          dati condivisi su Supabase
js/store-local.js             dati nel browser (modalità locale)
js/store.js                   sceglie la modalità
js/app.js                     interfaccia
supabase/migrations/          struttura del database, in file numerati
supabase/queries/             query di esempio per le statistiche
```

## Il database

Tabelle principali:

| Tabella | Contenuto |
|---|---|
| `profiles` | le persone che usano il sito (chi carica le previsioni) |
| `people` | chi fa le previsioni: persone, organizzazioni, gruppi |
| `outlets` | dove sono state pubblicate (testate, siti, programmi) |
| `categories` | le categorie |
| `predictions` | le previsioni, collegate a persona, fonte, categoria e utente |
| `prediction_history` | ogni inserimento e modifica, con la riga completa |

Regole per non perdere dati:
- **Le migrazioni non si modificano.** Una volta applicata, una migrazione resta com'è. Ogni cambiamento alla struttura va in un nuovo file numerato (`0003_...sql`).
- **Si aggiunge invece di rinominare.** Meglio aggiungere colonne o tabelle che rinominarle o eliminarle.
- **Il sito non cancella niente.** Una previsione eliminata viene solo nascosta (`deleted_at`), e `prediction_history` conserva ogni versione.
- **Nomi unici.** Persone e fonti con lo stesso nome, anche scritto con maiuscole diverse, sono la stessa riga. Questo rende affidabili le statistiche.

## Configurare Supabase (una volta sola)

1. Crea un account su [supabase.com](https://supabase.com) e un nuovo progetto. Per la regione, scegli una in Europa.
2. Applica lo schema. Nel progetto apri **SQL Editor** e incolla ed esegui, nell'ordine:
   1. il contenuto di `supabase/migrations/0001_initial_schema.sql`;
   2. il contenuto di `supabase/migrations/0002_example_predictions.sql`.
3. Chiudi le iscrizioni. In **Authentication → Sign In / Providers** disattiva *Allow new users to sign up* e lascia attivo il provider *Email*.
4. Indica l'indirizzo del sito. In **Authentication → URL Configuration** imposta *Site URL* all'indirizzo del sito (per esempio `https://tuonome.github.io/wikiprev/`) e aggiungilo anche tra i *Redirect URLs*.
5. Invita le persone. In **Authentication → Users → Invite user**, aggiungi la tua email e quella dei collaboratori. Il nome mostrato nel sito si cambia nella tabella `profiles`, colonna `display_name`, dal **Table Editor**.
6. Collega il sito. In **Project Settings → API** copia *Project URL* e la chiave *anon public* in `js/config.js`. Sono dati pubblici per natura: senza accesso non permettono di leggere niente.

## Pubblicare il sito

Il sito è statico, quindi qualunque hosting statico va bene:
- **GitHub Pages:** Settings → Pages → Deploy from a branch. È gratuito per i repository pubblici.
- **Netlify** o **Cloudflare Pages:** gratuiti anche con un repository privato.

Per provarlo in locale:

```bash
python3 -m http.server 8000
```

## Statistiche

`supabase/queries/statistiche.sql` contiene esempi da eseguire nel SQL Editor: chi carica più previsioni, chi ne fa di più, quali fonti ne pubblicano di più, quante ne scadono ogni mese.

## Licenza
GPL v3 - vedi il file LICENSE
