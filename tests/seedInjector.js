/* --------------------------------
   seedInjector.js — Data Injection
   Injects generated data into localStorage
   following dataLoader.js patterns
----------------------------------*/
(function() {
    'use strict';

    /* ===== Known app localStorage key prefixes/keys ===== */
    const KNOWN_KEYS = [
        'levelUp:characterLevel',
        'levelUp:transformCount',
        'levelUp:exerciseResetAt',
        'finances:receipts',
        'finances:dataLoaded',
        'finances:dataVersion',
        'levelupFlashData',
        'nutrition:meals',
        'nutrition:targets',
        'nutrition:recipes',
        'calendar:events',
        'travel:trips'
    ];

    const KNOWN_PREFIXES = [
        'powerUp:',
        'bowling:week:'
    ];

    function isAppKey(key) {
        if (KNOWN_KEYS.indexOf(key) !== -1) return true;
        for (let i = 0; i < KNOWN_PREFIXES.length; i++) {
            if (key.startsWith(KNOWN_PREFIXES[i])) return true;
        }
        return false;
    }

    function getAllAppKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (isAppKey(k)) keys.push(k);
        }
        return keys;
    }

    /* ===== Full Reset Injection ===== */
    function injectFullReset(dataset) {
        if (!confirm('This will CLEAR all LevelUp app data and replace it with seed data.\n\nProceed?')) {
            console.log('Injection cancelled.');
            return false;
        }

        // Clear all app keys
        getAllAppKeys().forEach(function(k) {
            localStorage.removeItem(k);
        });

        return injectData(dataset);
    }

    /* ===== Append Injection ===== */
    function injectAppend(dataset) {
        return injectData(dataset, true);
    }

    /* ===== Core injection logic ===== */
    function injectData(dataset, appendMode) {
        if (!dataset) {
            console.error('No dataset provided');
            return false;
        }

        let counts = {
            workouts: 0,
            receipts: 0,
            flashcards: 0,
            meals: 0,
            trips: 0,
            bowlingWeeks: 0,
            events: 0
        };

        // --- Workouts ---
        if (dataset.workouts) {
            Object.keys(dataset.workouts).forEach(function(key) {
                if (appendMode && localStorage.getItem(key) != null) return;
                localStorage.setItem(key, JSON.stringify(dataset.workouts[key]));
                counts.workouts++;
            });
        }

        // --- Receipts ---
        if (dataset.receipts) {
            if (appendMode) {
                const existing = safeParse('finances:receipts') || [];
                const existingIds = new Set(existing.map(function(r) { return r.id; }));
                dataset.receipts.forEach(function(r) {
                    if (!existingIds.has(r.id)) {
                        existing.push(r);
                        counts.receipts++;
                    }
                });
                localStorage.setItem('finances:receipts', JSON.stringify(existing));
            } else {
                localStorage.setItem('finances:receipts', JSON.stringify(dataset.receipts));
                counts.receipts = dataset.receipts.length;
            }
            localStorage.setItem('finances:dataLoaded', 'true');
            localStorage.setItem('finances:dataVersion', 'seed');
        }

        // --- Flashcards ---
        if (dataset.flashData) {
            if (appendMode) {
                const existing = safeParse('levelupFlashData') || { flashcards: [] };
                const existingIds = new Set((existing.flashcards || []).map(function(c) { return c.id; }));
                (dataset.flashData.flashcards || []).forEach(function(card) {
                    if (!existingIds.has(card.id)) {
                        existing.flashcards.push(card);
                        counts.flashcards++;
                    }
                });
                existing.lastUpdated = new Date().toISOString();
                localStorage.setItem('levelupFlashData', JSON.stringify(existing));
            } else {
                localStorage.setItem('levelupFlashData', JSON.stringify(dataset.flashData));
                counts.flashcards = dataset.flashData.flashcards.length;
            }
        }

        // --- Nutrition Meals ---
        if (dataset.meals) {
            if (appendMode) {
                const existing = safeParse('nutrition:meals') || [];
                const existingIds = new Set(existing.map(function(m) { return m.id; }));
                dataset.meals.forEach(function(meal) {
                    if (!existingIds.has(meal.id)) {
                        existing.push(meal);
                        counts.meals++;
                    }
                });
                localStorage.setItem('nutrition:meals', JSON.stringify(existing));
            } else {
                localStorage.setItem('nutrition:meals', JSON.stringify(dataset.meals));
                counts.meals = dataset.meals.length;
            }
        }

        // --- Trips ---
        if (dataset.trips) {
            if (appendMode) {
                const existing = safeParse('travel:trips') || [];
                const existingIds = new Set(existing.map(function(t) { return t.id; }));
                dataset.trips.forEach(function(trip) {
                    if (!existingIds.has(trip.id)) {
                        existing.push(trip);
                        counts.trips++;
                    }
                });
                localStorage.setItem('travel:trips', JSON.stringify(existing));
            } else {
                localStorage.setItem('travel:trips', JSON.stringify(dataset.trips));
                counts.trips = dataset.trips.length;
            }
        }

        // --- Bowling ---
        if (dataset.bowlingData) {
            Object.keys(dataset.bowlingData).forEach(function(key) {
                if (appendMode && localStorage.getItem(key) != null) return;
                localStorage.setItem(key, JSON.stringify(dataset.bowlingData[key]));
                counts.bowlingWeeks++;
            });
        }

        // --- Calendar Events ---
        if (dataset.events) {
            if (appendMode) {
                const existing = safeParse('calendar:events') || [];
                const existingIds = new Set(existing.map(function(e) { return e.id; }));
                dataset.events.forEach(function(evt) {
                    if (!existingIds.has(evt.id)) {
                        existing.push(evt);
                        counts.events++;
                    }
                });
                localStorage.setItem('calendar:events', JSON.stringify(existing));
            } else {
                localStorage.setItem('calendar:events', JSON.stringify(dataset.events));
                counts.events = dataset.events.length;
            }
        }

        // --- Character ---
        if (dataset.character) {
            if (!appendMode || !localStorage.getItem('levelUp:characterLevel')) {
                localStorage.setItem('levelUp:characterLevel', String(dataset.character.level));
                localStorage.setItem('levelUp:transformCount', String(dataset.character.transformCount));
                localStorage.setItem('levelUp:exerciseResetAt', dataset.character.exerciseResetAt);
            }
        }

        console.log('Seed injection complete:', counts);
        return counts;
    }

    /* ===== Clear All Data ===== */
    function clearAllData() {
        if (!confirm('This will DELETE all LevelUp app data from localStorage.\n\nProceed?')) {
            console.log('Clear cancelled.');
            return false;
        }

        const keys = getAllAppKeys();
        keys.forEach(function(k) {
            localStorage.removeItem(k);
        });

        console.log('Cleared ' + keys.length + ' app keys.');
        return keys.length;
    }

    /* ===== Print Summary ===== */
    function printDataSummary() {
        const summary = {};

        // Workouts
        let workoutCount = 0;
        let totalVolume = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && /^powerUp:\d{4}-\d{2}-\d{2}$/.test(k)) {
                workoutCount++;
                const w = safeParse(k);
                if (w && w.exercises) {
                    w.exercises.forEach(function(ex) {
                        (ex.sets || []).forEach(function(s) {
                            if (s.weight > 0 && s.reps > 0) totalVolume += s.weight * s.reps;
                        });
                    });
                }
            }
        }
        summary['Workouts'] = workoutCount + ' days, ' + totalVolume.toLocaleString() + ' total volume';

        // Receipts
        const receipts = safeParse('finances:receipts') || [];
        const receiptTotal = receipts.reduce(function(s, r) { return s + (Number(r.total) || 0); }, 0);
        summary['Receipts'] = receipts.length + ' receipts, $' + receiptTotal.toFixed(2) + ' total';

        // Flashcards
        const flash = safeParse('levelupFlashData') || {};
        const cards = flash.flashcards || [];
        const mastered = cards.filter(function(c) { return c.state === 'mastered'; }).length;
        summary['Flashcards'] = cards.length + ' cards, ' + mastered + ' mastered';

        // Meals
        const meals = safeParse('nutrition:meals') || [];
        const mealDates = new Set(meals.map(function(m) { return m.date; }));
        summary['Meals'] = meals.length + ' meals across ' + mealDates.size + ' days';

        // Trips
        const trips = safeParse('travel:trips') || [];
        summary['Trips'] = trips.length + ' trips';

        // Bowling
        let bowlWeeks = 0;
        let bowlGames = 0;
        let bowlTotal = 0;
        for (let j = 0; j < localStorage.length; j++) {
            const bk = localStorage.key(j);
            if (bk && bk.startsWith('bowling:week:')) {
                bowlWeeks++;
                const week = safeParse(bk);
                if (week && week.games) {
                    week.games.forEach(function(g) {
                        if (g.score != null) { bowlGames++; bowlTotal += g.score; }
                    });
                }
            }
        }
        const bowlAvg = bowlGames > 0 ? Math.round(bowlTotal / bowlGames) : 0;
        summary['Bowling'] = bowlWeeks + ' weeks, ' + bowlGames + ' games, avg ' + bowlAvg;

        // Events
        const events = safeParse('calendar:events') || [];
        summary['Events'] = events.length + ' events';

        // Character
        const level = localStorage.getItem('levelUp:characterLevel') || 'none';
        const transforms = localStorage.getItem('levelUp:transformCount') || '0';
        summary['Character'] = 'Level ' + level + ', ' + transforms + ' transforms';

        console.log('===== LevelUp Data Summary =====');
        console.table(summary);
        return summary;
    }

    function safeParse(key) {
        try { return JSON.parse(localStorage.getItem(key)); }
        catch(e) { return null; }
    }

    window.SeedInjector = {
        injectFullReset: injectFullReset,
        injectAppend: injectAppend,
        clearAllData: clearAllData,
        printDataSummary: printDataSummary
    };
})();
