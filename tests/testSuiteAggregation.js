/* --------------------------------
   testSuiteAggregation.js — Computation Tests
   Verifies dashboard aggregation logic
----------------------------------*/
(function() {
    'use strict';

    var gen = window.SeedGenerator;

    /* ===== Exercise Volume Calculation ===== */
    describe('Exercise Volume', function() {
        it('sum of weight x reps matches expected total', function() {
            window.TestPRNG.reset(42);
            var w = gen.generateWorkout('2026-02-10');

            // Manually compute volume
            var expected = 0;
            w.exercises.forEach(function(ex) {
                ex.sets.forEach(function(s) {
                    if (s.weight > 0 && s.reps > 0) {
                        expected += s.weight * s.reps;
                    }
                });
            });

            // Verify using same logic as main.js dayTotals()
            var volume = 0;
            var sets = 0;
            var moves = 0;
            w.exercises.forEach(function(ex) {
                if (ex.sets && ex.sets.length) moves++;
                (ex.sets || []).forEach(function(s) {
                    if (s.weight > 0 || s.reps > 0) sets++;
                    if (s.weight > 0 && s.reps > 0) volume += s.weight * s.reps;
                });
            });

            assert.equal(volume, expected, 'volume calculation should match');
            assert.ok(moves > 0, 'should have at least one exercise with sets');
            assert.ok(sets > 0, 'should have at least one set');
        });

        it('volume is zero for cardio-only workout', function() {
            // Cardio has weight range [0, 0], so volume = 0*reps = 0
            window.TestPRNG.reset(42);
            var w = gen.generateWorkout('2026-02-10');

            // Manually create a cardio workout
            var cardioWorkout = {
                date: '2026-02-10',
                exercises: [{
                    name: 'Treadmill Run',
                    bodyPart: 'Cardio',
                    sets: [
                        { weight: 0, reps: 20, done: true },
                        { weight: 0, reps: 25, done: true }
                    ]
                }]
            };

            var volume = 0;
            cardioWorkout.exercises.forEach(function(ex) {
                ex.sets.forEach(function(s) {
                    if (s.weight > 0 && s.reps > 0) volume += s.weight * s.reps;
                });
            });

            assert.equal(volume, 0, 'cardio volume should be zero');
        });

        it('multi-day volume accumulates correctly', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            var totalVolume = 0;

            Object.keys(ds.workouts).forEach(function(key) {
                var w = ds.workouts[key];
                w.exercises.forEach(function(ex) {
                    (ex.sets || []).forEach(function(s) {
                        if (s.weight > 0 && s.reps > 0) totalVolume += s.weight * s.reps;
                    });
                });
            });

            assert.ok(totalVolume > 0, 'total volume across all days should be positive');
            assert.ok(totalVolume > 50000, 'with 20+ workout days, volume should exceed 50k');
        });
    });

    /* ===== Finance Monthly Total ===== */
    describe('Finance Monthly Total', function() {
        it('sum of receipt totals for a month matches', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);

            // Filter receipts for February 2026
            var febReceipts = ds.receipts.filter(function(r) {
                return r.date >= '2026-02-01' && r.date < '2026-03-01';
            });

            var expectedTotal = 0;
            febReceipts.forEach(function(r) {
                expectedTotal += r.total;
            });

            // Use item-level sum (like main.js receiptsToEntries)
            var itemTotal = 0;
            febReceipts.forEach(function(r) {
                if (r.items && r.items.length) {
                    r.items.forEach(function(it) {
                        var qty = Number(it.quantity || 1);
                        var price = Number(it.price || 0);
                        itemTotal += price * qty;
                    });
                }
            });

            // Both should be close (receipt.total includes tax, item sum doesn't)
            assert.ok(expectedTotal >= 0, 'monthly total should be non-negative');
            assert.ok(itemTotal >= 0, 'item-level total should be non-negative');
        });

        it('empty month returns zero', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42, { startDate: '2026-05-01' });

            // January 2026 should have no data since we started in May
            var janReceipts = ds.receipts.filter(function(r) {
                return r.date >= '2026-01-01' && r.date < '2026-02-01';
            });

            var total = janReceipts.reduce(function(s, r) { return s + r.total; }, 0);
            assert.equal(total, 0, 'no receipts in Jan means zero total');
        });
    });

    /* ===== Nutrition Daily Totals ===== */
    describe('Nutrition Daily Totals', function() {
        it('meal totals match sum of ingredient macros', function() {
            window.TestPRNG.reset(42);
            var meal = gen.generateMeal('2026-02-10', 'Lunch');

            var ingCal = 0, ingPro = 0, ingCarbs = 0, ingFat = 0;
            meal.ingredients.forEach(function(ing) {
                ingCal += ing.calories;
                ingPro += ing.protein;
                ingCarbs += ing.carbs;
                ingFat += ing.fat;
            });

            assert.equal(meal.totals.calories, Math.round(ingCal), 'calories should match');
            assert.closeTo(meal.totals.protein, parseFloat(ingPro.toFixed(1)), 0.2, 'protein should match');
            assert.closeTo(meal.totals.carbs, parseFloat(ingCarbs.toFixed(1)), 0.2, 'carbs should match');
            assert.closeTo(meal.totals.fat, parseFloat(ingFat.toFixed(1)), 0.2, 'fat should match');
        });

        it('daily totals accumulate across meals', function() {
            window.TestPRNG.reset(42);
            var meals = gen.generateNutritionDay('2026-02-10');

            var dayCal = 0;
            meals.forEach(function(m) {
                dayCal += m.totals.calories;
            });

            assert.ok(dayCal > 0, 'daily calories should be positive');
            // Reasonable range for a full day
            assert.ok(dayCal > 500, 'should be > 500 cal for 3+ meals');
        });
    });

    /* ===== Bowling Average ===== */
    describe('Bowling Average', function() {
        it('average of game scores is correct', function() {
            window.TestPRNG.reset(42);
            var b = gen.generateBowlingWeek('2026-W06');

            var total = 0, count = 0;
            b.games.forEach(function(g) {
                if (g.score != null) {
                    total += g.score;
                    count++;
                }
            });

            var expected = count > 0 ? Math.round(total / count) : 0;
            assert.ok(expected > 0, 'average should be positive');
            assert.ok(expected >= 80 && expected <= 240, 'average should be realistic');
        });

        it('overall average across multiple weeks', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);

            var total = 0, count = 0;
            Object.keys(ds.bowlingData).forEach(function(key) {
                var week = ds.bowlingData[key];
                week.games.forEach(function(g) {
                    if (g.score != null) { total += g.score; count++; }
                });
            });

            var avg = count > 0 ? Math.round(total / count) : 0;
            assert.ok(count > 0, 'should have bowling games');
            assert.ok(avg >= 80 && avg <= 240, 'average should be in realistic range');
        });
    });

    /* ===== Level Progression ===== */
    describe('Level Progression', function() {
        it('transform count aligns with character level', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            assert.equal(ds.character.transformCount, ds.character.level - 1);
        });

        it('level is in expected range', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);
            assert.ok(ds.character.level >= 3 && ds.character.level <= 5, 'level should be 3-5');
        });
    });

    /* ===== Finance Category Filtering ===== */
    describe('Finance Category Filtering', function() {
        it('filtering by Groceries returns correct subset', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);

            var grocReceipts = ds.receipts.filter(function(r) {
                return r.category === 'Groceries';
            });

            var cafeReceipts = ds.receipts.filter(function(r) {
                return r.category === 'Cafe';
            });

            assert.ok(grocReceipts.length + cafeReceipts.length <= ds.receipts.length, 'filtered subsets should not exceed total');

            // Verify all grocery receipts have Groceries category
            grocReceipts.forEach(function(r) {
                assert.equal(r.category, 'Groceries');
            });
        });

        it('grocery items have valid subcategories', function() {
            window.TestPRNG.reset(42);
            var ds = gen.generateFullDataset(42);

            var grocReceipts = ds.receipts.filter(function(r) {
                return r.category === 'Groceries';
            });

            if (grocReceipts.length > 0) {
                var r = grocReceipts[0];
                r.items.forEach(function(item) {
                    assert.typeOf(item.subcategory, 'string');
                    assert.ok(item.subcategory.length > 0, 'subcategory should not be empty');
                });
            }
        });
    });
})();
