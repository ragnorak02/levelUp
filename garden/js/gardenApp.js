/* --------------------------------
   GardenApp — UI Controller (SPA)
   Single-page app with 5 tabs
----------------------------------*/
(function() {
    'use strict';

    var dm = new GardenDataManager();

    /* ===== Helpers ===== */
    function $(id) { return document.getElementById(id); }

    function escapeHtml(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function showXPToast(msg) {
        var toast = $('xpToast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.remove('show');
        void toast.offsetWidth;
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 2000);
    }

    var lastXP = 0;
    function checkXPChange() {
        var data = dm.load();
        if (data.totalXp > lastXP && lastXP > 0) {
            showXPToast('+' + (data.totalXp - lastXP) + ' XP');
        }
        lastXP = data.totalXp;
    }

    /* ===== State ===== */
    var state = {
        currentTab: 'tabDashboard',
        plantFilter: 'all',
        currentTrayId: null,
        currentPlantId: null,
        currentCellInfo: null // { trayId, cellIndex }
    };

    /* ===== Tab Navigation ===== */
    function initNavPills() {
        document.querySelectorAll('.nav-pill').forEach(function(pill) {
            pill.addEventListener('click', function() {
                switchTab(pill.dataset.tab);
            });
        });
    }

    function switchTab(tabId) {
        state.currentTab = tabId;
        document.querySelectorAll('.nav-pill').forEach(function(p) { p.classList.remove('active'); });
        document.querySelectorAll('.tab-section').forEach(function(s) { s.classList.remove('active'); });

        var pill = document.querySelector('.nav-pill[data-tab="' + tabId + '"]');
        if (pill) pill.classList.add('active');
        var section = $(tabId);
        if (section) section.classList.add('active');

        renderCurrentTab();
    }

    function renderCurrentTab() {
        switch (state.currentTab) {
            case 'tabDashboard': renderDashboard(); break;
            case 'tabSeeds': renderSeedBank(); break;
            case 'tabTrays': renderTrayList(); break;
            case 'tabPlants': renderPlantList(); break;
            case 'tabAnalytics': renderAnalytics(); break;
        }
    }

    /* ===== Season Selector ===== */
    function renderSeasonSelector() {
        var sel = $('seasonSelect');
        if (!sel) return;
        var seasons = dm.getAllSeasons();
        var active = dm.getActiveSeason();

        sel.innerHTML = '<option value="">No Season</option>' +
            seasons.map(function(s) {
                return '<option value="' + escapeHtml(s.id) + '"' + (s.isActive ? ' selected' : '') + '>' +
                    escapeHtml(s.label) + '</option>';
            }).join('');
    }

    function initSeasonSelector() {
        var sel = $('seasonSelect');
        if (!sel) return;
        sel.addEventListener('change', function() {
            var val = sel.value;
            if (val) {
                dm.setActiveSeason(val);
            }
            renderCurrentTab();
        });
    }

    /* ===== Tab 1: Dashboard ===== */
    function renderDashboard() {
        var season = dm.getActiveSeason();
        if (!season) {
            $('dashSeeds').textContent = '0';
            $('dashGerm').textContent = '0';
            $('dashTransplant').textContent = '0';
            $('dashHarvest').textContent = '0';
            $('dashTrays').innerHTML = '<div class="empty-state">Create a season first</div>';
            $('dashPlants').innerHTML = '<div class="empty-state">No plants yet</div>';
            $('dashActivity').innerHTML = '<div class="empty-state">No activity yet</div>';
            return;
        }

        var analytics = dm.getSeasonAnalytics(season.id);
        $('dashSeeds').textContent = analytics.seedsStarted;
        $('dashGerm').textContent = analytics.germinated;
        $('dashTransplant').textContent = analytics.transplanted;
        $('dashHarvest').textContent = analytics.harvesting;

        // Active trays
        var trays = dm.getTraysForSeason(season.id);
        var traysEl = $('dashTrays');
        if (trays.length) {
            traysEl.innerHTML = trays.map(function(tray) {
                var filled = tray.cells.filter(function(c) { return c.stage !== 'empty'; }).length;
                return '<div class="dash-tray-card" data-tray="' + tray.id + '">' +
                    '<div class="dash-tray-title">' + tray.size + '-cell tray</div>' +
                    '<div style="font-size:.72rem; color:var(--muted); font-weight:800">' + filled + '/' + tray.size + ' planted</div>' +
                    '<div class="tray-mini-cells" style="margin-top:4px">' +
                    tray.cells.slice(0, 24).map(function(c) {
                        return '<div class="tray-mini-cell ' + (c.stage !== 'empty' ? c.stage : '') + '"></div>';
                    }).join('') +
                    (tray.size > 24 ? '<span style="font-size:.6rem; color:var(--muted)">+' + (tray.size - 24) + '</span>' : '') +
                    '</div></div>';
            }).join('');

            traysEl.querySelectorAll('.dash-tray-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    switchTab('tabTrays');
                    setTimeout(function() { openTrayDetail(card.dataset.tray); }, 50);
                });
            });
        } else {
            traysEl.innerHTML = '<div class="empty-state">No trays yet</div>';
        }

        // Active plants
        var data = dm.load();
        var plants = data.plants.filter(function(p) {
            return p.seasonId === season.id && !p.isArchived && p.lifecycleStage !== 'dead';
        });
        var plantsEl = $('dashPlants');
        if (plants.length) {
            plantsEl.innerHTML = plants.slice(0, 6).map(function(p) {
                var seed = data.seeds.find(function(s) { return s.id === p.seedId; });
                var name = seed ? seed.plantName : 'Plant';
                var emoji = seed ? seed.emoji : '\ud83c\udf31';
                return '<div class="dash-plant-card" data-plant="' + p.id + '">' +
                    '<div class="dash-plant-emoji">' + emoji + '</div>' +
                    '<div class="dash-plant-name">' + escapeHtml(name) + '</div>' +
                    '<div class="dash-plant-stage">' + p.lifecycleStage + '</div>' +
                '</div>';
            }).join('');

            plantsEl.querySelectorAll('.dash-plant-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    openPlantDetail(card.dataset.plant);
                });
            });
        } else {
            plantsEl.innerHTML = '<div class="empty-state">No plants yet</div>';
        }

        // Recent activity
        var actEl = $('dashActivity');
        var xpLog = (data.xpLog || []).slice(-10).reverse();
        if (xpLog.length) {
            actEl.innerHTML = xpLog.map(function(entry) {
                return '<div class="activity-item">' +
                    '<span>' + escapeHtml(entry.reason) + '</span>' +
                    '<span class="xp-badge">+' + entry.amount + ' XP</span>' +
                '</div>';
            }).join('');
        } else {
            actEl.innerHTML = '<div class="empty-state">No activity yet</div>';
        }
    }

    /* ===== Tab 2: Seed Bank ===== */
    function renderSeedBank() {
        var seeds = dm.getAllSeeds();
        var grid = $('seedGrid');
        if (!grid) return;

        if (!seeds.length) {
            grid.innerHTML = '<div class="empty-state">No seeds in the bank. Add your first seed!</div>';
            return;
        }

        grid.innerHTML = seeds.map(function(seed) {
            var stats = seed.historicalStats || {};
            var germRate = stats.timesPlanted > 0 ? Math.round((stats.timesGerminated / stats.timesPlanted) * 100) + '%' : '--';
            return '<div class="seed-card" data-seed="' + seed.id + '">' +
                '<div class="seed-emoji">' + (seed.emoji || '\ud83c\udf31') + '</div>' +
                '<div class="seed-name">' + escapeHtml(seed.plantName) + '</div>' +
                '<div class="seed-variety">' + escapeHtml(seed.variety) + '</div>' +
                '<div class="seed-stats">' +
                    '<span>Germ: ' + germRate + '</span>' +
                    '<span>Planted: ' + (stats.timesPlanted || 0) + '</span>' +
                '</div>' +
            '</div>';
        }).join('');

        grid.querySelectorAll('.seed-card').forEach(function(card) {
            card.addEventListener('click', function() {
                openSeedModal(card.dataset.seed);
            });
        });
    }

    /* ===== Seed Modal ===== */
    function openSeedModal(seedId) {
        var modal = $('seedModal');
        if (!modal) return;

        var editId = $('seedEditId');
        var title = $('seedModalTitle');

        if (seedId) {
            var seed = dm.getSeed(seedId);
            if (!seed) return;
            title.textContent = 'Edit Seed';
            editId.value = seedId;
            $('seedName').value = seed.plantName;
            $('seedVariety').value = seed.variety;
            $('seedDaysGerm').value = seed.daysToGerm || '';
            $('seedDaysTransplant').value = seed.daysToTransplant || '';
            $('seedDaysFlower').value = seed.daysToFlower || '';
            $('seedDaysFruit').value = seed.daysToFruit || '';
            $('seedNotes').value = seed.notes || '';
        } else {
            title.textContent = 'Add Seed';
            editId.value = '';
            $('seedName').value = '';
            $('seedVariety').value = '';
            $('seedDaysGerm').value = '';
            $('seedDaysTransplant').value = '';
            $('seedDaysFlower').value = '';
            $('seedDaysFruit').value = '';
            $('seedNotes').value = '';
        }
        modal.classList.add('open');
    }

    function handleSaveSeed() {
        var name = $('seedName').value.trim();
        if (!name) return;
        var editId = $('seedEditId').value;

        if (editId) {
            dm.updateSeed(editId, {
                plantName: name,
                variety: $('seedVariety').value.trim(),
                daysToGerm: Number($('seedDaysGerm').value) || 0,
                daysToTransplant: Number($('seedDaysTransplant').value) || 0,
                daysToFlower: Number($('seedDaysFlower').value) || 0,
                daysToFruit: Number($('seedDaysFruit').value) || 0,
                notes: $('seedNotes').value.trim()
            });
        } else {
            dm.addSeed(
                name,
                $('seedVariety').value.trim(),
                $('seedDaysGerm').value,
                $('seedDaysTransplant').value,
                $('seedDaysFlower').value,
                $('seedDaysFruit').value,
                $('seedNotes').value.trim()
            );
            checkXPChange();
        }

        closeModal('seedModal');
        renderSeedBank();
    }

    /* ===== Tab 3: Trays ===== */
    function renderTrayList() {
        var season = dm.getActiveSeason();
        var list = $('trayList');
        if (!list) return;

        if (!season) {
            list.innerHTML = '<div class="empty-state">Create a season first</div>';
            return;
        }

        var trays = dm.getTraysForSeason(season.id);
        if (!trays.length) {
            list.innerHTML = '<div class="empty-state">No trays for this season</div>';
            return;
        }

        var data = dm.load();
        list.innerHTML = trays.map(function(tray) {
            var filled = tray.cells.filter(function(c) { return c.stage !== 'empty'; }).length;
            var stages = {};
            tray.cells.forEach(function(c) {
                if (c.stage !== 'empty') stages[c.stage] = (stages[c.stage] || 0) + 1;
            });
            var stageText = Object.keys(stages).map(function(s) { return stages[s] + ' ' + s; }).join(', ') || 'Empty';

            return '<div class="tray-card" data-tray="' + tray.id + '">' +
                '<div class="tray-head">' +
                    '<div class="tray-title">' + tray.size + '-cell tray</div>' +
                    '<div class="tray-fill">' + filled + '/' + tray.size + ' (' + Math.round(filled / tray.size * 100) + '%)</div>' +
                '</div>' +
                '<div style="font-size:.72rem; color:var(--muted); margin-bottom:6px">' + stageText + '</div>' +
                '<div class="tray-mini-cells">' +
                tray.cells.map(function(c) {
                    return '<div class="tray-mini-cell ' + (c.stage !== 'empty' ? c.stage : '') + '"></div>';
                }).join('') +
                '</div>' +
            '</div>';
        }).join('');

        list.querySelectorAll('.tray-card').forEach(function(card) {
            card.addEventListener('click', function() {
                openTrayDetail(card.dataset.tray);
            });
        });
    }

    /* ===== Tray Detail ===== */
    function openTrayDetail(trayId) {
        var tray = dm.getTray(trayId);
        if (!tray) return;
        state.currentTrayId = trayId;

        var modal = $('trayDetailModal');
        if (!modal) return;
        modal.classList.add('open');

        $('trayDetailTitle').textContent = tray.size + '-cell Tray';
        renderCellGrid(tray);
        renderTrayCareLog(tray);
    }

    function renderCellGrid(tray) {
        var grid = $('cellGrid');
        if (!grid) return;

        var data = dm.load();
        grid.innerHTML = tray.cells.map(function(cell, i) {
            var seed = cell.seedId ? data.seeds.find(function(s) { return s.id === cell.seedId; }) : null;
            var emoji = seed ? seed.emoji : '';
            var cls = 'cell ' + cell.stage;
            var content = cell.stage === 'empty' ? '+' : emoji || '\ud83c\udf31';
            return '<div class="' + cls + '" data-cell="' + i + '" title="Cell ' + (i + 1) + ': ' + cell.stage + '">' + content + '</div>';
        }).join('');

        grid.querySelectorAll('.cell').forEach(function(cellEl) {
            var idx = Number(cellEl.dataset.cell);
            var cell = tray.cells[idx];
            if (cell.stage === 'transplanted' || cell.stage === 'failed') return;
            cellEl.addEventListener('click', function() {
                openCellModal(tray.id, idx);
            });
        });
    }

    function renderTrayCareLog(tray) {
        var list = $('trayCareList');
        if (!list) return;
        var log = (tray.careLog || []).slice().reverse();
        if (!log.length) {
            list.innerHTML = '<div style="color:var(--muted); font-size:.82rem; padding:4px 0">No care logs yet.</div>';
            return;
        }
        list.innerHTML = log.map(function(entry) {
            return '<div class="detail-item"><span>' + escapeHtml(entry.action) + (entry.notes ? ' — ' + escapeHtml(entry.notes) : '') + '</span><span class="date">' + escapeHtml(entry.date) + '</span></div>';
        }).join('');
    }

    /* ===== Cell Modal ===== */
    function openCellModal(trayId, cellIndex) {
        var tray = dm.getTray(trayId);
        if (!tray) return;
        var cell = tray.cells[cellIndex];
        state.currentCellInfo = { trayId: trayId, cellIndex: cellIndex };

        var modal = $('cellModal');
        if (!modal) return;
        modal.classList.add('open');

        var data = dm.load();
        var seed = cell.seedId ? data.seeds.find(function(s) { return s.id === cell.seedId; }) : null;
        $('cellModalTitle').textContent = 'Cell ' + (cellIndex + 1) + (seed ? ' — ' + seed.plantName : '');

        var body = $('cellModalBody');
        var html = '';

        if (cell.stage === 'empty') {
            // Show seed assignment
            var seeds = dm.getAllSeeds();
            if (seeds.length) {
                html += '<div class="form-row"><label>Assign Seed</label><select id="cellSeedSelect">';
                html += '<option value="">-- Select seed --</option>';
                seeds.forEach(function(s) {
                    html += '<option value="' + s.id + '">' + s.emoji + ' ' + escapeHtml(s.plantName) + (s.variety ? ' (' + escapeHtml(s.variety) + ')' : '') + '</option>';
                });
                html += '</select></div>';
                html += '<button class="cta" id="btnPlantCell" style="width:100%">Plant Seed</button>';
            } else {
                html += '<div class="empty-state">No seeds in bank. Add seeds first.</div>';
            }
        } else {
            // Show current state + actions
            html += '<div style="margin-bottom:10px"><span class="status-badge ' + cell.stage + '" style="background:rgba(255,255,255,.08);color:var(--ink)">' + cell.stage + '</span></div>';

            // Stage dates
            if (cell.dates) {
                Object.keys(cell.dates).forEach(function(k) {
                    if (cell.dates[k]) html += '<div style="font-size:.78rem; color:var(--muted)">' + k + ': ' + cell.dates[k] + '</div>';
                });
            }

            html += '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">';
            var progression = ['planted', 'germinated', 'trueLeaves', 'readyToTransplant'];
            var idx = progression.indexOf(cell.stage);
            if (idx !== -1 && idx < progression.length - 1) {
                html += '<button class="cta-sm" id="btnAdvanceCell">Advance to ' + progression[idx + 1] + '</button>';
            }
            if (cell.stage === 'readyToTransplant') {
                html += '<button class="cta-sm" id="btnTransplantCell" style="background:linear-gradient(90deg,#7c3aed,#a78bfa)">Transplant</button>';
            }
            html += '<button class="ghost danger" id="btnFailCell">Mark Failed</button>';
            html += '</div>';
        }

        body.innerHTML = html;

        // Bind events
        var plantBtn = $('btnPlantCell');
        if (plantBtn) {
            plantBtn.addEventListener('click', function() {
                var seedSel = $('cellSeedSelect');
                if (!seedSel || !seedSel.value) return;
                dm.plantCell(trayId, cellIndex, seedSel.value);
                checkXPChange();
                closeModal('cellModal');
                refreshTrayDetail();
            });
        }

        var advBtn = $('btnAdvanceCell');
        if (advBtn) {
            advBtn.addEventListener('click', function() {
                dm.advanceCellStage(trayId, cellIndex);
                checkXPChange();
                closeModal('cellModal');
                refreshTrayDetail();
            });
        }

        var transplantBtn = $('btnTransplantCell');
        if (transplantBtn) {
            transplantBtn.addEventListener('click', function() {
                closeModal('cellModal');
                openTransplantModal(trayId, cellIndex);
            });
        }

        var failBtn = $('btnFailCell');
        if (failBtn) {
            failBtn.addEventListener('click', function() {
                if (confirm('Mark this cell as failed?')) {
                    dm.failCell(trayId, cellIndex);
                    closeModal('cellModal');
                    refreshTrayDetail();
                }
            });
        }
    }

    /* ===== Transplant Modal ===== */
    function openTransplantModal(trayId, cellIndex) {
        state.currentCellInfo = { trayId: trayId, cellIndex: cellIndex };
        var modal = $('transplantModal');
        if (!modal) return;
        $('transplantLocType').value = 'ground';
        $('transplantLocLabel').value = '';
        modal.classList.add('open');
    }

    function handleTransplant() {
        var info = state.currentCellInfo;
        if (!info) return;
        var locType = $('transplantLocType').value;
        var locLabel = $('transplantLocLabel').value.trim();
        dm.transplantCell(info.trayId, info.cellIndex, locType, locLabel);
        checkXPChange();
        closeModal('transplantModal');
        refreshTrayDetail();
    }

    function refreshTrayDetail() {
        if (!state.currentTrayId) return;
        var tray = dm.getTray(state.currentTrayId);
        if (!tray) return;
        renderCellGrid(tray);
        renderTrayCareLog(tray);
    }

    /* ===== Tab 4: Plants ===== */
    function renderPlantList() {
        var season = dm.getActiveSeason();
        var grid = $('plantGrid');
        if (!grid) return;

        if (!season) {
            grid.innerHTML = '<div class="empty-state">Create a season first</div>';
            return;
        }

        var data = dm.load();
        var plants = data.plants.filter(function(p) { return p.seasonId === season.id; });

        // Apply filter
        if (state.plantFilter === 'archived') {
            plants = plants.filter(function(p) { return p.isArchived; });
        } else if (state.plantFilter !== 'all') {
            plants = plants.filter(function(p) {
                return !p.isArchived && p.lifecycleStage === state.plantFilter;
            });
        } else {
            plants = plants.filter(function(p) { return !p.isArchived; });
        }

        if (!plants.length) {
            grid.innerHTML = '<div class="empty-state">No plants matching filter</div>';
            return;
        }

        grid.innerHTML = plants.map(function(p) {
            var seed = data.seeds.find(function(s) { return s.id === p.seedId; });
            var name = seed ? seed.plantName : 'Plant';
            var variety = seed ? seed.variety : '';
            var emoji = seed ? seed.emoji : '\ud83c\udf31';
            var yieldCount = (p.yieldEvents || []).reduce(function(sum, y) { return sum + (y.count || 0); }, 0);

            return '<div class="plant-card" data-plant="' + p.id + '">' +
                '<div class="plant-emoji">' + emoji + '</div>' +
                '<div class="plant-name">' + escapeHtml(name) + '</div>' +
                '<div class="plant-variety">' + escapeHtml(variety) + '</div>' +
                '<div class="plant-card-bottom">' +
                    '<span class="status-badge ' + p.lifecycleStage + '">' + escapeHtml(p.lifecycleStage) + '</span>' +
                    (yieldCount > 0 ? '<span class="plant-yield">' + yieldCount + ' yield</span>' : '') +
                '</div>' +
            '</div>';
        }).join('');

        grid.querySelectorAll('.plant-card').forEach(function(card) {
            card.addEventListener('click', function() {
                openPlantDetail(card.dataset.plant);
            });
        });
    }

    function initPlantFilters() {
        document.querySelectorAll('.filter-pill').forEach(function(pill) {
            pill.addEventListener('click', function() {
                document.querySelectorAll('.filter-pill').forEach(function(p) { p.classList.remove('active'); });
                pill.classList.add('active');
                state.plantFilter = pill.dataset.filter;
                renderPlantList();
            });
        });
    }

    /* ===== Plant Detail Modal ===== */
    function openPlantDetail(plantId) {
        var data = dm.load();
        var plant = data.plants.find(function(p) { return p.id === plantId; });
        if (!plant) return;
        state.currentPlantId = plantId;

        var modal = $('plantDetailModal');
        if (!modal) return;
        modal.classList.add('open');

        var seed = data.seeds.find(function(s) { return s.id === plant.seedId; });
        var name = seed ? seed.plantName : 'Plant';
        var variety = seed ? seed.variety : '';
        var emoji = seed ? seed.emoji : '\ud83c\udf31';
        $('plantDetailTitle').textContent = emoji + ' ' + name + (variety ? ' (' + variety + ')' : '');

        renderPlantLifecycle(plant);
        renderPlantActions(plant);
        renderPlantYieldTab(plant);
        renderPlantCareTab(plant);
        renderPlantHealthTab(plant);
        initModalTabs('plantTabBar');
    }

    function renderPlantLifecycle(plant) {
        var el = $('plantLifecycle');
        if (!el) return;

        var stages = GardenConstants.PLANT_STAGES;
        var currentIdx = stages.indexOf(plant.lifecycleStage);
        var html = '';

        // Add transplanted as first dot
        var allStages = ['transplanted'].concat(stages);
        var adjustedIdx = currentIdx + 1; // offset for transplanted

        allStages.forEach(function(stage, i) {
            var date = plant.dates ? plant.dates[stage] : null;
            var isDone = i < adjustedIdx;
            var isCurrent = i === adjustedIdx;

            if (i > 0) {
                html += '<div class="lifecycle-connector' + (isDone || isCurrent ? ' completed' : '') + '"></div>';
            }

            var dotClass = 'lifecycle-dot';
            if (isDone) dotClass += ' completed';
            else if (isCurrent) dotClass += ' active';
            if (plant.lifecycleStage === 'dead' && isCurrent) dotClass += ' failed';

            var labelClass = 'lifecycle-label';
            if (isCurrent) labelClass += ' active';

            var label = stage.charAt(0).toUpperCase() + stage.slice(1);
            html += '<div class="lifecycle-stage">' +
                '<div class="' + dotClass + '"></div>' +
                '<div class="' + labelClass + '">' + label + (date ? '<br>' + date.slice(5) : '') + '</div>' +
            '</div>';
        });

        el.innerHTML = html;
    }

    function renderPlantActions(plant) {
        var el = $('plantActions');
        if (!el) return;

        var html = '';
        var stages = GardenConstants.PLANT_STAGES;
        var idx = stages.indexOf(plant.lifecycleStage);

        if (!plant.isArchived && idx !== -1 && idx < stages.length - 1 && plant.lifecycleStage !== 'dead') {
            html += '<button class="cta-sm" id="btnAdvancePlant">Advance to ' + stages[idx + 1] + '</button>';
        }
        if (!plant.isArchived && plant.lifecycleStage !== 'dead') {
            html += '<button class="ghost" id="btnMarkDead" style="color:var(--bad)">Mark Dead</button>';
        }
        if (!plant.isArchived) {
            html += '<button class="ghost" id="btnArchivePlant">Archive</button>';
        }

        el.innerHTML = html;

        var advBtn = $('btnAdvancePlant');
        if (advBtn) advBtn.addEventListener('click', function() {
            dm.advancePlantStage(state.currentPlantId);
            checkXPChange();
            reopenPlantDetail();
        });

        var deadBtn = $('btnMarkDead');
        if (deadBtn) deadBtn.addEventListener('click', function() {
            if (confirm('Mark this plant as dead?')) {
                var data = dm.load();
                var p = data.plants.find(function(pl) { return pl.id === state.currentPlantId; });
                if (p) {
                    p.lifecycleStage = 'dead';
                    p.dates.dead = new Date().toISOString().slice(0, 10);
                    dm.save(data);
                }
                reopenPlantDetail();
            }
        });

        var archBtn = $('btnArchivePlant');
        if (archBtn) archBtn.addEventListener('click', function() {
            dm.archivePlant(state.currentPlantId);
            closeModal('plantDetailModal');
            renderPlantList();
        });
    }

    function renderPlantYieldTab(plant) {
        var el = $('plantYieldPnl');
        if (!el) return;

        var events = plant.yieldEvents || [];
        var totalCount = events.reduce(function(s, y) { return s + (y.count || 0); }, 0);
        var totalWeight = events.reduce(function(s, y) { return s + (y.weightGrams || 0); }, 0);

        var html = '<div style="margin-bottom:8px; font-size:.88rem"><b>Total:</b> ' + totalCount + ' items, ' + totalWeight + 'g</div>';
        html += '<div class="form-row" style="flex-direction:row; gap:8px; align-items:flex-end; margin-bottom:8px">' +
            '<div style="flex:1"><label>Count</label><input type="number" id="yieldCount" min="1" placeholder="e.g. 5" /></div>' +
            '<div style="flex:1"><label>Weight (g)</label><input type="number" id="yieldWeight" min="0" placeholder="e.g. 200" /></div>' +
            '<button class="small-btn" id="btnAddYield">Add</button>' +
        '</div>';

        if (events.length) {
            html += '<div class="detail-list">';
            events.slice().reverse().forEach(function(y) {
                html += '<div class="detail-item"><span>' + y.count + ' items' + (y.weightGrams ? ', ' + y.weightGrams + 'g' : '') +
                    (y.notes ? ' — ' + escapeHtml(y.notes) : '') + '</span><span class="date">' + y.date + '</span></div>';
            });
            html += '</div>';
        }

        el.innerHTML = html;

        var addBtn = $('btnAddYield');
        if (addBtn) addBtn.addEventListener('click', function() {
            var count = parseInt($('yieldCount').value);
            var weight = parseInt($('yieldWeight').value) || 0;
            if (!count || count <= 0) return;
            dm.addYieldEvent(state.currentPlantId, count, weight, '');
            checkXPChange();
            reopenPlantDetail();
        });
    }

    function renderPlantCareTab(plant) {
        var el = $('plantCarePnl');
        if (!el) return;

        var log = plant.careLog || [];
        var html = '<div class="form-row" style="flex-direction:row; gap:8px; align-items:flex-end; margin-bottom:8px">' +
            '<div style="flex:1"><label>Action</label><input type="text" id="plantCareAction" placeholder="e.g. Watered, Fertilized" /></div>' +
            '<button class="small-btn" id="btnAddPlantCare">Add</button>' +
        '</div>';

        if (log.length) {
            html += '<div class="detail-list">';
            log.slice().reverse().forEach(function(entry) {
                html += '<div class="detail-item"><span>' + escapeHtml(entry.action) + (entry.notes ? ' — ' + escapeHtml(entry.notes) : '') + '</span><span class="date">' + entry.date + '</span></div>';
            });
            html += '</div>';
        } else {
            html += '<div style="color:var(--muted); font-size:.82rem">No care logs yet.</div>';
        }

        el.innerHTML = html;

        var addBtn = $('btnAddPlantCare');
        if (addBtn) addBtn.addEventListener('click', function() {
            var action = $('plantCareAction').value.trim();
            if (!action) return;
            dm.addPlantCareLog(state.currentPlantId, action, '');
            checkXPChange();
            reopenPlantDetail();
        });
    }

    function renderPlantHealthTab(plant) {
        var el = $('plantHealthPnl');
        if (!el) return;

        var notes = plant.healthNotes || [];
        var html = '<div class="form-row" style="margin-bottom:8px">' +
            '<label>Add Note</label>' +
            '<div style="display:flex; gap:8px">' +
                '<textarea id="healthNoteInput" rows="2" placeholder="Health observation..." style="flex:1"></textarea>' +
                '<button class="small-btn" id="btnAddHealth" style="align-self:flex-end">Add</button>' +
            '</div>' +
        '</div>';

        if (notes.length) {
            html += '<div class="detail-list">';
            notes.slice().reverse().forEach(function(n) {
                html += '<div class="detail-item"><span>' + escapeHtml(n.text) + '</span><span class="date">' + n.date + '</span></div>';
            });
            html += '</div>';
        } else {
            html += '<div style="color:var(--muted); font-size:.82rem">No health notes yet.</div>';
        }

        el.innerHTML = html;

        var addBtn = $('btnAddHealth');
        if (addBtn) addBtn.addEventListener('click', function() {
            var text = $('healthNoteInput').value.trim();
            if (!text) return;
            dm.addHealthNote(state.currentPlantId, text);
            checkXPChange();
            reopenPlantDetail();
        });
    }

    function reopenPlantDetail() {
        if (!state.currentPlantId) return;
        var data = dm.load();
        var plant = data.plants.find(function(p) { return p.id === state.currentPlantId; });
        if (!plant) return;

        var seed = data.seeds.find(function(s) { return s.id === plant.seedId; });
        var name = seed ? seed.plantName : 'Plant';
        var variety = seed ? seed.variety : '';
        var emoji = seed ? seed.emoji : '\ud83c\udf31';
        $('plantDetailTitle').textContent = emoji + ' ' + name + (variety ? ' (' + variety + ')' : '');

        renderPlantLifecycle(plant);
        renderPlantActions(plant);
        renderPlantYieldTab(plant);
        renderPlantCareTab(plant);
        renderPlantHealthTab(plant);
    }

    /* ===== Tab 5: Analytics ===== */
    function renderAnalytics() {
        var season = dm.getActiveSeason();
        var seasonEl = $('analyticsSeason');
        var seedEl = $('analyticsSeedTable');
        var compareEl = $('analyticsCompare');

        // Season summary
        if (season) {
            var sa = dm.getSeasonAnalytics(season.id);
            seasonEl.innerHTML =
                '<div class="analytics-card"><div class="analytics-val">' + sa.seedsStarted + '</div><div class="analytics-label">Seeds Started</div></div>' +
                '<div class="analytics-card"><div class="analytics-val">' + sa.germinated + '</div><div class="analytics-label">Germinated</div></div>' +
                '<div class="analytics-card"><div class="analytics-val">' + sa.transplanted + '</div><div class="analytics-label">Transplanted</div></div>' +
                '<div class="analytics-card"><div class="analytics-val">' + sa.harvesting + '</div><div class="analytics-label">Harvesting</div></div>' +
                '<div class="analytics-card"><div class="analytics-val">' + sa.yieldCount + '</div><div class="analytics-label">Yield Items</div></div>' +
                '<div class="analytics-card"><div class="analytics-val">' + sa.yieldWeight + 'g</div><div class="analytics-label">Yield Weight</div></div>';
        } else {
            seasonEl.innerHTML = '<div class="empty-state">No active season</div>';
        }

        // Seed performance
        var seeds = dm.getAllSeeds();
        if (seeds.length) {
            seedEl.innerHTML = seeds.map(function(seed) {
                var sa = dm.getSeedAnalytics(seed.id);
                return '<div class="analytics-seed-row">' +
                    '<span>' + seed.emoji + '</span>' +
                    '<span class="name">' + escapeHtml(seed.plantName) + '</span>' +
                    '<span class="metric">Germ: ' + sa.germinationRate + '%</span>' +
                    '<span class="metric">Trans: ' + sa.transplantRate + '%</span>' +
                    '<span class="metric">Yield: ' + sa.totalYieldCount + '</span>' +
                '</div>';
            }).join('');
        } else {
            seedEl.innerHTML = '<div class="empty-state">No seeds to analyze</div>';
        }

        // Season comparison
        if (season) {
            var baseName = season.label.replace(/\s*\d{4}\s*$/, '').trim();
            if (baseName) {
                var comparison = dm.getYearOverYear(baseName);
                if (comparison && comparison.length >= 2) {
                    compareEl.innerHTML = comparison.map(function(c) {
                        return '<div class="analytics-card" style="text-align:left; padding:10px">' +
                            '<div style="font-weight:900; margin-bottom:4px">' + escapeHtml(c.season.label) + '</div>' +
                            '<div style="font-size:.78rem; color:var(--muted)">Seeds: ' + c.analytics.seedsStarted +
                            ' | Germ: ' + c.analytics.germinated +
                            ' | Yield: ' + c.analytics.yieldCount + '</div>' +
                        '</div>';
                    }).join('');
                } else {
                    compareEl.innerHTML = '<div class="empty-state">Need 2+ seasons with matching labels to compare</div>';
                }
            }
        }

        renderSeasonList();
    }

    /* ===== Season List (inside Analytics tab) ===== */
    function renderSeasonList() {
        var seasons = dm.getAllSeasons();
        var list = $('seasonList');
        if (!list) return;

        if (seasons.length) {
            list.innerHTML = seasons.map(function(s) {
                return '<div class="season-item' + (s.isActive ? ' active' : '') + '">' +
                    '<div>' +
                        '<div class="season-item-info">' + escapeHtml(s.label) + (s.isActive ? ' (Active)' : '') + '</div>' +
                        '<div class="season-item-dates">' + (s.startDate || '') + (s.endDate ? ' — ' + s.endDate : '') + '</div>' +
                    '</div>' +
                    '<div class="season-item-actions">' +
                        (!s.isActive ? '<button class="small-btn" data-activate="' + s.id + '">Activate</button>' : '') +
                        '<button class="small-btn" data-edit-season="' + s.id + '">Edit</button>' +
                        '<button class="small-btn" data-delete-season="' + s.id + '" style="color:var(--bad)">Del</button>' +
                    '</div>' +
                '</div>';
            }).join('');

            list.querySelectorAll('[data-activate]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    dm.setActiveSeason(btn.dataset.activate);
                    renderSeasonSelector();
                    renderSeasonList();
                });
            });
            list.querySelectorAll('[data-edit-season]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    openSeasonModal(btn.dataset.editSeason);
                });
            });
            list.querySelectorAll('[data-delete-season]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    if (!confirm('Delete this season? (Only works if no trays/plants reference it)')) return;
                    var ok = dm.deleteSeason(btn.dataset.deleteSeason);
                    if (!ok) {
                        alert('Cannot delete: trays or plants reference this season.');
                    } else {
                        renderSeasonSelector();
                        renderSeasonList();
                    }
                });
            });
        } else {
            list.innerHTML = '<div class="empty-state">No seasons created yet</div>';
        }

        var data = dm.load();
        var xpEl = $('settingsXP');
        if (xpEl) xpEl.textContent = 'Total XP: ' + (data.totalXp || 0);
    }

    /* ===== Season Modal ===== */
    function openSeasonModal(seasonId) {
        var modal = $('seasonModal');
        if (!modal) return;

        var editId = $('seasonEditId');
        var title = $('seasonModalTitle');

        if (seasonId) {
            var seasons = dm.getAllSeasons();
            var season = seasons.find(function(s) { return s.id === seasonId; });
            if (!season) return;
            title.textContent = 'Edit Season';
            editId.value = seasonId;
            $('seasonLabel').value = season.label;
            $('seasonStart').value = season.startDate || '';
            $('seasonEnd').value = season.endDate || '';
            $('seasonNotes').value = season.notes || '';
        } else {
            title.textContent = 'New Season';
            editId.value = '';
            $('seasonLabel').value = '';
            $('seasonStart').value = new Date().toISOString().slice(0, 10);
            $('seasonEnd').value = '';
            $('seasonNotes').value = '';
        }
        modal.classList.add('open');
    }

    function handleSaveSeason() {
        var label = $('seasonLabel').value.trim();
        if (!label) return;
        var editId = $('seasonEditId').value;

        if (editId) {
            dm.updateSeason(editId, {
                label: label,
                startDate: $('seasonStart').value,
                endDate: $('seasonEnd').value,
                notes: $('seasonNotes').value.trim()
            });
        } else {
            dm.createSeason(
                label,
                $('seasonStart').value,
                $('seasonEnd').value,
                $('seasonNotes').value.trim()
            );
        }

        closeModal('seasonModal');
        renderSeasonSelector();
        renderCurrentTab();
    }

    /* ===== Modal Helpers ===== */
    function closeModal(id) {
        var modal = $(id);
        if (modal) modal.classList.remove('open');
    }

    function initModalClose(modalId, closeBtnId) {
        var closeBtn = $(closeBtnId);
        if (closeBtn) closeBtn.addEventListener('click', function() { closeModal(modalId); });
        var modal = $(modalId);
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target.classList.contains('popup-backdrop')) closeModal(modalId);
            });
        }
    }

    function initModalTabs(barId) {
        var bar = $(barId);
        if (!bar) return;
        bar.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                bar.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                // Find sibling panels
                var panels = bar.parentElement.querySelectorAll('.tab-panel');
                panels.forEach(function(p) { p.classList.remove('active'); });
                var target = $(btn.dataset.tab);
                if (target) target.classList.add('active');
            });
        });
    }

    /* ===== Init ===== */
    function init() {
        // Clean up old data keys
        dm.clearOldData();

        // Initialize XP tracking
        lastXP = dm.load().totalXp || 0;

        // Navigation
        initNavPills();
        initSeasonSelector();
        initPlantFilters();

        // Modal close handlers
        initModalClose('seedModal', 'seedModalClose');
        initModalClose('trayModal', 'trayModalClose');
        initModalClose('trayDetailModal', 'trayDetailClose');
        initModalClose('cellModal', 'cellModalClose');
        initModalClose('plantDetailModal', 'plantDetailClose');
        initModalClose('seasonModal', 'seasonModalClose');
        initModalClose('transplantModal', 'transplantModalClose');

        // Modal tabs
        initModalTabs('plantTabBar');

        // Tray detail tabs
        var trayTabBar = document.querySelector('#trayDetailModal .tab-bar');
        if (trayTabBar) {
            trayTabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    trayTabBar.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    var modal = $('trayDetailModal');
                    modal.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
                    var target = $(btn.dataset.tab);
                    if (target) target.classList.add('active');
                });
            });
        }

        // Button handlers
        var btnAddSeed = $('btnAddSeed');
        if (btnAddSeed) btnAddSeed.addEventListener('click', function() { openSeedModal(null); });

        var btnSaveSeed = $('btnSaveSeed');
        if (btnSaveSeed) btnSaveSeed.addEventListener('click', handleSaveSeed);

        var btnAddTray = $('btnAddTray');
        if (btnAddTray) btnAddTray.addEventListener('click', function() {
            var modal = $('trayModal');
            if (modal) modal.classList.add('open');
        });

        var btnSaveTray = $('btnSaveTray');
        if (btnSaveTray) btnSaveTray.addEventListener('click', function() {
            var season = dm.getActiveSeason();
            if (!season) {
                alert('Create a season first!');
                return;
            }
            var size = parseInt($('traySize').value);
            dm.createTray(season.id, size);
            closeModal('trayModal');
            renderTrayList();
        });

        var btnWaterAll = $('btnWaterAll');
        if (btnWaterAll) btnWaterAll.addEventListener('click', function() {
            if (!state.currentTrayId) return;
            dm.addTrayCareLog(state.currentTrayId, 'Watered', 'All cells');
            checkXPChange();
            refreshTrayDetail();
        });

        var btnDeleteTray = $('btnDeleteTray');
        if (btnDeleteTray) btnDeleteTray.addEventListener('click', function() {
            if (!state.currentTrayId) return;
            if (!confirm('Delete this tray?')) return;
            var ok = dm.deleteTray(state.currentTrayId);
            if (!ok) {
                alert('Cannot delete: tray has transplanted cells.');
            } else {
                closeModal('trayDetailModal');
                renderTrayList();
            }
        });

        var btnAddTrayCare = $('btnAddTrayCare');
        if (btnAddTrayCare) btnAddTrayCare.addEventListener('click', function() {
            if (!state.currentTrayId) return;
            var action = $('trayCareAction').value.trim();
            if (!action) return;
            dm.addTrayCareLog(state.currentTrayId, action, '');
            checkXPChange();
            $('trayCareAction').value = '';
            refreshTrayDetail();
        });

        var btnDoTransplant = $('btnDoTransplant');
        if (btnDoTransplant) btnDoTransplant.addEventListener('click', handleTransplant);

        var btnCreateSeason = $('btnCreateSeason');
        if (btnCreateSeason) btnCreateSeason.addEventListener('click', function() { openSeasonModal(null); });

        var btnSaveSeason = $('btnSaveSeason');
        if (btnSaveSeason) btnSaveSeason.addEventListener('click', handleSaveSeason);

        // Settings data buttons
        var btnExport = $('btnExport');
        if (btnExport) btnExport.addEventListener('click', function() { dm.exportData(); });

        var btnImport = $('btnImport');
        var importFile = $('importFile');
        if (btnImport && importFile) {
            btnImport.addEventListener('click', function() { importFile.click(); });
            importFile.addEventListener('change', function() {
                if (importFile.files.length) {
                    dm.importData(importFile.files[0], function() {
                        renderSeasonSelector();
                        renderCurrentTab();
                    });
                    importFile.value = '';
                }
            });
        }

        var btnClearData = $('btnClearData');
        if (btnClearData) btnClearData.addEventListener('click', function() {
            if (!confirm('Delete ALL garden data? This cannot be undone.')) return;
            localStorage.removeItem(GardenConstants.STORAGE_KEY);
            renderSeasonSelector();
            renderCurrentTab();
        });

        // Initial render
        renderSeasonSelector();
        renderDashboard();
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
