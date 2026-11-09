# WikiPrev - Archivio di previsioni verificabili

Una piattaforma per raccogliere previsioni nel tempo e controllarle quando arriva la loro scadenza.

## Funzionalità
- Aggiunta di previsioni con autore, fonte, link, uno o più tag, data della previsione e scadenza
- Ricerca, filtro per tag e per intervallo di scadenza, ordinamento (predefinito: inserite di recente)
- In evidenza due previsioni: a sinistra l'ultima scaduta, a destra la prossima in scadenza, con pulsanti per andare più indietro o più avanti nel tempo
- Ogni previsione ha una sua pagina (`?p=<id>`) con tutti i dettagli, un link da copiare o condividere e le copie archiviate della fonte su archive.org
- Nessun accesso con email: per aggiungere una previsione basta scrivere il proprio nome
- Per ogni previsione si sa chi l'ha caricata
- Solo l'amministratore, con un codice segreto, può eliminare le previsioni
- Tag: ogni previsione ne ha almeno uno e può averne più di uno (es. "Economia", "TAV", "Promesse politiche"); nuovi tag si creano dal modulo. Fino a novembre 2026 c'erano "categorie" separate: sono diventate tag (migrazione 0013)
- Ogni previsione mostra quando è stata inserita e da chi
- Contatore delle visite, visibile all'amministratore nel riquadro Amministrazione (senza cookie, senza IP)

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
js/model.js                   tag predefiniti e validazione
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
| `categories` | le vecchie categorie, conservate come storia: dalla migrazione 0013 sono tag |
| `predictions` | le previsioni, collegate a persona, fonte e utente; `created_at` è la data di inserimento; `category_id` resta solo come storia |
| `tags`, `prediction_tags` | le etichette e quali previsioni le hanno (più etichette per previsione) |
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
   9. `0009_tags.sql`
   10. `0010_wrong_predictions_2021_2024.sql`
   11. `0011_visit_counter.sql`
   12. `0012_bdi_ai_bonds_2026.sql`
   13. `0013_categories_become_tags.sql`
3. Scegli il codice amministratore. Sempre nel SQL Editor esegui, con un codice lungo almeno 12 caratteri scelto da te:
   ```sql
   select public.set_admin_code('il-tuo-codice-segreto');
   ```
   Poi sul sito apri **Amministrazione** (in fondo alla pagina) e inseriscilo: il tuo browser lo ricorderà e ti mostrerà i pulsanti "Elimina". Per cambiarlo, riesegui lo stesso comando con un codice nuovo. Non salvarlo nel repository.
4. Collega il sito. In **Project Settings → API** copia *Project URL* e la chiave *anon public* in `js/config.js`. Sono dati pubblici per natura: permettono solo ciò che il database consente ai visitatori.

## Pubblicare il sito

Il sito è statico, quindi qualunque hosting statico va bene:
- **GitHub Pages:** Settings → Pages → Deploy from a branch, branch `main`, cartella `/ (root)`. È gratuito per i repository pubblici.
- **Netlify** o **Cloudflare Pages:** gratuiti anche con un repository privato.

Quando si modificano CSS o JavaScript, aggiornare il numero di versione `?v=...` nei
link in fondo a `index.html` (e in testa per il CSS): così i browser non mescolano
file vecchi e nuovi.

Per provarlo in locale:

```bash
python3 -m http.server 8000
```

## Anteprime su Telegram e WhatsApp

Telegram, WhatsApp e simili costruiscono l'anteprima di un link leggendo l'HTML senza
eseguire JavaScript, quindi per loro `?p=<id>` sarebbe sempre la pagina principale.
Per questo ogni previsione ha anche una piccola pagina statica, `p/<id>/`, con titolo,
scadenza, autore, fonte e tag nei tag Open Graph e un'immagine propria
(`p/<id>/anteprima.jpg`, con il testo della previsione), che porta subito alla pagina
normale. Le immagini si disegnano con Playwright e si ridisegnano solo quando la
previsione cambia o scade.
Il pulsante **Copia link** usa questa pagina quando esiste.

Le pagine si generano con:

```bash
node scripts/build-share-pages.mjs
```

e il workflow **Pagine di condivisione** (`.github/workflows/share-pages.yml`) le
rigenera e le carica sul branch: dalla scheda **Actions** di GitHub con **Run workflow**,
e ogni 30 minuti quando il file si trova sul branch predefinito del repository.

## Visite al sito

Ogni apertura della pagina registra nel database: data e ora, un numero casuale
che il browser conserva solo finché la scheda resta aperta, il sito di provenienza
(per esempio `t.me` o `www.google.com`) e il tipo di dispositivo. Nessun indirizzo IP,
nessun cookie, nessun identificativo permanente. Le statistiche degli ultimi 30 giorni
si vedono nel riquadro **Amministrazione**, dopo aver inserito il codice.

## Statistiche

`supabase/queries/statistiche.sql` contiene esempi da eseguire nel SQL Editor: chi carica più previsioni, chi ne fa di più, quali fonti ne pubblicano di più, quante ne scadono ogni mese.

## Licenza
GPL v3 - vedi il file LICENSE
