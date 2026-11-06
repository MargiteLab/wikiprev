# WikiPrev - Archivio di previsioni verificabili

Una piattaforma per raccogliere previsioni nel tempo e controllarle quando arriva la loro scadenza.

## Stato

Fase iniziale. Per ora WikiPrev funziona interamente nel browser: le previsioni sono
salvate nel `localStorage`, quindi ogni visitatore vede solo i propri dati.
La condivisione tra utenti e la verifica degli esiti arriveranno nei prossimi passi.

## Funzionalità
- Aggiunta di previsioni con autore, fonte, link, categoria, data della previsione e scadenza
- Ricerca, filtro per categoria e per intervallo di scadenza, ordinamento
- Una previsione in evidenza scelta a caso
- Previsioni di esempio reali, con link alla fonte
- I dati salvati dalle versioni precedenti vengono aggiornati in automatico

## Struttura del progetto

```
index.html      struttura della pagina
css/style.css   stili
js/store.js     dati: modello delle previsioni, validazione, salvataggio
js/app.js       interfaccia: visualizzazione, filtri, form
```

Tutto l'accesso ai dati passa da `js/store.js`, così in futuro il salvataggio potrà
essere sostituito da un backend condiviso senza modificare l'interfaccia.

## Come provarlo

Non serve nessuna compilazione. Apri `index.html` nel browser, oppure servi la cartella:

```bash
python3 -m http.server 8000
```

## Licenza
GPL v3 - vedi il file LICENSE
