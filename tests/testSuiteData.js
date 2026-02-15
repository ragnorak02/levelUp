/* --------------------------------
   testSuiteData.js — Schema Validation Tests
   Verifies generated data matches expected shapes
----------------------------------*/
(function() {
    'use strict';

    var gen = window.SeedGenerator;
    var pools = window.DataPools;

    /* ===== Workout Schema ===== */
    describe('Workout Schema', function() {
        it('has date and exercises array', function() {
            window.TestPRNG.reset(42);
            var w = gen.generateWorkout('2026-02-10');
            assert.hasKeys(w, ['date', 'exercises']);
            assert.equal(w.date, '2026-02-10');
            assert.ok(Array.isArray(w.exercises), 'exercises should be array');
            assert.ok(w.exercises.length >= 3, 'should have at least 3 exercises');
            assert.ok(w.exercises.length <= 6, 'should have at most 6 exercises');
        });

        it('each exercise has name, bodyPart, and sets', function() {
            window.TestPRNG.reset(42);
            var w = gen.generateWorkout('2026-02-10');
            w.exercises.forEach(function(ex) {
                assert.hasKeys(ex, ['name', 'bodyPart', 'sets']);
                assert.typeOf(ex.name, 'string');
                assert.typeOf(ex.bodyPart, 'string');
                assert.ok(Array.isArray(ex.sets), 'sets should be array');
                assert.ok(ex.sets.length >= 3, 'at least 3 sets');
            });
        });

        it('each set has weight, reps, and done', function() {
            window.TestPRNG.reset(42);
            var w = gen.generateWorkout('2026-02-10');
            w.exercises.forEach(function(ex) {
                ex.sets.forEach(function(s) {
                    assert.hasKeys(s, ['weight', 'reps', 'done']);
                    assert.typeOf(s.weight, 'number');
                    assert.typeOf(s.reps, 'number');
                    assert.equal(s.done, true, 'done should be true');
                    assert.ok(s.reps >= 1, 'reps should be positive');
                });
            });
        });

        it('uses valid body parts from pool', function() {
            window.TestPRNG.reset(42);
            var w = gen.generateWorkout('2026-02-10');
            w.exercises.forEach(function(ex) {
                assert.includes(pools.BODY_PARTS, ex.bodyPart, 'bodyPart should be from pool');
            });
        });

        it('weight rounds to nearest 5', function() {
            window.TestPRNG.reset(42);
            var w = gen.generateWorkout('2026-02-10');
            w.exercises.forEach(function(ex) {
                if (ex.bodyPart === 'Cardio') return;
                ex.sets.forEach(function(s) {
                    assert.equal(s.weight % 5, 0, 'weight should be multiple of 5');
                });
            });
        });
    });

    /* ===== Receipt Schema ===== */
    describe('Receipt Schema', function() {
        it('has all required receipt fields', function() {
            window.TestPRNG.reset(42);
            var r = gen.generateReceipt('2026-02-10');
            assert.hasKeys(r, ['id', 'date', 'store', 'category', 'items', 'subtotal', 'tax', 'total']);
            assert.equal(r.date, '2026-02-10');
            assert.typeOf(r.id, 'string');
            assert.typeOf(r.store, 'string');
        });

        it('items have required fields', function() {
            window.TestPRNG.reset(42);
            var r = gen.generateReceipt('2026-02-10');
            assert.ok(r.items.length >= 1, 'should have at least 1 item');
            r.items.forEach(function(item) {
                assert.hasKeys(item, ['name', 'price', 'quantity', 'category', 'subcategory']);
                assert.typeOf(item.name, 'string');
                assert.typeOf(item.price, 'number');
                assert.ok(item.price > 0, 'price should be positive');
                assert.ok(item.quantity >= 1, 'quantity should be >= 1');
            });
        });

        it('total equals subtotal + tax', function() {
            window.TestPRNG.reset(42);
            var r = gen.generateReceipt('2026-02-10');
            assert.closeTo(r.total, r.subtotal + r.tax, 0.02, 'total should equal subtotal + tax');
        });

        it('id follows naming convention', function() {
            window.TestPRNG.reset(42);
            var r = gen.generateReceipt('2026-02-10', 'Walmart');
            assert.ok(r.id.startsWith('receipt_walmart_'), 'id should start with receipt_<store>_');
        });

        it('cafe receipts use Cafe category', function() {
            window.TestPRNG.reset(42);
            var r = gen.generateReceipt('2026-02-10', 'Starbucks');
            assert.equal(r.category, 'Cafe');
            assert.ok(r.tax > 0, 'cafe should have tax');
        });
    });

    /* ===== Flashcard Schema ===== */
    describe('Flashcard Schema', function() {
        it('has flashcards array, version, and lastUpdated', function() {
            window.TestPRNG.reset(42);
            var data = gen.generateFlashcardSet(25);
            assert.hasKeys(data, ['flashcards', 'version', 'lastUpdated']);
            assert.equal(data.version, '2.0');
            assert.arrayLength(data.flashcards, 25);
        });

        it('each card has required fields', function() {
            window.TestPRNG.reset(42);
            var data = gen.generateFlashcardSet(10);
            data.flashcards.forEach(function(card) {
                assert.hasKeys(card, ['id', 'front', 'back', 'category', 'state', 'timesStudied', 'timesCorrect', 'difficulty', 'created']);
                assert.typeOf(card.id, 'string');
                assert.typeOf(card.front, 'string');
                assert.typeOf(card.back, 'string');
                assert.typeOf(card.state, 'string');
                assert.typeOf(card.timesStudied, 'number');
                assert.typeOf(card.timesCorrect, 'number');
                assert.typeOf(card.difficulty, 'number');
            });
        });

        it('card state is valid enum', function() {
            window.TestPRNG.reset(42);
            var data = gen.generateFlashcardSet(20);
            data.flashcards.forEach(function(card) {
                assert.includes(pools.CARD_STATES, card.state, 'state should be valid');
            });
        });

        it('new cards have zero study counts and null lastStudied', function() {
            window.TestPRNG.reset(42);
            var data = gen.generateFlashcardSet(50);
            var newCards = data.flashcards.filter(function(c) { return c.state === 'new'; });
            newCards.forEach(function(card) {
                assert.equal(card.timesStudied, 0);
                assert.equal(card.timesCorrect, 0);
                assert.equal(card.lastStudied, null);
            });
        });

        it('mastered cards have timesCorrect >= 5', function() {
            window.TestPRNG.reset(42);
            var data = gen.generateFlashcardSet(50);
            var masteredCards = data.flashcards.filter(function(c) { return c.state === 'mastered'; });
            masteredCards.forEach(function(card) {
                assert.ok(card.timesCorrect >= 5, 'mastered cards need >= 5 correct');
            });
        });

        it('difficulty is in range 1-5', function() {
            window.TestPRNG.reset(42);
            var data = gen.generateFlashcardSet(30);
            data.flashcards.forEach(function(card) {
                assert.ok(card.difficulty >= 1 && card.difficulty <= 5, 'difficulty should be 1-5');
            });
        });
    });

    /* ===== Meal Schema ===== */
    describe('Meal Schema', function() {
        it('has required meal fields', function() {
            window.TestPRNG.reset(42);
            var m = gen.generateMeal('2026-02-10', 'Lunch');
            assert.hasKeys(m, ['id', 'date', 'name', 'ingredients', 'totals']);
            assert.equal(m.date, '2026-02-10');
            assert.equal(m.name, 'Lunch');
        });

        it('totals has calories, protein, carbs, fat', function() {
            window.TestPRNG.reset(42);
            var m = gen.generateMeal('2026-02-10', 'Dinner');
            assert.hasKeys(m.totals, ['calories', 'protein', 'carbs', 'fat']);
            assert.typeOf(m.totals.calories, 'number');
            assert.ok(m.totals.calories > 0, 'calories should be positive');
        });

        it('ingredients have nutrition info', function() {
            window.TestPRNG.reset(42);
            var m = gen.generateMeal('2026-02-10', 'Breakfast');
            assert.ok(m.ingredients.length >= 2, 'should have 2+ ingredients');
            m.ingredients.forEach(function(ing) {
                assert.hasKeys(ing, ['name', 'amount', 'unit', 'calories', 'protein', 'carbs', 'fat']);
                assert.typeOf(ing.name, 'string');
                assert.ok(ing.amount > 0, 'amount should be positive');
            });
        });

        it('generateNutritionDay returns 3-4 meals', function() {
            window.TestPRNG.reset(42);
            var meals = gen.generateNutritionDay('2026-02-10');
            assert.ok(meals.length >= 3 && meals.length <= 4, 'should have 3-4 meals');
            meals.forEach(function(m) {
                assert.equal(m.date, '2026-02-10');
            });
        });
    });

    /* ===== Trip Schema ===== */
    describe('Trip Schema', function() {
        it('has required trip fields', function() {
            window.TestPRNG.reset(42);
            var t = gen.generateTrip();
            assert.hasKeys(t, ['id', 'name', 'startDate', 'endDate', 'destinations']);
            assert.typeOf(t.name, 'string');
            assert.ok(t.startDate < t.endDate, 'startDate should be before endDate');
        });

        it('has 2-4 destinations', function() {
            window.TestPRNG.reset(42);
            var t = gen.generateTrip();
            assert.ok(t.destinations.length >= 2, 'at least 2 destinations');
            assert.ok(t.destinations.length <= 4, 'at most 4 destinations');
            t.destinations.forEach(function(d) {
                assert.hasKeys(d, ['name']);
                assert.typeOf(d.name, 'string');
            });
        });
    });

    /* ===== Bowling Schema ===== */
    describe('Bowling Schema', function() {
        it('has weekId and games array', function() {
            window.TestPRNG.reset(42);
            var b = gen.generateBowlingWeek('2026-W06');
            assert.hasKeys(b, ['weekId', 'games']);
            assert.equal(b.weekId, '2026-W06');
            assert.ok(Array.isArray(b.games), 'games should be array');
        });

        it('each game has score and completedDate', function() {
            window.TestPRNG.reset(42);
            var b = gen.generateBowlingWeek('2026-W06');
            assert.equal(b.games.length, 3);
            b.games.forEach(function(g) {
                assert.hasKeys(g, ['score', 'completedDate']);
                assert.typeOf(g.score, 'number');
                assert.ok(g.score >= 0 && g.score <= 300, 'score should be 0-300');
                assert.typeOf(g.completedDate, 'string');
                assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(g.completedDate), 'completedDate should be ISO format');
            });
        });
    });

    /* ===== Calendar Event Schema ===== */
    describe('Calendar Event Schema', function() {
        it('has required event fields', function() {
            window.TestPRNG.reset(42);
            var e = gen.generateCalendarEvent('2026-02-10');
            assert.hasKeys(e, ['id', 'date', 'title', 'category', 'notes', 'xpCategory', 'xpAmount']);
            assert.equal(e.date, '2026-02-10');
            assert.typeOf(e.title, 'string');
        });

        it('category is valid', function() {
            window.TestPRNG.reset(42);
            var e = gen.generateCalendarEvent('2026-02-10');
            assert.includes(pools.EVENT_CATEGORIES, e.category);
        });

        it('xpAmount is non-negative', function() {
            window.TestPRNG.reset(42);
            var e = gen.generateCalendarEvent('2026-02-10');
            assert.ok(e.xpAmount >= 0, 'xpAmount should be >= 0');
        });
    });

    /* ===== Character Data ===== */
    describe('Character Data', function() {
        it('level is integer >= 1', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            assert.ok(Number.isInteger(ds.character.level), 'level should be integer');
            assert.ok(ds.character.level >= 1, 'level should be >= 1');
        });

        it('transformCount >= 0 and aligns with level', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            assert.ok(ds.character.transformCount >= 0, 'transformCount should be >= 0');
            assert.equal(ds.character.transformCount, ds.character.level - 1, 'transformCount should be level - 1');
        });

        it('exerciseResetAt is valid ISO date', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(ds.character.exerciseResetAt), 'should be YYYY-MM-DD');
        });
    });

    /* ===== ID Uniqueness ===== */
    describe('ID Uniqueness', function() {
        it('no duplicate receipt IDs', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            var ids = ds.receipts.map(function(r) { return r.id; });
            var unique = new Set(ids);
            assert.equal(unique.size, ids.length, 'receipt IDs should be unique');
        });

        it('no duplicate flashcard IDs', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            var ids = ds.flashData.flashcards.map(function(c) { return c.id; });
            var unique = new Set(ids);
            assert.equal(unique.size, ids.length, 'flashcard IDs should be unique');
        });

        it('no duplicate meal IDs', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            var ids = ds.meals.map(function(m) { return m.id; });
            var unique = new Set(ids);
            assert.equal(unique.size, ids.length, 'meal IDs should be unique');
        });

        it('no duplicate event IDs', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            var ids = ds.events.map(function(e) { return e.id; });
            var unique = new Set(ids);
            assert.equal(unique.size, ids.length, 'event IDs should be unique');
        });

        it('no duplicate trip IDs', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            var ids = ds.trips.map(function(t) { return t.id; });
            var unique = new Set(ids);
            assert.equal(unique.size, ids.length, 'trip IDs should be unique');
        });
    });

    /* ===== Full Dataset ===== */
    describe('Full Dataset', function() {
        it('generates expected data counts', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            assert.ok(Object.keys(ds.workouts).length > 0, 'should have workouts');
            assert.ok(ds.receipts.length >= 15, 'should have >= 15 receipts');
            assert.equal(ds.flashData.flashcards.length, 50, 'should have 50 flashcards');
            assert.ok(ds.meals.length > 0, 'should have meals');
            assert.equal(ds.trips.length, 2, 'should have 2 trips');
            assert.ok(Object.keys(ds.bowlingData).length > 0, 'should have bowling data');
            assert.equal(ds.events.length, 10, 'should have 10 events');
        });

        it('is deterministic with same seed', function() {
            window.TestPRNG.reset(42);
            var ds1 = gen.generateFullDataset(42);
            window.TestPRNG.reset(42);
            var ds2 = gen.generateFullDataset(42);

            assert.equal(ds1.receipts.length, ds2.receipts.length, 'same receipt count');
            assert.equal(ds1.character.level, ds2.character.level, 'same character level');
            assert.equal(Object.keys(ds1.workouts).length, Object.keys(ds2.workouts).length, 'same workout count');
            assert.deepEqual(ds1.character, ds2.character, 'same character data');
        });

        it('produces different data with different seed', function() {
            var ds1 = gen.generateFullDataset(42);
            var ds2 = gen.generateFullDataset(99);

            // Very unlikely to be identical
            var sameLevels = ds1.character.level === ds2.character.level;
            var sameReceipts = ds1.receipts.length === ds2.receipts.length;
            var sameWorkouts = Object.keys(ds1.workouts).length === Object.keys(ds2.workouts).length;
            assert.ok(!(sameLevels && sameReceipts && sameWorkouts), 'different seeds should produce different data');
        });

        it('respects options overrides', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42, {
                receiptCount: 5,
                flashcardCount: 10,
                tripCount: 1,
                eventCount: 3
            });
            assert.equal(ds.receipts.length, 5, 'should respect receiptCount');
            assert.equal(ds.flashData.flashcards.length, 10, 'should respect flashcardCount');
            assert.equal(ds.trips.length, 1, 'should respect tripCount');
            assert.equal(ds.events.length, 3, 'should respect eventCount');
        });
    });
})();
