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

    /* ===== Garden v2 Generator ===== */
    function generateGardenSeed(type) {
        type = type || rng.pick(pools.PLANT_TYPES);
        var varieties = pools.PLANT_VARIETIES[type] || [];
        var variety = varieties.length ? rng.pick(varieties) : '';
        var emoji = pools.PLANT_EMOJIS[type] || '\ud83c\udf31';

        return {
            id: 'seed_' + Date.now() + '_' + randomSuffix(),
            plantName: type,
            variety: variety,
            emoji: emoji,
            daysToGerm: rng.randInt(3, 14),
            daysToTransplant: rng.randInt(21, 45),
            daysToFlower: rng.randInt(45, 90),
            daysToFruit: rng.randInt(60, 120),
            notes: '',
            historicalStats: {
                timesPlanted: 0,
                timesGerminated: 0,
                timesTransplanted: 0,
                totalYieldCount: 0,
                totalYieldWeight: 0
            },
            createdAt: new Date().toISOString()
        };
    }

    function generateGardenTray(seasonId, seeds, startDate) {
        var size = rng.pick([12, 24, 36, 72]);
        var cells = [];
        var filledCount = rng.randInt(Math.floor(size * 0.3), size);

        for (var i = 0; i < size; i++) {
            if (i < filledCount) {
                var seed = rng.pick(seeds);
                // Random stage progression
                var progression = ['planted', 'germinated', 'trueLeaves', 'readyToTransplant'];
                var stageIdx = rng.randInt(0, progression.length - 1);
                // Some cells fail
                var failed = rng.chance(0.1);
                var stage = failed ? 'failed' : progression[stageIdx];
                var cellDates = { planted: addDays(startDate, rng.randInt(0, 10)) };
                if (stageIdx >= 1 && !failed) cellDates.germinated = addDays(cellDates.planted, rng.randInt(3, 10));
                if (stageIdx >= 2 && !failed) cellDates.trueLeaves = addDays(cellDates.germinated, rng.randInt(3, 7));
                if (stageIdx >= 3 && !failed) cellDates.readyToTransplant = addDays(cellDates.trueLeaves, rng.randInt(5, 14));

                cells.push({
                    seedId: seed.id,
                    stage: stage,
                    plantedDate: cellDates.planted,
                    dates: cellDates
                });
            } else {
                cells.push({ seedId: null, stage: 'empty', plantedDate: null, dates: {} });
            }
        }

        var careLog = [];
        var numCare = rng.randInt(1, 5);
        for (var c = 0; c < numCare; c++) {
            careLog.push({
                date: addDays(startDate, rng.randInt(0, 30)),
                action: rng.pick(pools.CARE_ACTIONS),
                notes: '',
                timestamp: addDays(startDate, rng.randInt(0, 30)) + 'T12:00:00.000Z'
            });
        }

        return {
            id: 'tray_' + Date.now() + '_' + randomSuffix(),
            seasonId: seasonId,
            size: size,
            cells: cells,
            careLog: careLog,
            createdAt: new Date().toISOString()
        };
    }

    function generateGardenPlant(seedId, seasonId, trayId, startDate) {
        var stageIdx = rng.randInt(0, pools.PLANT_STAGES_V2.length - 2); // usually not dead
        var stage = pools.PLANT_STAGES_V2[stageIdx];
        var locType = rng.pick(pools.LOCATION_TYPES);

        var dates = { transplanted: startDate };
        if (stageIdx >= 1) dates.flowering = addDays(startDate, rng.randInt(14, 30));
        if (stageIdx >= 2) dates.fruiting = addDays(dates.flowering || startDate, rng.randInt(10, 25));
        if (stageIdx >= 3) dates.harvesting = addDays(dates.fruiting || startDate, rng.randInt(7, 20));

        var yieldEvents = [];
        if (stageIdx >= 3) { // harvesting or beyond
            var numYields = rng.randInt(1, 4);
            for (var y = 0; y < numYields; y++) {
                yieldEvents.push({
                    id: 'yield_' + Date.now() + '_' + randomSuffix(),
                    date: addDays(dates.harvesting || startDate, rng.randInt(0, 14)),
                    count: rng.randInt(1, 20),
                    weightGrams: rng.randInt(50, 2000),
                    notes: '',
                    timestamp: new Date().toISOString()
                });
            }
        }

        var careLog = [];
        var numCare = rng.randInt(0, 5);
        for (var c = 0; c < numCare; c++) {
            careLog.push({
                date: addDays(startDate, rng.randInt(0, 40)),
                action: rng.pick(pools.CARE_ACTIONS),
                notes: '',
                timestamp: new Date().toISOString()
            });
        }

        var healthNotes = [];
        var noteTexts = ['Looking healthy', 'Needs more water', 'Some yellowing', 'Strong growth', 'Pests noticed'];
        var numNotes = rng.randInt(0, 3);
        for (var n = 0; n < numNotes; n++) {
            healthNotes.push({
                date: addDays(startDate, rng.randInt(1, 30)),
                text: rng.pick(noteTexts),
                timestamp: new Date().toISOString()
            });
        }

        return {
            id: 'plant_' + Date.now() + '_' + randomSuffix(),
            seedId: seedId,
            seasonId: seasonId,
            trayId: trayId,
            cellIndex: 0,
            locationType: locType,
            locationLabel: locType === 'ground' ? 'Garden bed ' + rng.pick(['A', 'B', 'C']) : 'Pot ' + rng.randInt(1, 8),
            lifecycleStage: stage,
            transplantDate: startDate,
            dates: dates,
            yieldEvents: yieldEvents,
            careLog: careLog,
            healthNotes: healthNotes,
            isArchived: false,
            createdAt: new Date().toISOString()
        };
    }

    function generateGardenDataset(options, startDate) {
        options = options || {};
        startDate = startDate || '2026-01-20';
        var seedCount = options.seedCount || 6;
        var trayCount = options.trayCount || 3;
        var plantCount = options.plantCount || 8;

        // Seeds
        var seeds = [];
        var usedTypes = rng.pickN(pools.PLANT_TYPES, Math.min(seedCount, pools.PLANT_TYPES.length));
        for (var i = 0; i < seedCount; i++) {
            seeds.push(generateGardenSeed(usedTypes[i % usedTypes.length]));
        }

        // Seasons (1-2)
        var seasons = [{
            id: 'season_' + Date.now() + '_' + randomSuffix(),
            label: 'Spring 2026',
            startDate: startDate,
            endDate: addDays(startDate, 90),
            notes: '',
            isActive: true,
            createdAt: new Date().toISOString()
        }];
        if (rng.chance(0.4)) {
            seasons.push({
                id: 'season_' + Date.now() + '_' + randomSuffix(),
                label: 'Winter 2025',
                startDate: addDays(startDate, -90),
                endDate: addDays(startDate, -1),
                notes: '',
                isActive: false,
                createdAt: new Date().toISOString()
            });
        }
        var activeSeasonId = seasons[0].id;

        // Trays
        var trays = [];
        for (var t = 0; t < trayCount; t++) {
            trays.push(generateGardenTray(activeSeasonId, seeds, addDays(startDate, rng.randInt(0, 14))));
        }

        // Plants (transplanted from trays)
        var plants = [];
        for (var p = 0; p < plantCount; p++) {
            var seed = rng.pick(seeds);
            var tray = rng.pick(trays);
            plants.push(generateGardenPlant(seed.id, activeSeasonId, tray.id, addDays(startDate, rng.randInt(14, 40))));
        }

        // Mark some tray cells as transplanted for consistency
        plants.forEach(function(plant, idx) {
            var tray = trays.find(function(tr) { return tr.id === plant.trayId; });
            if (tray) {
                // Find an appropriate cell to mark as transplanted
                for (var ci = 0; ci < tray.cells.length; ci++) {
                    if (tray.cells[ci].stage === 'readyToTransplant') {
                        tray.cells[ci].stage = 'transplanted';
                        tray.cells[ci].dates.transplanted = plant.transplantDate;
                        plant.cellIndex = ci;
                        break;
                    }
                }
            }
        });

        // Update seed historicalStats
        seeds.forEach(function(seed) {
            var planted = 0, germinated = 0, transplanted = 0, yieldCount = 0, yieldWeight = 0;
            trays.forEach(function(tray) {
                tray.cells.forEach(function(cell) {
                    if (cell.seedId !== seed.id) return;
                    planted++;
                    if (cell.stage !== 'planted' && cell.stage !== 'empty' && cell.stage !== 'failed') germinated++;
                    if (cell.stage === 'transplanted') transplanted++;
                });
            });
            plants.forEach(function(pl) {
                if (pl.seedId !== seed.id) return;
                (pl.yieldEvents || []).forEach(function(y) {
                    yieldCount += y.count || 0;
                    yieldWeight += y.weightGrams || 0;
                });
            });
            seed.historicalStats = {
                timesPlanted: planted,
                timesGerminated: germinated,
                timesTransplanted: transplanted,
                totalYieldCount: yieldCount,
                totalYieldWeight: yieldWeight
            };
        });

        // Build XP log
        var xpLog = [];
        var totalXp = 0;

        function addXP(date, amount, reason) {
            totalXp += amount;
            xpLog.push({ date: date, amount: amount, reason: reason, timestamp: date + 'T12:00:00.000Z' });
        }

        // XP for seeds
        seeds.forEach(function(s) { addXP(startDate, 2, 'Added seed: ' + s.plantName); });

        // XP for tray cells
        trays.forEach(function(tray) {
            tray.cells.forEach(function(cell) {
                if (cell.stage === 'empty') return;
                var seed = seeds.find(function(s) { return s.id === cell.seedId; });
                var name = seed ? seed.plantName : 'Seed';
                addXP(cell.plantedDate || startDate, 3, 'Planted ' + name);
                if (['germinated', 'trueLeaves', 'readyToTransplant', 'transplanted'].indexOf(cell.stage) !== -1) {
                    addXP(cell.dates.germinated || startDate, 5, name + ' germinated');
                }
                if (['trueLeaves', 'readyToTransplant', 'transplanted'].indexOf(cell.stage) !== -1) {
                    addXP(cell.dates.trueLeaves || startDate, 3, name + ' true leaves');
                }
                if (['readyToTransplant', 'transplanted'].indexOf(cell.stage) !== -1) {
                    addXP(cell.dates.readyToTransplant || startDate, 3, name + ' ready');
                }
                if (cell.stage === 'transplanted') {
                    addXP(cell.dates.transplanted || startDate, 8, 'Transplanted ' + name);
                }
            });
        });

        // XP for plant stages
        plants.forEach(function(plant) {
            var seed = seeds.find(function(s) { return s.id === plant.seedId; });
            var name = seed ? seed.plantName : 'Plant';
            var stages = ['vegetative', 'flowering', 'fruiting', 'harvesting', 'dormant'];
            var currentIdx = stages.indexOf(plant.lifecycleStage);
            for (var si = 1; si <= currentIdx; si++) {
                addXP(plant.dates[stages[si]] || startDate, 5, name + ' → ' + stages[si]);
            }
            (plant.yieldEvents || []).forEach(function(y) { addXP(y.date, 5, name + ' yield +' + y.count); });
            (plant.careLog || []).forEach(function(c) { addXP(c.date, 1, 'Plant care: ' + c.action); });
            (plant.healthNotes || []).forEach(function(h) { addXP(h.date, 1, 'Health note added'); });
        });

        // XP for tray care
        trays.forEach(function(tray) {
            (tray.careLog || []).forEach(function(c) { addXP(c.date, 1, 'Tray care: ' + c.action); });
        });

        return {
            seasons: seasons,
            seeds: seeds,
            trays: trays,
            plants: plants,
            totalXp: totalXp,
            xpLog: xpLog,
            analyticsCache: {}
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

        // --- Garden (v2) ---
        var gardenData = generateGardenDataset({ seedCount: 6, trayCount: 3, plantCount: plantCount }, startDate);

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
        generateGardenSeed: generateGardenSeed,
        generateGardenTray: generateGardenTray,
        generateGardenPlant: generateGardenPlant,
        generateGardenDataset: generateGardenDataset,
        generateFullDataset: generateFullDataset
    };
})();
