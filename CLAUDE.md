# LevelUp

Gamified personal productivity app tracking **Exercise**, **Study**, and **Finances** through an RPG-style character progression system. Vanilla HTML/CSS/JS — no framework, no build tools.

## Architecture

```
main.html / main.js          ← Dashboard hub (character level, module cards, charts)
├── powerUp/                  ← Exercise: workout logging & analytics
│   ├── index.html            ← Module entry point
│   ├── workout.html          ← Log workout (query: ?date=YYYY-MM-DD)
│   └── analytics.html        ← Workout history & stats
├── study/                    ← Flashcards with spaced repetition
│   ├── studyHome.html        ← Module entry point
│   ├── createCard.html       ← Card creation
│   ├── viewCards.html        ← Card library
│   ├── learn.html            ← Study session (query: ?category=&mode=&count=)
│   └── js/                   ← Class-based modules (data.js, home.js, learn.js, etc.)
├── finances/                 ← Receipt/expense tracking & budgeting
│   ├── index.html            ← Module entry point
│   ├── receipts.html         ← Receipt list
│   ├── budget.html, food.html, search.html
│   ├── dataLoader.js         ← Seeds localStorage from receiptsData on first visit
│   └── receiptsData.json     ← Receipt seed data
└── images/                   ← PNGs and GIFs (character, icons)
```

## Tech Stack

- **Vanilla JS** (ES6+), no modules/bundler — scripts loaded via `<script>` at end of `<body>`
- **Pure CSS3** with custom properties, no preprocessor
- **Chart.js v4.4.1** via CDN (jsdelivr) for donut charts
- **localStorage** for all persistence (no backend)
- **GitHub Pages** for deployment (static files, no build step)

## Code Conventions

### JavaScript
- **Variables/functions**: `camelCase` — `getLevel()`, `formatMoney()`, `volumeSince()`
- **Constants**: `UPPER_SNAKE_CASE` — `EX_MAX`, `FIN_MAX`, `KEY_LEVEL`, `CURRENT_VERSION`
- **Classes**: `PascalCase` — `StudyDataManager`, `StudyHome`, `CreateCard`
- **Indentation**: 4 spaces
- **Quotes**: Single quotes
- **Semicolons**: Always
- **DOM access**: `$()` helper wraps `document.getElementById()`
- **Helpers**: `pct()`, `setText()`, `setWidth()`, `setHeight()` for common DOM ops

### Module Patterns
- **Dashboard** (`main.js`): Top-level functions, state in module-scope objects (`financeState`)
- **Study module**: Class-based — constructor calls `init()`, uses `setupEventListeners()`, `render*()` methods, exposed via `window.ClassName`
- **Finance dataLoader**: IIFE with `'use strict'`
- **No ES module imports** — all scripts use global scope or window attachment

### CSS
- **Class naming**: Flat (no BEM) — `.card`, `.pill`, `.chip-btn`, `.topbar`, `.wrap`
- **State classes**: `.active`, `.ready`, `.toggle-on`, `.selected`, `.transforming`
- **CSS variables** at `:root`:
  - Layout: `--radius`, `--shadow`
  - Colors: `--bg`, `--ink`, `--muted`, `--card`, `--ring`
  - Module colors: `--ex` (red), `--study` (blue), `--fin` (green)
  - Status: `--good` (green), `--warn` (orange), `--danger` (red)
  - Dark theme: `--darkCard`, `--darkBorder`, `--darkText`, `--darkMuted`
- **Themes**: Light blue gradient on dashboard; dark backgrounds in modules
- **Layout**: Flexbox for rows/nav, CSS Grid for cards/modules
- **Responsive**: Media queries at `360px`, `860px`

### HTML
- Element IDs in `camelCase`: `modExercise`, `exFill`, `characterFrame`, `financeDonut`
- External CSS in `<head>`, scripts at end of `<body>`
- Navigation via relative paths: `./powerUp/index.html`, `../main.html`
- Query params via `URLSearchParams`

### File Naming
- Module entry points: `index.html`
- JS files: `camelCase.js` — `dataLoader.js`, `receiptsData.js`
- CSS files: lowercase — `main.css`, `learn.css`, `create.css`
- JSON data: `camelCase.json` — `receiptsData.json`, `itemsDatabase.json`

## Data Layer (localStorage)

### Key Format
Namespaced with colon prefix:
- `levelUp:characterLevel` — integer (character level)
- `levelUp:transformCount` — integer
- `levelUp:exerciseResetAt` — ISO date string (YYYY-MM-DD)
- `powerUp:YYYY-MM-DD` — JSON workout object (date-keyed)
- `finances:receipts` — JSON array of receipt objects
- `finances:dataLoaded` — "true"/"false" string
- `finances:dataVersion` — version string (e.g., "1.3")
- `levelupFlashData` — JSON flashcard data (legacy key, no colon)

### Data Shapes
```js
// Workout
{ date: "2025-01-10", exercises: [{ name: "Squat", bodyPart: "Legs", sets: [{ weight: 225, reps: 8, done: true }] }] }

// Receipt
{ id: "receipt_walmart_20260114", date: "2026-01-14", store: "Walmart", category: "Groceries", items: [{ name: "Item", price: 3.99, quantity: 1, category: "Groceries", subcategory: "Snacks" }], total: 45.06 }

// Flashcard
{ id: "card_1705017634123_abc", front: "house", back: "집", category: "noun", state: "new", timesStudied: 0, timesCorrect: 0, lastStudied: null, created: "2025-01-10T12:00:00Z", difficulty: 1 }
// Card states: new → studied → learning → learned → mastered (3 correct = learned, 5 = mastered)
```

## Game System

- **EX_MAX**: 50,000 (exercise volume threshold for transform)
- **FIN_MAX**: 2,000 (monthly finance threshold)
- **Transform**: Unlocks when exercise volume since last reset >= EX_MAX; increments character level, resets exercise meter
- **Character**: Visual GIF + aura effect, level displayed on dashboard
- **Module meters**: Vertical progress bars on dashboard cards (study meter currently placeholder at 0%)

## Error Handling Patterns
- `safeParse()` returns `null` on JSON parse failure
- Null-check before DOM ops: `if (!el) return`
- try-catch around localStorage reads (non-fatal)
- Graceful fallback when optional data files are missing

## Known Gaps
- Study power meter on dashboard is hardcoded to 0% (not yet integrated)
- No automated tests
- No CI/CD pipeline
- Mortgage/utility detection uses string matching (fragile)
