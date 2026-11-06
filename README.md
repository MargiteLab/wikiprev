# WikiPrev - Verifiable Forecast Archive

A platform to track predictions over time and check them when they come due.

## Status

Early stage. Today WikiPrev runs entirely in the browser: predictions are saved in
the browser's `localStorage`, so each visitor only sees their own data.
Sharing predictions between users and verifying outcomes will come in later steps.

## Features
- Add predictions with who made them, source, link, category, date made and due date
- Search, filter by category and due-date range, and sort
- A random featured prediction
- Data from the earlier version of the page is migrated automatically

## Project structure

```
index.html      page markup
css/style.css   styles
js/store.js     data layer: prediction model, validation, storage
js/app.js       UI: rendering, filters, forms
```

All data access goes through `js/store.js`, so the storage can later be replaced
by a shared backend without changing the UI.

## Running it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## License
GPL v3 - See LICENSE file for details
