/* --------------------------------
   testSuiteTrainingStats.js — powerUp/trainingStats.js
   Shared workout maths: per-hand volume, e1RM, rep bests, PRs, weekly sets.
   Writes only powerUp:1998-* keys (and the per-hand list, restored after).
----------------------------------*/
(function() {
    'use strict';

    var TS = window.TrainingStats;

    function ex(name, bodyPart, sets) {
        return { id: name, name: name, bodyPart: bodyPart, finished: true, completed: true, sets: sets };
    }
    function sets(list) {
        return list.map(function(p) { return { weight: p[0], reps: p[1], done: true }; });
    }

    function withDays(days, fn) {
        var perHandBefore = localStorage.getItem(TS.PER_HAND_KEY);
        var keys = Object.keys(days).map(function(iso) { return 'powerUp:' + iso; });
        Object.keys(days).forEach(function(iso) {
            localStorage.setItem('powerUp:' + iso, JSON.stringify({ date: iso, exercises: days[iso] }));
        });
        TS.clearCache();
        try { fn(); }
        finally {
            keys.forEach(function(k) { localStorage.removeItem(k); });
            if (perHandBefore === null) localStorage.removeItem(TS.PER_HAND_KEY);
            else localStorage.setItem(TS.PER_HAND_KEY, perHandBefore);
            TS.clearCache();
            if (window.SessionSummary) window.SessionSummary.clearCache();
        }
    }

    describe('TrainingStats Strength', function() {
        it('e1rm is Epley with reps capped at 15', function() {
            assert.closeTo(TS.e1rm(100, 5), 100 * (1 + 5 / 30), 0.001);
            assert.equal(TS.e1rm(100, 30), TS.e1rm(100, 15));
            assert.equal(TS.e1rm(0, 10), 0);
        });

        it('frontier keeps only sets nothing else beats on both weight and reps', function() {
            var f = TS.frontier([
                { date: '1998-01-01', sets: sets([[140, 5], [130, 6], [130, 4], [120, 6], [100, 12]]) },
                { date: '1998-01-08', sets: sets([[120, 7], [85, 15]]) }
            ]);
            assert.deepEqual(f.map(function(p) { return p.weight + 'x' + p.reps; }),
                ['140x5', '130x6', '120x7', '100x12', '85x15']);
        });

        it('repBests picks the heaviest set in each rep bucket', function() {
            var rb = TS.repBests([{ date: '1998-01-01', sets: sets([[140, 5], [130, 6], [100, 12], [85, 15]]) }]);
            assert.equal(rb[0].best, null);                 // 1–3
            assert.equal(rb[1].best.weight, 140);           // 4–6
            assert.equal(rb[3].best.weight, 100);           // 10–12
            assert.equal(rb[4].best.reps, 15);              // 13+
        });
    });

    describe('TrainingStats PRs', function() {
        it('flags a rep PR at a weight never done for that many reps', function() {
            withDays({
                '1998-02-01': [ex('Bench Press', 'Chest', sets([[135, 5], [125, 12]]))],
                '1998-02-08': [ex('Bench Press', 'Chest', sets([[125, 16]]))]
            }, function() {
                var today = ex('Bench Press', 'Chest', sets([[125, 16]]));
                var r = TS.exercisePRs(today, '1998-02-08');
                var kinds = r.list.map(function(p) { return p.kind; });
                assert.includes(kinds, 'reps');
                assert.ok(kinds.indexOf('weight') < 0);
                var rep = r.list.filter(function(p) { return p.kind === 'reps'; })[0];
                assert.equal(rep.prev.reps, 12);
            });
        });

        it('a lighter set covered by a heavier one is not a rep PR', function() {
            withDays({
                '1998-03-01': [ex('Bench Press', 'Chest', sets([[130, 16]]))]
            }, function() {
                var r = TS.exercisePRs(ex('Bench Press', 'Chest', sets([[120, 16]])), '1998-03-08');
                assert.ok(!r.list.some(function(p) { return p.kind === 'reps'; }));
            });
        });

        it('very light sets (under half of best e1RM) never count as rep PRs', function() {
            withDays({
                '1998-04-01': [ex('Cable Curl', 'Biceps', sets([[40, 10]]))]
            }, function() {
                var r = TS.exercisePRs(ex('Cable Curl', 'Biceps', sets([[10, 30]])), '1998-04-08');
                assert.ok(!r.list.some(function(p) { return p.kind === 'reps'; }));
            });
        });

        it('a first-ever session is a baseline with no PRs', function() {
            withDays({}, function() {
                var r = TS.exercisePRs(ex('Brand New Lift', 'Legs', sets([[100, 5]])), '1998-05-01');
                assert.ok(r.firstEver);
                assert.arrayLength(r.list, 0);
            });
        });
    });

    describe('TrainingStats Per-hand & Weeks', function() {
        it('per-hand exercises double volume but keep weight per hand', function() {
            withDays({}, function() {
                var hc = ex('Hammer Curl', 'Biceps', sets([[35, 10]]));
                assert.equal(TS.exVolume(hc), 350);
                TS.setPerHand('Hammer Curl', 'Biceps', true);
                assert.equal(TS.exVolume(hc), 700);
                if (window.SessionSummary) assert.equal(window.SessionSummary.exStats(hc).vol, 700);
                TS.setPerHand('Hammer Curl', 'Biceps', false);
                assert.equal(TS.exVolume(hc), 350);
            });
        });

        it('weeklySummary counts hard sets per muscle, skipping warm-ups', function() {
            withDays({
                '1998-06-01': [ex('Squat', 'Legs', sets([[45, 10], [225, 5], [225, 5]]))],   // Mon
                '1998-06-03': [ex('Row', 'Back', sets([[100, 8], [100, 8]]))]               // Wed
            }, function() {
                var wk = TS.weeklySummary(1, '1998-06-05');
                assert.equal(wk[0].weekStart, '1998-06-01');
                assert.equal(wk[0].workouts, 2);
                assert.equal(wk[0].byPart.Legs.sets, 2);
                assert.equal(wk[0].byPart.Back.sets, 2);
            });
        });

        it('setRoles marks light lead-in sets as warm-ups and lighter trailing sets as back-offs', function() {
            assert.deepEqual(TS.setRoles(sets([[45, 10], [120, 6], [120, 6], [85, 15]])),
                ['warmup', 'work', 'work', 'backoff']);
        });
    });
})();
