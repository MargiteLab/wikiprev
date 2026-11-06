# WikiPrev - Archivio di previsioni verificabili

Una piattaforma per raccogliere previsioni nel tempo e controllarle quando arriva la loro scadenza.

## Funzionalità
- Aggiunta di previsioni con autore, fonte, link, categoria, data della previsione e scadenza
- Ricerca, filtro per categoria e per intervallo di scadenza, ordinamento
- In evidenza la previsione con la scadenza più vicina, con priorità a quelle appena scadute
- Nessun accesso con email: per aggiungere una previsione basta scrivere il proprio nome
- Per ogni previsione si sa chi l'ha caricata
- Solo l'amministratore, con un codice segreto, può eliminare le previsioni
- Nuove categorie si aggiungono direttamente dal modulo ("+ Nuova categoria…")

## Due modalità

- **Condivisa (Supabase):** i dati stanno in un database PostgreSQL su [Supabase](https://supabase.com)
  e li vede chiunque abbia l'indirizzo del sito. Si attiva compilando `js/config.js`.
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
| `contributors` | chi carica le previsioni, riconosciuto dal nome che scrive |
| `profiles` | account con email (per ora non usati, pronti per un accesso futuro) |
| `people` | chi fa le previsioni: persone, organizzazioni, gruppi |
| `outlets` | dove sono state pubblicate (testate, siti, programmi) |
| `categories` | le categorie (si aggiungono anche dal sito; si rinominano o eliminano dal Table Editor) |
| `predictions` | le previsioni, collegate a persona, fonte, categoria e utente |
| `prediction_history` | ogni inserimento e modifica, con la riga completa |

Regole per non perdere dati:
- **Le migrazioni non si modificano.** Una volta applicata, una migrazione resta com'è. Ogni cambiamento alla struttura va in un nuovo file numerato (`0003_...sql`).
- **Si aggiunge invece di rinominare.** Meglio aggiungere colonne o tabelle che rinominarle o eliminarle.
- **Il sito non cancella niente.** Una previsione eliminata viene solo nascosta (`deleted_at`), e `prediction_history` conserva ogni versione.
- **Nomi unici.** Persone, fonti e chi carica, con lo stesso nome anche scritto con maiuscole diverse, sono la stessa riga. Questo rende affidabili le statistiche.
- **Scritture controllate.** I visitatori possono solo leggere le tabelle. Aggiungono passando dalla funzione `submit_prediction`, che controlla i dati. Eliminare (`delete_prediction`) richiede il codice amministratore, salvato nel database solo in forma cifrata.

**Attenzione:** senza accesso, chiunque conosca l'indirizzo del sito può aggiungere previsioni e può scrivere un nome non suo. Un'eliminazione si annulla dal **Table Editor** svuotando `deleted_at` della previsione.

## Configurare Supabase (una volta sola)

1. Crea un account su [supabase.com](https://supabase.com) e un nuovo progetto. Per la regione, scegli una in Europa.
2. Applica lo schema. Nel progetto apri **SQL Editor** e incolla ed esegui, uno alla volta e nell'ordine, i file di `supabase/migrations/`:
   1. `0001_initial_schema.sql`
   2. `0002_example_predictions.sql`
   3. `0003_open_access_with_names.sql`
   4. `0004_admin_only_delete.sql`
   5. `0005_categories_tav_and_user_defined.sql`
   6. `0006_tav_predictions.sql`
   7. `0007_tav_la_stampa_2002.sql`
   8. `0008_tav_la_stampa_2002_link.sql`
3. Scegli il codice amministratore. Sempre nel SQL Editor esegui, con un codice lungo almeno 12 caratteri scelto da te:
   ```sql
   select public.set_admin_code('il-tuo-codice-segreto');
   ```
   Poi sul sito apri **Amministrazione** (in fondo alla pagina) e inseriscilo: il tuo browser lo ricorderà e ti mostrerà i pulsanti "Elimina". Per cambiarlo, riesegui lo stesso comando con un codice nuovo. Non salvarlo nel repository.
4. Collega il sito. In **Project Settings → API** copia *Project URL* e la chiave *anon public* in `js/config.js`. Sono dati pubblici per natura: permettono solo ciò che il database consente ai visitatori.

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
