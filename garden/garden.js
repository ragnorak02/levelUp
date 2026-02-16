/* --------------------------------
   Garden Module — Plant Lifecycle Tracker
   Storage: garden:plants, garden:totalXp, garden:activities
----------------------------------*/
(function() {
    'use strict';

    /* ===== Constants ===== */
    const PLANTS_KEY = 'garden:plants';
    const XP_KEY = 'garden:totalXp';
    const ACTIVITIES_KEY = 'garden:activities';

    const PLANT_TYPES = [
        { type: 'Tomato', emoji: '\ud83c\udf45', varieties: ['Cherry', 'Roma', 'Beefsteak', 'Heirloom'] },
        { type: 'Pepper', emoji: '\ud83c\udf36\ufe0f', varieties: ['Bell', 'Jalapeno', 'Habanero', 'Cayenne'] },
        { type: 'Green Onion', emoji: '\ud83e\uddc5', varieties: ['Scallion', 'Bunching', 'Red Spring'] },
        { type: 'Potato', emoji: '\ud83e\udd54', varieties: ['Russet', 'Yukon Gold', 'Red', 'Fingerling'] },
        { type: 'Carrot', emoji: '\ud83e\udd55', varieties: ['Nantes', 'Danvers', 'Imperator', 'Chantenay'] },
        { type: 'Lettuce', emoji: '\ud83e\udd6c', varieties: ['Romaine', 'Iceberg', 'Butterhead', 'Red Leaf'] },
        { type: 'Spinach', emoji: '\ud83e\udd6c', varieties: ['Savoy', 'Flat-Leaf', 'Semi-Savoy'] },
        { type: 'Herbs', emoji: '\ud83c\udf3f', varieties: ['Basil', 'Cilantro', 'Parsley', 'Mint', 'Rosemary'] }
    ];

    const STATUS_ORDER = ['Seeded', 'Germinated', 'Indoor', 'Hardened', 'In Ground', 'Harvesting', 'Completed'];
    const STATUS_DATE_KEYS = {
        'Seeded': 'seeded',
        'Germinated': 'germinated',
        'Indoor': 'transplantedContainer',
        'Hardened': 'hardened',
        'In Ground': 'transplantedGround',
        'Harvesting': 'firstHarvest',
        'Completed': 'completed'
    };

    const XP_VALUES = {
        'Seeded': 3,
        'Germinated': 5,
        'Indoor': 5,
        'Hardened': 3,
        'In Ground': 8,
        'Harvesting': 10,
        'Completed': 5,
        'additionalHarvest': 5,
        'measurement': 1,
        'note': 1
    };

    const todayISO = new Date().toISOString().slice(0, 10);

    /* ===== Storage Helpers ===== */
    function loadPlants() {
        try { return JSON.parse(localStorage.getItem(PLANTS_KEY) || '[]'); }
        catch { return []; }
    }

    function savePlants(plants) {
        localStorage.setItem(PLANTS_KEY, JSON.stringify(plants));
    }

    function getTotalXP() {
        return Number(localStorage.getItem(XP_KEY)) || 0;
    }

    function setTotalXP(xp) {
        localStorage.setItem(XP_KEY, String(Math.max(0, Math.round(xp))));
    }

    function loadActivities() {
        try { return JSON.parse(localStorage.getItem(ACTIVITIES_KEY) || '[]'); }
        catch { return []; }
    }

    function saveActivities(activities) {
        localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(activities));
    }

    function logActivity(type, detail, xp) {
        const activities = loadActivities();
        activities.push({
            date: todayISO,
            type: type,
            detail: detail,
            xp: xp,
            timestamp: new Date().toISOString()
        });
        saveActivities(activities);
    }

    /* ===== XP ===== */
    function awardXP(amount, reason) {
        const current = getTotalXP();
        setTotalXP(current + amount);
        logActivity('xp', reason, amount);
        showXPToast('+' + amount + ' XP');
    }

    function showXPToast(msg) {
        let toast = document.getElementById('xpToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'xpToast';
            toast.className = 'xp-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.remove('show');
        void toast.offsetWidth;
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 2000);
    }

    /* ===== Plant CRUD ===== */
    function addPlant(type, variety) {
        const plants = loadPlants();
        const typeInfo = PLANT_TYPES.find(function(t) { return t.type === type; });
        const plant = {
            id: 'plant_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: type,
            variety: variety || '',
            emoji: typeInfo ? typeInfo.emoji : '\ud83c\udf31',
            status: 'Seeded',
            dates: {
                seeded: todayISO,
                germinated: null,
                transplantedContainer: null,
                hardened: null,
                transplantedGround: null,
                firstHarvest: null,
                completed: null
            },
            measurements: [],
            yield: { count: 0, unit: 'items' },
            notes: [],
            xpAwarded: XP_VALUES['Seeded']
        };
        plants.push(plant);
        savePlants(plants);
        awardXP(XP_VALUES['Seeded'], 'Planted ' + type + (variety ? ' (' + variety + ')' : ''));
        return plant;
    }

    function getPlant(id) {
        return loadPlants().find(function(p) { return p.id === id; }) || null;
    }

    function updatePlant(id, updates) {
        const plants = loadPlants();
        const idx = plants.findIndex(function(p) { return p.id === id; });
        if (idx === -1) return null;
        Object.assign(plants[idx], updates);
        savePlants(plants);
        return plants[idx];
    }

    function deletePlant(id) {
        const plants = loadPlants().filter(function(p) { return p.id !== id; });
        savePlants(plants);
    }

    /* ===== Status Advancement ===== */
    function advanceStatus(id) {
        const plant = getPlant(id);
        if (!plant) return null;

        const currentIdx = STATUS_ORDER.indexOf(plant.status);
        if (currentIdx === -1 || currentIdx >= STATUS_ORDER.length - 1) return plant;

        const nextStatus = STATUS_ORDER[currentIdx + 1];
        const dateKey = STATUS_DATE_KEYS[nextStatus];
        const xp = XP_VALUES[nextStatus] || 0;

        const dates = Object.assign({}, plant.dates);
        if (dateKey) dates[dateKey] = todayISO;

        updatePlant(id, {
            status: nextStatus,
            dates: dates,
            xpAwarded: (plant.xpAwarded || 0) + xp
        });

        awardXP(xp, plant.type + ' advanced to ' + nextStatus);
        return getPlant(id);
    }

    function failPlant(id) {
        const plant = getPlant(id);
        if (!plant) return null;
        updatePlant(id, { status: 'Failed' });
        logActivity('fail', plant.type + ' marked as failed', 0);
        return getPlant(id);
    }

    /* ===== Measurements / Yield / Notes ===== */
    function addMeasurement(id, heightIn) {
        const plant = getPlant(id);
        if (!plant) return;
        const measurements = (plant.measurements || []).slice();
        measurements.push({ date: todayISO, height_in: Number(heightIn) });
        updatePlant(id, { measurements: measurements });
        awardXP(XP_VALUES.measurement, plant.type + ' measurement recorded');
    }

    function addYield(id, count, unit) {
        const plant = getPlant(id);
        if (!plant) return;
        const existing = plant.yield || { count: 0, unit: 'items' };
        updatePlant(id, {
            yield: { count: existing.count + Number(count), unit: unit || existing.unit }
        });
        awardXP(XP_VALUES.additionalHarvest, plant.type + ' harvest +' + count);
    }

    function addNote(id, text) {
        const plant = getPlant(id);
        if (!plant) return;
        const notes = (plant.notes || []).slice();
        notes.push({ date: todayISO, text: String(text) });
        updatePlant(id, { notes: notes });
        awardXP(XP_VALUES.note, plant.type + ' note added');
    }

    /* ===== Export / Import ===== */
    function exportData() {
        const data = {
            plants: loadPlants(),
            activities: loadActivities(),
            totalXp: getTotalXP(),
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'garden-export-' + todayISO + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || !Array.isArray(data.plants)) {
                    alert('Invalid garden data file.');
                    return;
                }

                // Merge plants by deduplicating on ID
                const existing = loadPlants();
                const existingIds = new Set(existing.map(function(p) { return p.id; }));
                let added = 0;
                data.plants.forEach(function(p) {
                    if (!existingIds.has(p.id)) {
                        existing.push(p);
                        existingIds.add(p.id);
                        added++;
                    }
                });
                savePlants(existing);

                // Merge activities
                if (Array.isArray(data.activities)) {
                    const existActs = loadActivities();
                    const existTimes = new Set(existActs.map(function(a) { return a.timestamp; }));
                    data.activities.forEach(function(a) {
                        if (!existTimes.has(a.timestamp)) {
                            existActs.push(a);
                        }
                    });
                    saveActivities(existActs);
                }

                // Update XP to max of current vs imported
                if (data.totalXp && data.totalXp > getTotalXP()) {
                    setTotalXP(data.totalXp);
                }

                alert('Imported ' + added + ' new plant(s).');
                renderAll();
            } catch (err) {
                alert('Error reading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    /* ===== Helpers ===== */
    function escapeHtml(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function statusClass(status) {
        return String(status || '').toLowerCase().replace(/\s+/g, '-');
    }

    function getActivePlants() {
        return loadPlants().filter(function(p) {
            return p.status !== 'Completed' && p.status !== 'Failed';
        });
    }

    function getTotalYield() {
        return loadPlants().reduce(function(sum, p) {
            return sum + ((p.yield && p.yield.count) || 0);
        }, 0);
    }

    function getStageBreakdown() {
        const counts = {};
        loadPlants().forEach(function(p) {
            counts[p.status] = (counts[p.status] || 0) + 1;
        });
        return counts;
    }

    /* ===== Rendering ===== */
    function $(id) { return document.getElementById(id); }

    function renderSummary() {
        var el;
        el = $('statActive');
        if (el) el.textContent = getActivePlants().length;

        el = $('statYield');
        if (el) el.textContent = getTotalYield();

        el = $('statXP');
        if (el) el.textContent = getTotalXP();

        el = $('statBreakdown');
        if (el) {
            var breakdown = getStageBreakdown();
            var parts = [];
            STATUS_ORDER.forEach(function(s) {
                if (breakdown[s]) parts.push(breakdown[s] + ' ' + s);
            });
            if (breakdown['Failed']) parts.push(breakdown['Failed'] + ' Failed');
            el.textContent = parts.length ? parts.join(', ') : 'None';
        }
    }

    function renderPlantGrid() {
        var grid = $('plantGrid');
        if (!grid) return;

        var plants = loadPlants();
        if (!plants.length) {
            grid.innerHTML = '<div class="empty">No plants yet. Tap "Add Plant" to start your garden!</div>';
            return;
        }

        // Sort: active first (by status order), then completed/failed
        plants.sort(function(a, b) {
            var ai = STATUS_ORDER.indexOf(a.status);
            var bi = STATUS_ORDER.indexOf(b.status);
            if (ai === -1) ai = 99;
            if (bi === -1) bi = 99;
            return ai - bi;
        });

        grid.innerHTML = plants.map(function(p) {
            return '<div class="plant-card" data-id="' + escapeHtml(p.id) + '">' +
                '<div class="plant-emoji">' + (p.emoji || '\ud83c\udf31') + '</div>' +
                '<div class="plant-name">' + escapeHtml(p.type) + '</div>' +
                '<div class="plant-variety">' + escapeHtml(p.variety || '') + '</div>' +
                '<div class="plant-card-bottom">' +
                    '<span class="status-badge ' + statusClass(p.status) + '">' + escapeHtml(p.status) + '</span>' +
                    '<span class="plant-xp">' + (p.xpAwarded || 0) + ' XP</span>' +
                '</div>' +
            '</div>';
        }).join('');

        // Bind card clicks
        grid.querySelectorAll('.plant-card').forEach(function(card) {
            card.addEventListener('click', function() {
                openDetailModal(card.dataset.id);
            });
        });
    }

    /* ===== Add Plant Modal ===== */
    function openAddModal() {
        var modal = $('addPlantModal');
        if (!modal) return;
        modal.classList.add('open');

        // Populate type selector
        var typeSelect = $('addPlantType');
        if (typeSelect && !typeSelect.dataset.populated) {
            typeSelect.innerHTML = PLANT_TYPES.map(function(t) {
                return '<option value="' + escapeHtml(t.type) + '">' + t.emoji + ' ' + escapeHtml(t.type) + '</option>';
            }).join('');
            typeSelect.dataset.populated = '1';
            typeSelect.addEventListener('change', updateVarietyOptions);
            updateVarietyOptions();
        }
    }

    function updateVarietyOptions() {
        var typeSelect = $('addPlantType');
        var varietySelect = $('addPlantVariety');
        if (!typeSelect || !varietySelect) return;

        var selected = typeSelect.value;
        var typeInfo = PLANT_TYPES.find(function(t) { return t.type === selected; });
        var varieties = typeInfo ? typeInfo.varieties : [];

        varietySelect.innerHTML = '<option value="">-- Select variety --</option>' +
            varieties.map(function(v) {
                return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
            }).join('');
    }

    function closeAddModal() {
        var modal = $('addPlantModal');
        if (modal) modal.classList.remove('open');
    }

    function handleAddPlant() {
        var typeSelect = $('addPlantType');
        var varietySelect = $('addPlantVariety');
        if (!typeSelect) return;

        var type = typeSelect.value;
        var variety = varietySelect ? varietySelect.value : '';

        addPlant(type, variety);
        closeAddModal();
        renderAll();
    }

    /* ===== Detail Modal ===== */
    var currentDetailId = null;

    function openDetailModal(id) {
        var plant = getPlant(id);
        if (!plant) return;
        currentDetailId = id;

        var modal = $('detailModal');
        if (!modal) return;
        modal.classList.add('open');

        renderDetailModal(plant);
    }

    function closeDetailModal() {
        var modal = $('detailModal');
        if (modal) modal.classList.remove('open');
        currentDetailId = null;
    }

    function renderDetailModal(plant) {
        if (!plant) return;

        // Title
        var titleEl = $('detailTitle');
        if (titleEl) titleEl.textContent = plant.emoji + ' ' + plant.type + (plant.variety ? ' (' + plant.variety + ')' : '');

        // Lifecycle timeline
        renderLifecycleTimeline(plant);

        // Status + actions
        var actionsEl = $('detailActions');
        if (actionsEl) {
            var html = '';
            var isFinal = plant.status === 'Completed' || plant.status === 'Failed';
            if (!isFinal) {
                var nextIdx = STATUS_ORDER.indexOf(plant.status) + 1;
                if (nextIdx < STATUS_ORDER.length) {
                    html += '<button class="cta" id="btnAdvance">Advance to ' + escapeHtml(STATUS_ORDER[nextIdx]) + '</button>';
                }
                html += '<button class="ghost" id="btnFail">Mark Failed</button>';
            }
            html += '<button class="ghost" id="btnDelete" style="color:var(--bad)">Delete Plant</button>';
            actionsEl.innerHTML = html;

            var advBtn = $('btnAdvance');
            if (advBtn) advBtn.addEventListener('click', function() {
                advanceStatus(currentDetailId);
                renderDetailModal(getPlant(currentDetailId));
                renderAll();
            });
            var failBtn = $('btnFail');
            if (failBtn) failBtn.addEventListener('click', function() {
                failPlant(currentDetailId);
                renderDetailModal(getPlant(currentDetailId));
                renderAll();
            });
            var delBtn = $('btnDelete');
            if (delBtn) delBtn.addEventListener('click', function() {
                if (confirm('Delete this plant?')) {
                    deletePlant(currentDetailId);
                    closeDetailModal();
                    renderAll();
                }
            });
        }

        // Tabs content
        renderMeasurementsTab(plant);
        renderYieldTab(plant);
        renderNotesTab(plant);
    }

    function renderLifecycleTimeline(plant) {
        var el = $('lifecycleTimeline');
        if (!el) return;

        var currentIdx = STATUS_ORDER.indexOf(plant.status);
        var isFailed = plant.status === 'Failed';

        var html = '';
        STATUS_ORDER.forEach(function(status, i) {
            var dateKey = STATUS_DATE_KEYS[status];
            var date = plant.dates ? plant.dates[dateKey] : null;
            var isDone = i < currentIdx || (i === currentIdx && plant.status === 'Completed');
            var isCurrent = i === currentIdx && !isFailed;

            if (i > 0) {
                html += '<div class="lifecycle-connector' + (isDone || isCurrent ? ' completed' : '') + '"></div>';
            }

            var dotClass = 'lifecycle-dot';
            if (isDone) dotClass += ' completed';
            else if (isCurrent) dotClass += ' active';
            if (isFailed && i === currentIdx) dotClass += ' failed';

            var labelClass = 'lifecycle-label';
            if (isCurrent) labelClass += ' active';

            html += '<div class="lifecycle-stage">' +
                '<div class="' + dotClass + '"></div>' +
                '<div class="' + labelClass + '">' + status + (date ? '<br>' + date.slice(5) : '') + '</div>' +
            '</div>';
        });

        el.innerHTML = html;
    }

    function renderMeasurementsTab(plant) {
        var el = $('tabMeasurements');
        if (!el) return;

        var measurements = plant.measurements || [];
        var html = '<div class="form-row" style="flex-direction:row; gap:8px; align-items:flex-end; margin-bottom:8px">' +
            '<div style="flex:1"><label>Height (in)</label><input type="number" id="measureInput" step="0.5" min="0" placeholder="e.g. 4.5" style="width:100%"></div>' +
            '<button class="small-btn" id="btnAddMeasure">Add</button>' +
        '</div>';

        if (measurements.length) {
            html += '<div class="detail-list">';
            measurements.slice().reverse().forEach(function(m) {
                html += '<div class="detail-item"><span>' + m.height_in + ' in</span><span class="date">' + escapeHtml(m.date) + '</span></div>';
            });
            html += '</div>';
        } else {
            html += '<div style="color:var(--muted); font-size:.82rem; padding:8px 0">No measurements yet.</div>';
        }

        el.innerHTML = html;

        var addBtn = $('btnAddMeasure');
        if (addBtn) addBtn.addEventListener('click', function() {
            var input = $('measureInput');
            var val = input ? parseFloat(input.value) : NaN;
            if (isNaN(val) || val <= 0) return;
            addMeasurement(currentDetailId, val);
            renderDetailModal(getPlant(currentDetailId));
            renderAll();
        });
    }

    function renderYieldTab(plant) {
        var el = $('tabYield');
        if (!el) return;

        var y = plant.yield || { count: 0, unit: 'items' };
        var html = '<div style="margin-bottom:10px; font-size:.9rem"><b>Total Yield:</b> ' + y.count + ' ' + escapeHtml(y.unit) + '</div>';
        html += '<div class="form-row" style="flex-direction:row; gap:8px; align-items:flex-end; margin-bottom:8px">' +
            '<div style="flex:1"><label>Add Harvest</label><input type="number" id="yieldInput" min="1" placeholder="Count" style="width:100%"></div>' +
            '<div><label>Unit</label><select id="yieldUnit" style="width:100%">' +
                '<option value="items"' + (y.unit === 'items' ? ' selected' : '') + '>items</option>' +
                '<option value="lbs"' + (y.unit === 'lbs' ? ' selected' : '') + '>lbs</option>' +
                '<option value="oz"' + (y.unit === 'oz' ? ' selected' : '') + '>oz</option>' +
                '<option value="bunches"' + (y.unit === 'bunches' ? ' selected' : '') + '>bunches</option>' +
            '</select></div>' +
            '<button class="small-btn" id="btnAddYield">Add</button>' +
        '</div>';

        el.innerHTML = html;

        var addBtn = $('btnAddYield');
        if (addBtn) addBtn.addEventListener('click', function() {
            var input = $('yieldInput');
            var unitSel = $('yieldUnit');
            var count = input ? parseInt(input.value) : NaN;
            var unit = unitSel ? unitSel.value : 'items';
            if (isNaN(count) || count <= 0) return;
            addYield(currentDetailId, count, unit);
            renderDetailModal(getPlant(currentDetailId));
            renderAll();
        });
    }

    function renderNotesTab(plant) {
        var el = $('tabNotes');
        if (!el) return;

        var notes = plant.notes || [];
        var html = '<div class="form-row" style="margin-bottom:8px">' +
            '<label>Add Note</label>' +
            '<div style="display:flex; gap:8px">' +
                '<textarea id="noteInput" rows="2" placeholder="Observation, tip, etc." style="flex:1"></textarea>' +
                '<button class="small-btn" id="btnAddNote" style="align-self:flex-end">Add</button>' +
            '</div>' +
        '</div>';

        if (notes.length) {
            html += '<div class="detail-list">';
            notes.slice().reverse().forEach(function(n) {
                html += '<div class="detail-item"><span>' + escapeHtml(n.text) + '</span><span class="date">' + escapeHtml(n.date) + '</span></div>';
            });
            html += '</div>';
        } else {
            html += '<div style="color:var(--muted); font-size:.82rem; padding:8px 0">No notes yet.</div>';
        }

        el.innerHTML = html;

        var addBtn = $('btnAddNote');
        if (addBtn) addBtn.addEventListener('click', function() {
            var input = $('noteInput');
            var text = input ? input.value.trim() : '';
            if (!text) return;
            addNote(currentDetailId, text);
            renderDetailModal(getPlant(currentDetailId));
            renderAll();
        });
    }

    /* ===== Tab switching ===== */
    function initTabs() {
        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var target = btn.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
                document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
                btn.classList.add('active');
                var panel = $(target);
                if (panel) panel.classList.add('active');
            });
        });
    }

    /* ===== Render All ===== */
    function renderAll() {
        renderSummary();
        renderPlantGrid();
    }

    /* ===== Init ===== */
    function init() {
        initTabs();

        // Add Plant button
        var addBtn = $('btnAddPlant');
        if (addBtn) addBtn.addEventListener('click', openAddModal);

        // Add modal close
        var addClose = $('addModalClose');
        if (addClose) addClose.addEventListener('click', closeAddModal);
        var addBackdrop = $('addPlantModal');
        if (addBackdrop) {
            addBackdrop.addEventListener('click', function(e) {
                if (e.target.classList.contains('popup-backdrop')) closeAddModal();
            });
        }

        // Add modal save
        var saveBtn = $('btnSavePlant');
        if (saveBtn) saveBtn.addEventListener('click', handleAddPlant);

        // Detail modal close
        var detailClose = $('detailModalClose');
        if (detailClose) detailClose.addEventListener('click', closeDetailModal);
        var detailBackdrop = $('detailModal');
        if (detailBackdrop) {
            detailBackdrop.addEventListener('click', function(e) {
                if (e.target.classList.contains('popup-backdrop')) closeDetailModal();
            });
        }

        // Export
        var exportBtn = $('btnExport');
        if (exportBtn) exportBtn.addEventListener('click', exportData);

        // Import
        var importBtn = $('btnImport');
        var importFile = $('importFile');
        if (importBtn && importFile) {
            importBtn.addEventListener('click', function() { importFile.click(); });
            importFile.addEventListener('change', function() {
                if (importFile.files.length) {
                    importData(importFile.files[0]);
                    importFile.value = '';
                }
            });
        }

        renderAll();
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for dashboard integration
    window.GardenModule = {
        loadPlants: loadPlants,
        getTotalXP: getTotalXP,
        loadActivities: loadActivities,
        getActivePlants: getActivePlants,
        getTotalYield: getTotalYield,
        PLANT_TYPES: PLANT_TYPES,
        STATUS_ORDER: STATUS_ORDER,
        XP_VALUES: XP_VALUES
    };
})();
