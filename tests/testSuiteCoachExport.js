/* --------------------------------
   testSuiteCoachExport.js — powerUp/coachExport.js
   The "copy for ChatGPT" coach pack and raw JSON v2.
   Writes only powerUp:1997-* keys; the per-hand list, coach profile and
   export prefs are restored afterwards.
----------------------------------*/
(function() {
    'use strict';

    var TS = window.TrainingStats;
    var CE = window.CoachExport;

    function ex(name, bodyPart, sets, finished) {
        return { id: name, name: name, bodyPart: bodyPart, finished: finished !== false, completed: finished !== false, sets: sets };
    }
    function sets(list) {
        return list.map(function(p) { return { weight: p[0], reps: p[1], done: p[2] !== false }; });
    }

    function withDays(days, fn) {
        var saved = {};
        [TS.PER_HAND_KEY, CE.PROFILE_KEY, CE.PREFS_KEY].forEach(function(k) { saved[k] = localStorage.getItem(k); });
        var keys = Object.keys(days).map(function(iso) { return 'powerUp:' + iso; });
        Object.keys(days).forEach(function(iso) {
            localStorage.setItem('powerUp:' + iso, JSON.stringify({ date: iso, exercises: days[iso] }));
        });
        TS.clearCache();
        try { fn(); }
        finally {
            keys.forEach(function(k) { localStorage.removeItem(k); });
            Object.keys(saved).forEach(function(k) {
                if (saved[k] === null) localStorage.removeItem(k);
                else localStorage.setItem(k, saved[k]);
            });
            TS.clearCache();
            if (window.SessionSummary) window.SessionSummary.clearCache();
        }
    }

    var HISTORY = {
        '1997-03-03': [ex('Lat Pulldown', 'Back', sets([[130, 6], [130, 5], [100, 12]])),
                       ex('Hammer Curl', 'Biceps', sets([[30, 10], [30, 9]]))],
        '1997-03-10': [ex('Lat Pulldown', 'Back', sets([[135, 6], [135, 5], [85, 12]])),
                       ex('Hammer Curl', 'Biceps', sets([[30, 11], [30, 9]]))]
    };
    var TODAY_ISO = '1997-03-17';
    var TODAY = [ex('Lat Pulldown', 'Back', sets([[60, 12], [120, 6], [120, 6], [85, 15]])),
                 ex('Hammer Curl', 'Biceps', sets([[35, 10], [35, 8, false]]), false)];

    function allDays() {
        var d = {};
        Object.keys(HISTORY).forEach(function(k) { d[k] = HISTORY[k]; });
        d[TODAY_ISO] = TODAY;
        return d;
    }

    describe('CoachExport Coach pack', function() {
        it('lists every logged set in W×R form with warm-up / back-off tags', function() {
            withDays(allDays(), function() {
                var pack = CE.buildCoachPack({ iso: TODAY_ISO, weeks: 4 });
                assert.ok(pack.indexOf('LEVELUP COACH PACK') === 0);
                assert.ok(pack.indexOf('60×12wu, 120×6, 120×6, 85×15bo') >= 0, 'sets line');
                assert.ok(pack.indexOf('recent: 3/10 135×6, 135×5, 85×12 | 3/03') >= 0, 'recent history newest first');
            });
        });

        it('marks per-hand exercises and unticked sets of unfinished exercises', function() {
            withDays(allDays(), function() {
                TS.setPerHand('Hammer Curl', 'Biceps', true);
                var pack = CE.buildCoachPack({ iso: TODAY_ISO, weeks: 4 });
                assert.ok(pack.indexOf('Hammer Curl [Biceps] (per hand)') >= 0, 'per-hand marker');
                assert.ok(pack.indexOf('35×8 (not done)') >= 0, 'not-done marker');
                assert.ok(pack.indexOf('Lat Pulldown [Back] (per hand)') < 0);
            });
        });

        it('shows a rep PR with the previous best at that weight', function() {
            withDays(allDays(), function() {
                var pack = CE.buildCoachPack({ iso: TODAY_ISO, weeks: 4 });
                assert.ok(pack.indexOf('Rep PR 85×15 (prev at ≥85: 100×12)') >= 0, pack);
            });
        });

        it('puts the profile up top and closes with its ASK', function() {
            withDays(allDays(), function() {
                CE.saveProfile({ goal: 'get strong', bodyweightLb: '182', ask: 'Plan my next pull day.' });
                var p = CE.getProfile();
                assert.equal(p.bodyweightLb, 182);
                assert.typeOf(p.bodyweightDate, 'string');
                var pack = CE.buildCoachPack({ iso: TODAY_ISO, weeks: 4 });
                assert.ok(pack.indexOf('ABOUT ME: goal get strong · bodyweight 182 lb') >= 0);
                var lines = pack.split('\n');
                assert.equal(lines[lines.length - 1], 'ASK: Plan my next pull day.');
                CE.saveProfile({ ask: '' });
                assert.equal(CE.getProfile().ask, CE.DEFAULT_ASK);
            });
        });

        it('a first-ever workout with no history builds without crashing', function() {
            var d = {};
            d['1997-01-06'] = [ex('Brand New Lift', 'Legs', sets([[100, 5], [100, 5]]))];
            withDays(d, function() {
                var pack = CE.buildCoachPack({ iso: '1997-01-06', weeks: 8 });
                assert.ok(pack.indexOf('100×5, 100×5') >= 0);
                assert.ok(pack.indexOf('first time logged') >= 0);
                assert.ok(pack.indexOf('STALLED') < 0);
                assert.ok(pack.indexOf('ASK: ') >= 0);
                var empty = CE.buildCoachPack({ day: { date: '1997-01-01', exercises: [] }, iso: '1997-01-01' });
                assert.ok(empty.indexOf('ASK: ') >= 0);
            });
        });
    });

    describe('CoachExport Raw JSON', function() {
        it('parses, carries the v2 schema and keeps set arrays on one line', function() {
            withDays(allDays(), function() {
                TS.setPerHand('Hammer Curl', 'Biceps', true);
                var text = CE.buildRawJson({ iso: TODAY_ISO, weeks: 4 });
                var j = JSON.parse(text);
                assert.equal(j.schema, 'levelup.workout.v2');
                assert.equal(j.today.date, TODAY_ISO);
                assert.arrayLength(j.today.exercises, 2);
                assert.deepEqual(j.today.exercises[0].sets[0], [60, 12, 'wu']);
                assert.equal(j.today.exercises[1].perHand, true);
                assert.arrayLength(j.weeks, 4);
                assert.ok(text.indexOf('"sets": [[60,12,"wu"],[120,6],[120,6],[85,15,"bo"]]') >= 0, 'one-line sets');
                assert.ok(j.today.exercises[0].prs.some(function(p) { return p.kind === 'reps'; }));
            });
        });
    });
})();
