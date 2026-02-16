/* --------------------------------
   seedGenerator.js — Dummy Data Factory
   Generates complete data objects matching
   each localStorage schema
----------------------------------*/
(function() {
    'use strict';

    const rng = window.TestPRNG;
    const pools = window.DataPools;

    /* ===== ID helpers ===== */
    function randomSuffix() {
        let s = '';
        for (let i = 0; i < 4; i++) {
            s += 'abcdefghijklmnopqrstuvwxyz'[rng.randInt(0, 25)];
        }
        return s;
    }

    /* ===== Date helpers ===== */
    function addDays(isoDate, n) {
        const d = new Date(isoDate + 'T12:00:00');
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
    }

    function dateRange(startISO, days) {
        const dates = [];
        for (let i = 0; i < days; i++) {
            dates.push(addDays(startISO, i));
        }
        return dates;
    }

    /* ===== Workout Generator ===== */
    function generateWorkout(date) {
        const numExercises = rng.randInt(3, 6);
        const parts = rng.pickN(pools.BODY_PARTS, numExercises);
        const exercises = parts.map(function(part) {
            const exerciseList = pools.EXERCISES_BY_PART[part] || ['Exercise'];
            const name = rng.pick(exerciseList);
            const numSets = rng.randInt(3, 5);
            const weightRange = pools.WEIGHT_RANGES[part] || [0, 0];
            const repRange = pools.REP_RANGES[part] || [8, 12];
            const baseWeight = rng.randInt(weightRange[0], weightRange[1]);

            const sets = [];
            for (let i = 0; i < numSets; i++) {
                // Slight variation per set
                const weight = part === 'Cardio' ? 0 : Math.max(0, baseWeight + rng.randInt(-10, 10));
                const reps = rng.randInt(repRange[0], repRange[1]);
                sets.push({
                    weight: Math.round(weight / 5) * 5, // round to nearest 5
                    reps: reps,
                    done: true
                });
            }

            return {
                name: name,
                bodyPart: part,
                sets: sets
            };
        });

        return {
            date: date,
            exercises: exercises
        };
    }

    /* ===== Receipt Generator ===== */
    function generateReceipt(date, store) {
        store = store || rng.pick(pools.STORES);
        const isCafe = store === 'Starbucks';
        const numItems = isCafe ? rng.randInt(1, 3) : rng.randInt(4, 15);
        const itemPool = isCafe ? pools.CAFE_ITEMS : pools.GROCERY_ITEMS;
        const category = isCafe ? 'Cafe' : 'Groceries';

        const selectedItems = rng.pickN(itemPool, numItems);
        let subtotal = 0;

        const items = selectedItems.map(function(item) {
            const qty = isCafe ? 1 : rng.randInt(1, 3);
            const price = parseFloat((item.price * (0.9 + rng.raw() * 0.2)).toFixed(2)); // slight price variation
            const lineTotal = parseFloat((price * qty).toFixed(2));
            subtotal += lineTotal;

            const result = {
                name: item.name,
                price: price,
                quantity: qty,
                category: category,
                subcategory: item.subcategory || category,
                store: store,
                storePrice: price,
                pricePerUnit: price
            };
            return result;
        });

        subtotal = parseFloat(subtotal.toFixed(2));
        const tax = isCafe ? parseFloat((subtotal * 0.08).toFixed(2)) : 0;
        const total = parseFloat((subtotal + tax).toFixed(2));

        const dateClean = date.replace(/-/g, '');
        const id = 'receipt_' + store.toLowerCase().replace(/[^a-z]/g, '') + '_' + dateClean;

        return {
            id: id,
            date: date,
            store: store,
            storeLocation: store + ' Location',
            category: category,
            items: items,
            subtotal: subtotal,
            tax: tax,
            total: total,
            notes: store + ' receipt - ' + date
        };
    }

    /* ===== Flashcard Generator ===== */
    function generateFlashcardSet(count) {
        count = count || 50;
        const pairs = rng.shuffle([...pools.FLASH_PAIRS]);
        const cards = [];

        for (let i = 0; i < count; i++) {
            const pair = pairs[i % pairs.length];
            const id = 'card_' + (Date.now() + i) + '_' + randomSuffix();

            // State distribution: 40% new, 25% learning, 20% learned, 15% mastered
            let state, timesStudied, timesCorrect;
            const roll = rng.raw();
            if (roll < 0.40) {
                state = 'new';
                timesStudied = 0;
                timesCorrect = 0;
            } else if (roll < 0.65) {
                state = 'learning';
                timesStudied = rng.randInt(2, 5);
                timesCorrect = rng.randInt(1, timesStudied);
            } else if (roll < 0.85) {
                state = 'learned';
                timesStudied = rng.randInt(5, 10);
                timesCorrect = rng.randInt(3, timesStudied);
            } else {
                state = 'mastered';
                timesStudied = rng.randInt(8, 15);
                timesCorrect = rng.randInt(5, timesStudied);
            }

            // Add suffix for duplicates beyond the pool size
            const suffix = i >= pairs.length ? ' (' + Math.floor(i / pairs.length + 1) + ')' : '';

            cards.push({
                id: id,
                front: pair.front + suffix,
                back: pair.back + suffix,
                category: pair.category,
                state: state,
                timesStudied: timesStudied,
                timesCorrect: timesCorrect,
                lastStudied: state === 'new' ? null : addDays('2026-02-14', -rng.randInt(1, 30)) + 'T12:00:00Z',
                created: addDays('2026-01-01', rng.randInt(0, 40)) + 'T12:00:00.000Z',
                difficulty: state === 'mastered' ? rng.randInt(1, 2) : rng.randInt(1, 5)
            });
        }

        return {
            flashcards: cards,
            version: '2.0',
            lastUpdated: new Date().toISOString()
        };
    }

    /* ===== Meal Generator ===== */
    function generateMeal(date, mealName) {
        const numIngredients = rng.randInt(2, 5);
        const selectedIngredients = rng.pickN(pools.INGREDIENTS, numIngredients);

        let totalCal = 0, totalPro = 0, totalCarbs = 0, totalFat = 0, totalCost = 0;

        const ingredients = selectedIngredients.map(function(ing) {
            const grams = rng.randInt(50, 300);
            const factor = grams / 100;
            const cal = Math.round(ing.caloriesPer100g * factor);
            const pro = parseFloat((ing.protein * factor).toFixed(1));
            const carbs = parseFloat((ing.carbs * factor).toFixed(1));
            const fat = parseFloat((ing.fat * factor).toFixed(1));
            const cost = parseFloat((rng.randFloat(0.50, 3.00)).toFixed(2));

            totalCal += cal;
            totalPro += pro;
            totalCarbs += carbs;
            totalFat += fat;
            totalCost += cost;

            return {
                name: ing.name,
                amount: grams,
                unit: 'g',
                calories: cal,
                protein: pro,
                carbs: carbs,
                fat: fat,
                cost: cost
            };
        });

        return {
            id: 'meal_' + Date.now() + '_' + randomSuffix(),
            date: date,
            name: mealName,
            ingredients: ingredients,
            totals: {
                calories: Math.round(totalCal),
                protein: parseFloat(totalPro.toFixed(1)),
                carbs: parseFloat(totalCarbs.toFixed(1)),
                fat: parseFloat(totalFat.toFixed(1)),
                cost: parseFloat(totalCost.toFixed(2))
            }
        };
    }

    /* ===== Nutrition Day Generator ===== */
    function generateNutritionDay(date) {
        const numMeals = rng.randInt(3, 4);
        const mealNames = pools.MEAL_NAMES.slice(0, numMeals);
        return mealNames.map(function(name) {
            return generateMeal(date, name);
        });
    }

    /* ===== Trip Generator ===== */
    function generateTrip() {
        const name = rng.pick(pools.TRIP_NAMES);
        const startOffset = rng.randInt(10, 90);
        const duration = rng.randInt(3, 14);
        const startDate = addDays('2026-02-14', startOffset);
        const endDate = addDays(startDate, duration);
        const numDests = rng.randInt(2, 4);
        const destNames = rng.pickN(pools.DEST_NAMES, numDests);

        const destinations = destNames.map(function(dest) {
            return {
                name: dest,
                arrivalDate: addDays(startDate, rng.randInt(0, duration - 1)),
                notes: ''
            };
        });

        return {
            id: 'trip_' + Date.now() + '_' + randomSuffix(),
            name: name,
            title: name,
            startDate: startDate,
            endDate: endDate,
            destinations: destinations
        };
    }

    /* ===== Bowling Generator ===== */
    function generateBowlingWeek(weekId) {
        const numGames = 3;
        const games = [];

        // Parse week to get a reasonable date
        const parts = weekId.split('-W');
        const year = parseInt(parts[0]);
        const weekNum = parseInt(parts[1]);
        // Approximate date from week number
        const jan1 = new Date(year, 0, 1);
        const baseDate = new Date(jan1.getTime() + (weekNum - 1) * 7 * 86400000);

        for (let i = 0; i < numGames; i++) {
            // Realistic bowling: mostly 100-200, occasional high/low
            const score = rng.randInt(80, 240);
            const gameDate = new Date(baseDate.getTime() + i * 86400000);
            games.push({
                score: score,
                completedDate: gameDate.toISOString().slice(0, 10)
            });
        }

        return {
            weekId: weekId,
            games: games
        };
    }

    /* ===== Calendar Event Generator ===== */
    function generateCalendarEvent(date) {
        const title = rng.pick(pools.EVENT_TITLES);
        const category = rng.pick(pools.EVENT_CATEGORIES);
        const hasXP = category === 'workout' || category === 'study';

        return {
            id: 'evt_' + Date.now() + '_' + randomSuffix(),
            date: date,
            title: title,
            category: category,
            notes: '',
            xpCategory: hasXP ? category : null,
            xpAmount: hasXP ? rng.randInt(50, 500) : 0
        };
    }

    /* ===== Plant Generator ===== */
    function generatePlant(date) {
        var type = rng.pick(pools.PLANT_TYPES);
        var varieties = pools.PLANT_VARIETIES[type] || [];
        var variety = varieties.length ? rng.pick(varieties) : '';
        var emoji = pools.PLANT_EMOJIS[type] || '\ud83c\udf31';

        // Randomly pick a status along the progression
        var statusIdx = rng.randInt(0, pools.PLANT_STATUSES.length - 1);
        var status = pools.PLANT_STATUSES[statusIdx];

        // Build dates based on status
        var dates = {
            seeded: date,
            germinated: null,
            transplantedContainer: null,
            hardened: null,
            transplantedGround: null,
            firstHarvest: null,
            completed: null
        };

        var dateKeys = ['seeded', 'germinated', 'transplantedContainer', 'hardened', 'transplantedGround', 'firstHarvest', 'completed'];
        for (var i = 1; i <= statusIdx; i++) {
            dates[dateKeys[i]] = addDays(date, i * rng.randInt(3, 10));
        }

        // Generate measurements
        var numMeasurements = rng.randInt(0, Math.min(statusIdx + 1, 5));
        var measurements = [];
        for (var m = 0; m < numMeasurements; m++) {
            measurements.push({
                date: addDays(date, rng.randInt(1, 30)),
                height_in: parseFloat((rng.randFloat(0.5, 24)).toFixed(1))
            });
        }

        // Generate yield for harvesting/completed
        var yieldCount = 0;
        var yieldUnit = rng.pick(pools.YIELD_UNITS);
        if (statusIdx >= 5) { // Harvesting or Completed
            yieldCount = rng.randInt(1, 30);
        }

        // Generate notes
        var numNotes = rng.randInt(0, 3);
        var notes = [];
        var noteTexts = ['Looking healthy', 'Needs more water', 'First leaves appeared', 'Transplanted successfully', 'Strong growth this week'];
        for (var n = 0; n < numNotes; n++) {
            notes.push({
                date: addDays(date, rng.randInt(1, 30)),
                text: rng.pick(noteTexts)
            });
        }

        // XP calculation
        var xpValues = { 'Seeded': 3, 'Germinated': 5, 'Indoor': 5, 'Hardened': 3, 'In Ground': 8, 'Harvesting': 10, 'Completed': 5 };
        var xpAwarded = 0;
        for (var x = 0; x <= statusIdx; x++) {
            xpAwarded += xpValues[pools.PLANT_STATUSES[x]] || 0;
        }
        xpAwarded += numMeasurements; // 1 XP per measurement
        xpAwarded += numNotes; // 1 XP per note
        if (yieldCount > 0) xpAwarded += 5; // additionalHarvest

        return {
            id: 'plant_' + Date.now() + '_' + randomSuffix(),
            type: type,
            variety: variety,
            emoji: emoji,
            status: status,
            dates: dates,
            measurements: measurements,
            yield: { count: yieldCount, unit: yieldUnit },
            notes: notes,
            xpAwarded: xpAwarded
        };
    }

    function generateGardenDataset(count, startDate) {
        count = count || 8;
        startDate = startDate || '2026-01-20';
        var plants = [];
        var activities = [];
        var totalXp = 0;

        for (var i = 0; i < count; i++) {
            var pDate = addDays(startDate, rng.randInt(0, 30));
            var plant = generatePlant(pDate);
            plants.push(plant);
            totalXp += plant.xpAwarded;

            // Generate activity log entries for this plant
            activities.push({
                date: pDate,
                type: 'xp',
                detail: 'Planted ' + plant.type,
                xp: 3,
                timestamp: pDate + 'T12:00:00.000Z'
            });
        }

        return {
            plants: plants,
            activities: activities,
            totalXp: totalXp
        };
    }

    /* ===== Master Dataset Generator ===== */
    function generateFullDataset(seed, options) {
        options = options || {};
        if (seed != null) rng.reset(seed);

        var workoutCount = options.workoutDays || 30;
        var receiptCount = options.receiptCount || 18;
        var flashcardCount = options.flashcardCount || 50;
        var nutritionDays = options.nutritionDays || 20;
        var tripCount = options.tripCount || 2;
        var bowlingWeeks = options.bowlingWeeks || 8;
        var eventCount = options.eventCount || 10;
        var plantCount = options.plantCount || 8;
        var skipRate = options.skipRate || 0.3;

        // Generate date ranges
        var startDate = options.startDate || '2026-01-15';

        // --- Workouts ---
        var workouts = {};
        var allDates = dateRange(startDate, workoutCount + 10); // extra days for skipping
        var generated = 0;
        for (var i = 0; i < allDates.length && generated < workoutCount; i++) {
            if (rng.chance(skipRate)) continue; // skip ~30% of days
            var workout = generateWorkout(allDates[i]);
            workouts['powerUp:' + allDates[i]] = workout;
            generated++;
        }

        // --- Receipts ---
        var receipts = [];
        var receiptDates = dateRange(startDate, 60); // 2 month range
        for (var j = 0; j < receiptCount; j++) {
            var rDate = rng.pick(receiptDates);
            var receipt = generateReceipt(rDate);
            // Ensure unique IDs
            receipt.id = receipt.id + '_' + j;
            receipts.push(receipt);
        }

        // --- Flashcards ---
        var flashData = generateFlashcardSet(flashcardCount);

        // --- Nutrition ---
        var meals = [];
        var nutDates = dateRange(addDays(startDate, -5), nutritionDays + 10);
        var nutGenerated = 0;
        for (var k = 0; k < nutDates.length && nutGenerated < nutritionDays; k++) {
            if (rng.chance(0.2)) continue; // skip some days
            var dayMeals = generateNutritionDay(nutDates[k]);
            meals = meals.concat(dayMeals);
            nutGenerated++;
        }

        // --- Trips ---
        var trips = [];
        for (var t = 0; t < tripCount; t++) {
            trips.push(generateTrip());
        }

        // --- Bowling ---
        var bowlingData = {};
        var currentWeek = 1;
        for (var b = 0; b < bowlingWeeks; b++) {
            var weekId = '2026-W' + String(currentWeek).padStart(2, '0');
            bowlingData['bowling:week:' + weekId] = generateBowlingWeek(weekId);
            currentWeek += rng.randInt(1, 2); // sometimes skip a week
        }

        // --- Calendar Events ---
        var events = [];
        var eventDates = dateRange(startDate, 45);
        for (var e = 0; e < eventCount; e++) {
            var eDate = rng.pick(eventDates);
            events.push(generateCalendarEvent(eDate));
        }

        // --- Garden ---
        var gardenData = generateGardenDataset(plantCount, startDate);

        // --- Character ---
        var characterLevel = rng.randInt(3, 5);
        var transformCount = characterLevel - 1;

        return {
            workouts: workouts,
            receipts: receipts,
            flashData: flashData,
            meals: meals,
            trips: trips,
            bowlingData: bowlingData,
            events: events,
            gardenData: gardenData,
            character: {
                level: characterLevel,
                transformCount: transformCount,
                exerciseResetAt: addDays('2026-02-14', -rng.randInt(5, 20))
            }
        };
    }

    window.SeedGenerator = {
        generateWorkout: generateWorkout,
        generateReceipt: generateReceipt,
        generateFlashcardSet: generateFlashcardSet,
        generateMeal: generateMeal,
        generateNutritionDay: generateNutritionDay,
        generateTrip: generateTrip,
        generateBowlingWeek: generateBowlingWeek,
        generateCalendarEvent: generateCalendarEvent,
        generatePlant: generatePlant,
        generateGardenDataset: generateGardenDataset,
        generateFullDataset: generateFullDataset
    };
})();
