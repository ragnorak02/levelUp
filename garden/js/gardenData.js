/* --------------------------------
   GardenDataManager — Data Layer
   Storage: gardenData_v2 (single key)
----------------------------------*/
(function() {
    'use strict';

    var STORAGE_KEY = 'gardenData_v2';
    var OLD_KEYS = ['garden:plants', 'garden:totalXp', 'garden:activities'];

    var TRAY_SIZES = [6, 12, 24, 36, 48, 72, 128];

    var CELL_STAGES = ['empty', 'planted', 'germinated', 'trueLeaves', 'readyToTransplant', 'transplanted', 'failed'];
    var PLANT_STAGES = ['vegetative', 'flowering', 'fruiting', 'harvesting', 'dormant', 'dead'];

    var XP_AWARDS = {
        plantSeed: 3,
        cellGerminated: 5,
        cellTrueLeaves: 3,
        cellReady: 3,
        transplant: 8,
        plantAdvance: 5,
        yieldEvent: 5,
        careLog: 1,
        healthNote: 1,
        newSeed: 2
    };

    var PLANT_EMOJIS = {
        'Tomato': '\ud83c\udf45',
        'Pepper': '\ud83c\udf36\ufe0f',
        'Green Onion': '\ud83e\uddc5',
        'Potato': '\ud83e\udd54',
        'Carrot': '\ud83e\udd55',
        'Lettuce': '\ud83e\udd6c',
        'Spinach': '\ud83e\udd6c',
        'Herbs': '\ud83c\udf3f',
        'Strawberry': '\ud83c\udf53',
        'Cucumber': '\ud83e\udd52'
    };

    /* ===== Helpers ===== */
    function genId(prefix) {
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    }

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function emptyData() {
        return {
            seasons: [],
            seeds: [],
            trays: [],
            plants: [],
            totalXp: 0,
            xpLog: [],
            analyticsCache: {}
        };
    }

    /* ===== GardenDataManager ===== */
    function GardenDataManager() {}

    /* --- Storage --- */
    GardenDataManager.prototype.load = function() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return emptyData();
            var data = JSON.parse(raw);
            // Ensure all arrays exist
            data.seasons = data.seasons || [];
            data.seeds = data.seeds || [];
            data.trays = data.trays || [];
            data.plants = data.plants || [];
            data.xpLog = data.xpLog || [];
            data.totalXp = data.totalXp || 0;
            return data;
        } catch (e) {
            return emptyData();
        }
    };

    GardenDataManager.prototype.save = function(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };

    GardenDataManager.prototype.clearOldData = function() {
        OLD_KEYS.forEach(function(k) {
            localStorage.removeItem(k);
        });
    };

    /* --- XP --- */
    GardenDataManager.prototype.awardXP = function(data, amount, reason) {
        data.totalXp = (data.totalXp || 0) + amount;
        data.xpLog.push({
            date: todayISO(),
            amount: amount,
            reason: reason,
            timestamp: new Date().toISOString()
        });
    };

    /* --- Seasons --- */
    GardenDataManager.prototype.createSeason = function(label, startDate, endDate, notes) {
        var data = this.load();
        // Deactivate all others
        data.seasons.forEach(function(s) { s.isActive = false; });
        var season = {
            id: genId('season'),
            label: label,
            startDate: startDate || todayISO(),
            endDate: endDate || '',
            notes: notes || '',
            isActive: true,
            createdAt: new Date().toISOString()
        };
        data.seasons.push(season);
        this.save(data);
        return season;
    };

    GardenDataManager.prototype.getActiveSeason = function() {
        var data = this.load();
        return data.seasons.find(function(s) { return s.isActive; }) || null;
    };

    GardenDataManager.prototype.setActiveSeason = function(id) {
        var data = this.load();
        data.seasons.forEach(function(s) { s.isActive = (s.id === id); });
        this.save(data);
    };

    GardenDataManager.prototype.updateSeason = function(id, updates) {
        var data = this.load();
        var season = data.seasons.find(function(s) { return s.id === id; });
        if (!season) return null;
        Object.assign(season, updates);
        this.save(data);
        return season;
    };

    GardenDataManager.prototype.deleteSeason = function(id) {
        var data = this.load();
        var hasDeps = data.trays.some(function(t) { return t.seasonId === id; }) ||
                      data.plants.some(function(p) { return p.seasonId === id; });
        if (hasDeps) return false;
        data.seasons = data.seasons.filter(function(s) { return s.id !== id; });
        this.save(data);
        return true;
    };

    GardenDataManager.prototype.getAllSeasons = function() {
        return this.load().seasons;
    };

    /* --- Seeds --- */
    GardenDataManager.prototype.addSeed = function(plantName, variety, daysToGerm, daysToTransplant, daysToFlower, daysToFruit, notes) {
        var data = this.load();
        var seed = {
            id: genId('seed'),
            plantName: plantName,
            variety: variety || '',
            emoji: PLANT_EMOJIS[plantName] || '\ud83c\udf31',
            daysToGerm: Number(daysToGerm) || 0,
            daysToTransplant: Number(daysToTransplant) || 0,
            daysToFlower: Number(daysToFlower) || 0,
            daysToFruit: Number(daysToFruit) || 0,
            notes: notes || '',
            historicalStats: {
                timesPlanted: 0,
                timesGerminated: 0,
                timesTransplanted: 0,
                totalYieldCount: 0,
                totalYieldWeight: 0
            },
            createdAt: new Date().toISOString()
        };
        data.seeds.push(seed);
        this.awardXP(data, XP_AWARDS.newSeed, 'Added seed: ' + plantName);
        this.save(data);
        return seed;
    };

    GardenDataManager.prototype.updateSeed = function(id, updates) {
        var data = this.load();
        var seed = data.seeds.find(function(s) { return s.id === id; });
        if (!seed) return null;
        // Don't overwrite historicalStats with partial updates
        if (updates.historicalStats) {
            Object.assign(seed.historicalStats, updates.historicalStats);
            delete updates.historicalStats;
        }
        Object.assign(seed, updates);
        if (updates.plantName) {
            seed.emoji = PLANT_EMOJIS[updates.plantName] || seed.emoji;
        }
        this.save(data);
        return seed;
    };

    GardenDataManager.prototype.deleteSeed = function(id) {
        var data = this.load();
        // Check if referenced by active tray cells
        var inUse = data.trays.some(function(tray) {
            return tray.cells.some(function(cell) {
                return cell.seedId === id && cell.stage !== 'failed' && cell.stage !== 'transplanted';
            });
        });
        if (inUse) return false;
        data.seeds = data.seeds.filter(function(s) { return s.id !== id; });
        this.save(data);
        return true;
    };

    GardenDataManager.prototype.getAllSeeds = function() {
        return this.load().seeds;
    };

    GardenDataManager.prototype.getSeed = function(id) {
        return this.load().seeds.find(function(s) { return s.id === id; }) || null;
    };

    GardenDataManager.prototype.updateSeedStats = function(seedId) {
        var data = this.load();
        var seed = data.seeds.find(function(s) { return s.id === seedId; });
        if (!seed) return;

        var planted = 0, germinated = 0, transplanted = 0, yieldCount = 0, yieldWeight = 0;

        data.trays.forEach(function(tray) {
            tray.cells.forEach(function(cell) {
                if (cell.seedId !== seedId) return;
                planted++;
                if (CELL_STAGES.indexOf(cell.stage) >= CELL_STAGES.indexOf('germinated') && cell.stage !== 'failed') {
                    germinated++;
                }
                if (cell.stage === 'transplanted') {
                    transplanted++;
                }
            });
        });

        data.plants.forEach(function(p) {
            if (p.seedId !== seedId) return;
            transplanted = Math.max(transplanted, planted); // ensure transplanted from plants too
            (p.yieldEvents || []).forEach(function(y) {
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
        this.save(data);
    };

    /* --- Trays --- */
    GardenDataManager.prototype.createTray = function(seasonId, size) {
        var data = this.load();
        if (TRAY_SIZES.indexOf(size) === -1) size = 12;
        var cells = [];
        for (var i = 0; i < size; i++) {
            cells.push({ seedId: null, stage: 'empty', plantedDate: null, dates: {} });
        }
        var tray = {
            id: genId('tray'),
            seasonId: seasonId,
            size: size,
            cells: cells,
            careLog: [],
            createdAt: new Date().toISOString()
        };
        data.trays.push(tray);
        this.save(data);
        return tray;
    };

    GardenDataManager.prototype.getTray = function(id) {
        return this.load().trays.find(function(t) { return t.id === id; }) || null;
    };

    GardenDataManager.prototype.getTraysForSeason = function(seasonId) {
        return this.load().trays.filter(function(t) { return t.seasonId === seasonId; });
    };

    GardenDataManager.prototype.deleteTray = function(id) {
        var data = this.load();
        var tray = data.trays.find(function(t) { return t.id === id; });
        if (!tray) return false;
        var hasTransplanted = tray.cells.some(function(c) { return c.stage === 'transplanted'; });
        if (hasTransplanted) return false;
        data.trays = data.trays.filter(function(t) { return t.id !== id; });
        this.save(data);
        return true;
    };

    GardenDataManager.prototype.plantCell = function(trayId, cellIndex, seedId) {
        var data = this.load();
        var tray = data.trays.find(function(t) { return t.id === trayId; });
        if (!tray || cellIndex < 0 || cellIndex >= tray.cells.length) return null;
        var cell = tray.cells[cellIndex];
        if (cell.stage !== 'empty') return null;
        cell.seedId = seedId;
        cell.stage = 'planted';
        cell.plantedDate = todayISO();
        cell.dates.planted = todayISO();
        var seed = data.seeds.find(function(s) { return s.id === seedId; });
        var name = seed ? seed.plantName : 'Seed';
        this.awardXP(data, XP_AWARDS.plantSeed, 'Planted ' + name + ' in tray');
        this.save(data);
        return cell;
    };

    GardenDataManager.prototype.advanceCellStage = function(trayId, cellIndex) {
        var data = this.load();
        var tray = data.trays.find(function(t) { return t.id === trayId; });
        if (!tray || cellIndex < 0 || cellIndex >= tray.cells.length) return null;
        var cell = tray.cells[cellIndex];

        var progression = ['planted', 'germinated', 'trueLeaves', 'readyToTransplant'];
        var idx = progression.indexOf(cell.stage);
        if (idx === -1 || idx >= progression.length - 1) return null;

        var nextStage = progression[idx + 1];
        cell.stage = nextStage;
        cell.dates[nextStage] = todayISO();

        var seed = data.seeds.find(function(s) { return s.id === cell.seedId; });
        var name = seed ? seed.plantName : 'Cell';

        var xpMap = {
            germinated: XP_AWARDS.cellGerminated,
            trueLeaves: XP_AWARDS.cellTrueLeaves,
            readyToTransplant: XP_AWARDS.cellReady
        };
        this.awardXP(data, xpMap[nextStage] || 0, name + ' → ' + nextStage);
        this.save(data);
        return cell;
    };

    GardenDataManager.prototype.transplantCell = function(trayId, cellIndex, locationType, locationLabel) {
        var data = this.load();
        var tray = data.trays.find(function(t) { return t.id === trayId; });
        if (!tray || cellIndex < 0 || cellIndex >= tray.cells.length) return null;
        var cell = tray.cells[cellIndex];
        if (cell.stage !== 'readyToTransplant') return null;

        cell.stage = 'transplanted';
        cell.dates.transplanted = todayISO();

        var seed = data.seeds.find(function(s) { return s.id === cell.seedId; });
        var name = seed ? seed.plantName : 'Plant';
        var variety = seed ? seed.variety : '';

        var plant = {
            id: genId('plant'),
            seedId: cell.seedId,
            seasonId: tray.seasonId,
            trayId: trayId,
            cellIndex: cellIndex,
            locationType: locationType || 'ground',
            locationLabel: locationLabel || '',
            lifecycleStage: 'vegetative',
            transplantDate: todayISO(),
            dates: {
                transplanted: todayISO()
            },
            yieldEvents: [],
            careLog: [],
            healthNotes: [],
            isArchived: false,
            createdAt: new Date().toISOString()
        };
        data.plants.push(plant);
        this.awardXP(data, XP_AWARDS.transplant, 'Transplanted ' + name + (variety ? ' (' + variety + ')' : ''));
        this.save(data);
        return plant;
    };

    GardenDataManager.prototype.failCell = function(trayId, cellIndex) {
        var data = this.load();
        var tray = data.trays.find(function(t) { return t.id === trayId; });
        if (!tray || cellIndex < 0 || cellIndex >= tray.cells.length) return null;
        var cell = tray.cells[cellIndex];
        cell.stage = 'failed';
        cell.dates.failed = todayISO();
        this.save(data);
        return cell;
    };

    GardenDataManager.prototype.addTrayCareLog = function(trayId, action, notes) {
        var data = this.load();
        var tray = data.trays.find(function(t) { return t.id === trayId; });
        if (!tray) return null;
        var entry = { date: todayISO(), action: action, notes: notes || '', timestamp: new Date().toISOString() };
        tray.careLog.push(entry);
        this.awardXP(data, XP_AWARDS.careLog, 'Tray care: ' + action);
        this.save(data);
        return entry;
    };

    /* --- Plants --- */
    GardenDataManager.prototype.getPlant = function(id) {
        return this.load().plants.find(function(p) { return p.id === id; }) || null;
    };

    GardenDataManager.prototype.getPlantsForSeason = function(seasonId) {
        return this.load().plants.filter(function(p) { return p.seasonId === seasonId; });
    };

    GardenDataManager.prototype.advancePlantStage = function(id) {
        var data = this.load();
        var plant = data.plants.find(function(p) { return p.id === id; });
        if (!plant) return null;

        var idx = PLANT_STAGES.indexOf(plant.lifecycleStage);
        if (idx === -1 || idx >= PLANT_STAGES.length - 1) return null;

        var nextStage = PLANT_STAGES[idx + 1];
        plant.lifecycleStage = nextStage;
        plant.dates[nextStage] = todayISO();

        var seed = data.seeds.find(function(s) { return s.id === plant.seedId; });
        var name = seed ? seed.plantName : 'Plant';
        this.awardXP(data, XP_AWARDS.plantAdvance, name + ' → ' + nextStage);
        this.save(data);
        return plant;
    };

    GardenDataManager.prototype.addYieldEvent = function(plantId, count, weightGrams, notes) {
        var data = this.load();
        var plant = data.plants.find(function(p) { return p.id === plantId; });
        if (!plant) return null;
        var evt = {
            id: genId('yield'),
            date: todayISO(),
            count: Number(count) || 0,
            weightGrams: Number(weightGrams) || 0,
            notes: notes || '',
            timestamp: new Date().toISOString()
        };
        plant.yieldEvents.push(evt);

        var seed = data.seeds.find(function(s) { return s.id === plant.seedId; });
        var name = seed ? seed.plantName : 'Plant';
        this.awardXP(data, XP_AWARDS.yieldEvent, name + ' yield +' + count);
        this.save(data);
        return evt;
    };

    GardenDataManager.prototype.addPlantCareLog = function(plantId, action, notes) {
        var data = this.load();
        var plant = data.plants.find(function(p) { return p.id === plantId; });
        if (!plant) return null;
        var entry = { date: todayISO(), action: action, notes: notes || '', timestamp: new Date().toISOString() };
        plant.careLog.push(entry);
        this.awardXP(data, XP_AWARDS.careLog, 'Plant care: ' + action);
        this.save(data);
        return entry;
    };

    GardenDataManager.prototype.addHealthNote = function(plantId, text) {
        var data = this.load();
        var plant = data.plants.find(function(p) { return p.id === plantId; });
        if (!plant) return null;
        var note = { date: todayISO(), text: text, timestamp: new Date().toISOString() };
        plant.healthNotes.push(note);
        this.awardXP(data, XP_AWARDS.healthNote, 'Health note added');
        this.save(data);
        return note;
    };

    GardenDataManager.prototype.archivePlant = function(id) {
        var data = this.load();
        var plant = data.plants.find(function(p) { return p.id === id; });
        if (!plant) return null;
        plant.isArchived = true;
        plant.dates.archived = todayISO();
        this.save(data);
        return plant;
    };

    /* --- Analytics --- */
    GardenDataManager.prototype.getSeedAnalytics = function(seedId) {
        var data = this.load();
        var planted = 0, germinated = 0, transplanted = 0;
        var germDays = [], transplantDays = [];
        var yieldCount = 0, yieldWeight = 0;

        data.trays.forEach(function(tray) {
            tray.cells.forEach(function(cell) {
                if (cell.seedId !== seedId) return;
                planted++;
                if (cell.stage !== 'planted' && cell.stage !== 'empty' && cell.stage !== 'failed') {
                    germinated++;
                    if (cell.dates.planted && cell.dates.germinated) {
                        var d1 = new Date(cell.dates.planted);
                        var d2 = new Date(cell.dates.germinated);
                        germDays.push(Math.round((d2 - d1) / 86400000));
                    }
                }
                if (cell.stage === 'transplanted' || cell.stage === 'readyToTransplant' || cell.stage === 'trueLeaves') {
                    // At least reached transplant-ready or beyond
                }
                if (cell.stage === 'transplanted') {
                    transplanted++;
                }
            });
        });

        data.plants.forEach(function(p) {
            if (p.seedId !== seedId) return;
            (p.yieldEvents || []).forEach(function(y) {
                yieldCount += y.count || 0;
                yieldWeight += y.weightGrams || 0;
            });
        });

        var avgGermDays = germDays.length ? Math.round(germDays.reduce(function(a, b) { return a + b; }, 0) / germDays.length) : 0;

        return {
            planted: planted,
            germinated: germinated,
            transplanted: transplanted,
            germinationRate: planted > 0 ? Math.round((germinated / planted) * 100) : 0,
            transplantRate: germinated > 0 ? Math.round((transplanted / germinated) * 100) : 0,
            avgGermDays: avgGermDays,
            totalYieldCount: yieldCount,
            totalYieldWeight: yieldWeight
        };
    };

    GardenDataManager.prototype.getSeasonAnalytics = function(seasonId) {
        var data = this.load();
        var seedsStarted = 0, germinated = 0, transplanted = 0, harvesting = 0;
        var yieldCount = 0, yieldWeight = 0;

        data.trays.forEach(function(tray) {
            if (tray.seasonId !== seasonId) return;
            tray.cells.forEach(function(cell) {
                if (cell.stage !== 'empty') seedsStarted++;
                if (cell.stage !== 'empty' && cell.stage !== 'planted' && cell.stage !== 'failed') germinated++;
                if (cell.stage === 'transplanted') transplanted++;
            });
        });

        data.plants.forEach(function(p) {
            if (p.seasonId !== seasonId) return;
            if (p.lifecycleStage === 'harvesting') harvesting++;
            (p.yieldEvents || []).forEach(function(y) {
                yieldCount += y.count || 0;
                yieldWeight += y.weightGrams || 0;
            });
        });

        return {
            seedsStarted: seedsStarted,
            germinated: germinated,
            transplanted: transplanted,
            harvesting: harvesting,
            yieldCount: yieldCount,
            yieldWeight: yieldWeight
        };
    };

    GardenDataManager.prototype.getYearOverYear = function(seasonLabel) {
        var data = this.load();
        var matching = data.seasons.filter(function(s) {
            // Match by base label (e.g., "Spring" matches "Spring 2025" and "Spring 2026")
            return s.label.toLowerCase().indexOf(seasonLabel.toLowerCase()) !== -1;
        });
        if (matching.length < 2) return null;

        var self = this;
        var results = matching.map(function(s) {
            return { season: s, analytics: self.getSeasonAnalytics(s.id) };
        });
        return results;
    };

    /* --- Export/Import --- */
    GardenDataManager.prototype.exportData = function() {
        var data = this.load();
        data.exportDate = new Date().toISOString();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'gardenData_v2-' + todayISO() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    GardenDataManager.prototype.importData = function(file, callback) {
        var self = this;
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var data = JSON.parse(e.target.result);
                if (!data || !Array.isArray(data.seasons)) {
                    alert('Invalid garden data file.');
                    return;
                }
                if (!confirm('This will replace all garden data. Proceed?')) return;
                self.save(data);
                if (callback) callback();
                alert('Garden data imported successfully.');
            } catch (err) {
                alert('Error reading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    /* --- Expose --- */
    window.GardenDataManager = GardenDataManager;

    // Also expose constants for other modules
    window.GardenConstants = {
        STORAGE_KEY: STORAGE_KEY,
        TRAY_SIZES: TRAY_SIZES,
        CELL_STAGES: CELL_STAGES,
        PLANT_STAGES: PLANT_STAGES,
        XP_AWARDS: XP_AWARDS,
        PLANT_EMOJIS: PLANT_EMOJIS
    };
})();
