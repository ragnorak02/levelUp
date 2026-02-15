/* --------------------------------
   testSuiteUI.js — UI Integration Tests
   Tests that seed data renders correctly
   (operates on localStorage only — no iframe needed)
----------------------------------*/
(function() {
    'use strict';

    var gen = window.SeedGenerator;
    var injector = window.SeedInjector;

    /* ===== Data Round-Trip ===== */
    describe('Data Round-Trip', function() {
        it('injected workouts can be read back from localStorage', function() {
            window.TestPRNG.reset(99);
            var ds = gen.generateFullDataset(99, { workoutDays: 3, receiptCount: 2, flashcardCount: 5, nutritionDays: 2, tripCount: 1, bowlingWeeks: 1, eventCount: 2 });

            // Clear and inject without confirm dialog
            var appKeys = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && (k.startsWith('powerUp:') || k.startsWith('bowling:week:') || k === 'finances:receipts' || k === 'levelupFlashData' || k === 'nutrition:meals' || k === 'calendar:events' || k === 'travel:trips' || k.startsWith('levelUp:') || k.startsWith('finances:'))) {
                    appKeys.push(k);
                }
            }
            appKeys.forEach(function(k) { localStorage.removeItem(k); });

            // Inject directly (bypass confirm)
            injectWithoutConfirm(ds);

            // Read back workouts
            var workoutKeys = Object.keys(ds.workouts);
            workoutKeys.forEach(function(key) {
                var stored = localStorage.getItem(key);
                assert.ok(stored != null, 'workout should be stored: ' + key);
                var parsed = JSON.parse(stored);
                assert.equal(parsed.date, ds.workouts[key].date, 'date should match');
                assert.equal(parsed.exercises.length, ds.workouts[key].exercises.length, 'exercise count should match');
            });
        });

        it('injected receipts can be read back', function() {
            var stored = JSON.parse(localStorage.getItem('finances:receipts') || '[]');
            assert.ok(stored.length > 0, 'should have receipts in localStorage');
            stored.forEach(function(r) {
                assert.hasKeys(r, ['id', 'date', 'store', 'total']);
            });
        });

        it('injected flashcards can be read back', function() {
            var stored = JSON.parse(localStorage.getItem('levelupFlashData') || '{}');
            assert.ok(stored.flashcards && stored.flashcards.length > 0, 'should have flashcards');
            assert.equal(stored.version, '2.0');
        });

        it('injected meals can be read back', function() {
            var stored = JSON.parse(localStorage.getItem('nutrition:meals') || '[]');
            assert.ok(stored.length > 0, 'should have meals');
            stored.forEach(function(m) {
                assert.hasKeys(m, ['id', 'date', 'name', 'totals']);
            });
        });

        it('injected character level can be read back', function() {
            var level = Number(localStorage.getItem('levelUp:characterLevel'));
            assert.ok(level >= 1, 'level should be >= 1');
            var transforms = Number(localStorage.getItem('levelUp:transformCount'));
            assert.ok(transforms >= 0, 'transforms should be >= 0');
        });

        it('injected bowling data can be read back', function() {
            var found = false;
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.startsWith('bowling:week:')) {
                    found = true;
                    var week = JSON.parse(localStorage.getItem(k));
                    assert.hasKeys(week, ['weekId', 'games']);
                    assert.ok(week.games.length > 0, 'should have games');
                }
            }
            assert.ok(found, 'should find bowling data in localStorage');
        });

        it('injected events can be read back', function() {
            var stored = JSON.parse(localStorage.getItem('calendar:events') || '[]');
            assert.ok(stored.length > 0, 'should have events');
            stored.forEach(function(e) {
                assert.hasKeys(e, ['id', 'date', 'title', 'category']);
            });
        });

        it('injected trips can be read back', function() {
            var stored = JSON.parse(localStorage.getItem('travel:trips') || '[]');
            assert.ok(stored.length > 0, 'should have trips');
            stored.forEach(function(t) {
                assert.hasKeys(t, ['id', 'name', 'startDate', 'endDate', 'destinations']);
            });
        });
    });

    /* ===== Append Mode ===== */
    describe('Append Mode', function() {
        it('does not overwrite existing workouts', function() {
            // First, seed data
            window.TestPRNG.reset(42);
            var ds1 = gen.generateFullDataset(42, { workoutDays: 3, receiptCount: 2, flashcardCount: 5, nutritionDays: 2, tripCount: 1, bowlingWeeks: 1, eventCount: 2 });
            clearWithoutConfirm();
            injectWithoutConfirm(ds1);

            var keys1 = Object.keys(ds1.workouts);
            var firstKey = keys1[0];
            var original = JSON.parse(localStorage.getItem(firstKey));

            // Inject different dataset in append mode
            window.TestPRNG.reset(99);
            var ds2 = gen.generateFullDataset(99, { workoutDays: 5, receiptCount: 3, flashcardCount: 5, nutritionDays: 2, tripCount: 1, bowlingWeeks: 1, eventCount: 2 });

            // Manually call append logic
            Object.keys(ds2.workouts).forEach(function(key) {
                if (localStorage.getItem(key) == null) {
                    localStorage.setItem(key, JSON.stringify(ds2.workouts[key]));
                }
            });

            // Original workout should still be unchanged
            var afterAppend = JSON.parse(localStorage.getItem(firstKey));
            assert.deepEqual(afterAppend, original, 'existing workout should not be overwritten');
        });

        it('appends new flashcards without removing existing', function() {
            var before = JSON.parse(localStorage.getItem('levelupFlashData') || '{}');
            var beforeCount = (before.flashcards || []).length;

            window.TestPRNG.reset(123);
            var ds = gen.generateFullDataset(123, { flashcardCount: 3 });
            var newCards = ds.flashData.flashcards;

            // Append new cards
            var existing = JSON.parse(localStorage.getItem('levelupFlashData') || '{"flashcards":[]}');
            var existingIds = new Set(existing.flashcards.map(function(c) { return c.id; }));
            newCards.forEach(function(card) {
                if (!existingIds.has(card.id)) {
                    existing.flashcards.push(card);
                }
            });
            localStorage.setItem('levelupFlashData', JSON.stringify(existing));

            var after = JSON.parse(localStorage.getItem('levelupFlashData'));
            assert.ok(after.flashcards.length >= beforeCount, 'should have same or more cards after append');
        });
    });

    /* ===== Helper: inject without confirm dialog ===== */
    function injectWithoutConfirm(dataset) {
        // Direct injection without window.confirm
        if (dataset.workouts) {
            Object.keys(dataset.workouts).forEach(function(key) {
                localStorage.setItem(key, JSON.stringify(dataset.workouts[key]));
            });
        }
        if (dataset.receipts) {
            localStorage.setItem('finances:receipts', JSON.stringify(dataset.receipts));
            localStorage.setItem('finances:dataLoaded', 'true');
            localStorage.setItem('finances:dataVersion', 'seed');
        }
        if (dataset.flashData) {
            localStorage.setItem('levelupFlashData', JSON.stringify(dataset.flashData));
        }
        if (dataset.meals) {
            localStorage.setItem('nutrition:meals', JSON.stringify(dataset.meals));
        }
        if (dataset.trips) {
            localStorage.setItem('travel:trips', JSON.stringify(dataset.trips));
        }
        if (dataset.bowlingData) {
            Object.keys(dataset.bowlingData).forEach(function(key) {
                localStorage.setItem(key, JSON.stringify(dataset.bowlingData[key]));
            });
        }
        if (dataset.events) {
            localStorage.setItem('calendar:events', JSON.stringify(dataset.events));
        }
        if (dataset.character) {
            localStorage.setItem('levelUp:characterLevel', String(dataset.character.level));
            localStorage.setItem('levelUp:transformCount', String(dataset.character.transformCount));
            localStorage.setItem('levelUp:exerciseResetAt', dataset.character.exerciseResetAt);
        }
    }

    function clearWithoutConfirm() {
        var toRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && (k.startsWith('powerUp:') || k.startsWith('bowling:week:') || k === 'finances:receipts' || k === 'finances:dataLoaded' || k === 'finances:dataVersion' || k === 'levelupFlashData' || k === 'nutrition:meals' || k === 'nutrition:targets' || k === 'nutrition:recipes' || k === 'calendar:events' || k === 'travel:trips' || k.startsWith('levelUp:'))) {
                toRemove.push(k);
            }
        }
        toRemove.forEach(function(k) { localStorage.removeItem(k); });
    }
})();
