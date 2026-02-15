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
├── tests/                    ← Automated tests & data seeding (see Testing section)
│   ├── runner.html           ← Browser test runner
│   └── nodeRunner.js         ← Terminal runner (node tests/nodeRunner.js)
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

## Testing & Data Seeding (`tests/`)

### File Structure
```
tests/
├── prng.js              ← Deterministic PRNG (mulberry32, seed-resettable)
├── dataPools.js         ← Realistic value pools (exercises, stores, groceries, flashcards, etc.)
├── seedGenerator.js     ← Data factory — generates full objects matching each localStorage schema
├── seedInjector.js      ← Writes generated data into localStorage (reset or append mode)
├── testFramework.js     ← Minimal assertion library (describe/it/assert)
├── testSuiteData.js     ← Schema validation tests (30 tests)
├── testSuiteAggregation.js ← Computation tests (10 tests)
├── testSuiteUI.js       ← Data round-trip & append mode tests (10 tests)
├── runner.html          ← Browser test runner UI (dark themed, click-to-run)
└── nodeRunner.js        ← Terminal runner (node tests/nodeRunner.js)
```

### Running Tests
- **Browser**: Open `tests/runner.html`, click "Run Tests" — safe, read-only, won't change data
- **Terminal**: `node tests/nodeRunner.js` — mocks localStorage, runs all 62 tests, exits 0/1
- **Seed Data**: Click "Seed Data" in runner.html (confirms before wiping) or call `SeedGenerator.generateFullDataset(42)` in console

### Test Framework API
```js
describe('Suite Name', function() {
    it('test name', function() {
        assert.equal(actual, expected);      // strict ===
        assert.deepEqual(a, b);             // JSON deep equality
        assert.ok(val);                     // truthy
        assert.throws(fn);                  // expects error
        assert.arrayLength(arr, n);         // array length
        assert.typeOf(val, 'string');       // typeof check
        assert.hasKeys(obj, ['a', 'b']);    // key presence
        assert.greaterThan(a, b);           // a > b
        assert.includes(arr, val);          // array contains
        assert.closeTo(a, b, delta);        // within delta
    });
});
window.TestFramework.runAllSuites();        // returns { passed, failed, total }
```

### Seed Generator API
```js
// All functions use the deterministic PRNG — same seed = same data
window.TestPRNG.reset(42);
SeedGenerator.generateWorkout('2026-02-10');           // single workout
SeedGenerator.generateReceipt('2026-02-10', 'Walmart'); // single receipt
SeedGenerator.generateFlashcardSet(50);                 // 50 flashcards
SeedGenerator.generateMeal('2026-02-10', 'Lunch');     // single meal
SeedGenerator.generateNutritionDay('2026-02-10');      // 3-4 meals for one day
SeedGenerator.generateTrip();                           // trip with destinations
SeedGenerator.generateBowlingWeek('2026-W06');         // 3 games
SeedGenerator.generateCalendarEvent('2026-02-10');     // single event
SeedGenerator.generateFullDataset(42, {                // everything at once
    workoutDays: 30, receiptCount: 18, flashcardCount: 50,
    nutritionDays: 20, tripCount: 2, bowlingWeeks: 8, eventCount: 10
});
```

### Seed Injector API
```js
SeedInjector.injectFullReset(dataset);  // clears all app data, writes dataset (confirms first)
SeedInjector.injectAppend(dataset);     // merges new data alongside existing (skips duplicates)
SeedInjector.clearAllData();            // wipes all known app keys (confirms first)
SeedInjector.printDataSummary();        // console.table of key counts/sizes
```

### Adding New Tests
1. Create a new `tests/testSuiteXxx.js` file
2. Use `describe()` / `it()` / `assert.*` (globally available)
3. Add `<script src="testSuiteXxx.js"></script>` to `runner.html` before the inline script
4. Add `require('./testSuiteXxx.js');` to `nodeRunner.js` before the `runAllSuites()` call

### Data Pools (`dataPools.js`)
All exposed via `window.DataPools`:
- `BODY_PARTS` (9), `EXERCISES_BY_PART` (map), `WEIGHT_RANGES`, `REP_RANGES`
- `STORES` (10), `GROCERY_ITEMS` (40), `CAFE_ITEMS` (8), `RECEIPT_CATEGORIES`
- `FLASH_PAIRS` (25 Korean vocab), `CARD_STATES` (5)
- `INGREDIENTS` (20 with macros), `MEAL_NAMES` (4)
- `TRIP_NAMES` (8), `DEST_NAMES` (15)
- `EVENT_TITLES` (15), `EVENT_CATEGORIES` (5)

## Known Gaps
- Study power meter on dashboard is hardcoded to 0% (not yet integrated)
- No CI/CD pipeline
- Mortgage/utility detection uses string matching (fragile)
