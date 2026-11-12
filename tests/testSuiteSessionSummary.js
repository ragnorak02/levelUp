/* --------------------------------
   testSuiteSessionSummary.js — powerUp/sessionSummary.js
   The shared workout summary used by workout.html and the dashboard.
   Storage tests write only powerUp:1999-* keys and remove them after,
   so real workout data is never touched.
----------------------------------*/
(function() {
    'use strict';

    var SS = window.SessionSummary;

    function ex(name, bodyPart, sets, finished) {
        return { id: name, name: name, bodyPart: bodyPart, finished: !!finished, completed: !!finished, sets: sets };
    }

    function withDays(days, fn) {
        var keys = Object.keys(days).map(function(iso) { return 'powerUp:' + iso; });
        Object.keys(days).forEach(function(iso) {
            localStorage.setItem('powerUp:' + iso, JSON.stringify({ date: iso, exercises: days[iso] }));
        });
        SS.clearCache();
        try { fn(); }
        finally {
            keys.forEach(function(k) { localStorage.removeItem(k); });
            SS.clearCache();
        }
    }

    describe('SessionSummary Stats', function() {
        it('counts only Done sets until an exercise is finished', function() {
            var open = ex('Squat', 'Legs', [{ weight: 100, reps: 5, done: true }, { weight: 100, reps: 5, done: false }]);
            var closed = ex('Bench', 'Chest', [{ weight: 50, reps: 10 }, { weight: 50, reps: 10 }], true);
            var t = SS.totalsFiltered({ exercises: [open, closed] });
            assert.equal(t.sets, 3);
            assert.equal(t.vol, 100 * 5 + 50 * 10 * 2);
            assert.equal(t.exCount, 2);
        });

        it('topSetOf breaks weight ties on reps', function() {
            var top = SS.topSetOf(ex('Row', 'Back', [{ weight: 80, reps: 8 }, { weight: 90, reps: 5 }, { weight: 90, reps: 7 }]));
            assert.deepEqual(top, { weight: 90, reps: 7 });
        });

        it('beatsPriorPR needs a prior mark and a heavier or longer set', function() {
            var prior = { weight: 100, reps: 5 };
            assert.ok(SS.beatsPriorPR({ weight: 105, reps: 1 }, prior));
            assert.ok(SS.beatsPriorPR({ weight: 100, reps: 6 }, prior));
            assert.ok(!SS.beatsPriorPR({ weight: 100, reps: 5 }, prior));
            assert.ok(!SS.beatsPriorPR({ weight: 200, reps: 5 }, { weight: 0, reps: 0 }));
        });

        it('dateLabel uses a short weekday and M/D/YY', function() {
            assert.equal(SS.dateLabel('2026-10-21'), 'Wed · 10/21/26');
            assert.equal(SS.mdFromISO('2026-10-21'), '10/21');
        });
    });

    describe('SessionSummary Storage', function() {
        it('adjacentWorkoutDate skips days with nothing logged', function() {
            var set = [{ weight: 50, reps: 5, done: true }];
            var days = {
                '1999-01-04': [ex('Curl', 'Biceps', set, true)],
                '1999-01-05': [],
                '1999-01-08': [ex('Curl', 'Biceps', set, true)]
            };
            withDays(days, function() {
                assert.equal(SS.adjacentWorkoutDate('1999-01-08', -1), '1999-01-04');
                assert.equal(SS.adjacentWorkoutDate('1999-01-04', 1), '1999-01-08');
                assert.equal(SS.adjacentWorkoutDate('1999-01-01', -1), null);
            });
        });

        it('prStatus measures against every other day', function() {
            var days = {
                '1999-02-01': [ex('Press', 'Shoulders', [{ weight: 60, reps: 8 }], true)],
                '1999-02-08': [ex('Press', 'Shoulders', [{ weight: 65, reps: 5 }], true)]
            };
            withDays(days, function() {
                var st = SS.prStatus(days['1999-02-08'][0], '1999-02-08');
                assert.ok(st.weightPR);
                assert.equal(st.prior.sessions, 1);
                var first = SS.prStatus(days['1999-02-01'][0], '1999-02-01');
                assert.ok(!first.weightPR);
            });
        });

        it('setPRKind flags weight PRs and rep PRs that beat the frontier', function() {
            var days = {
                '1999-04-01': [ex('Curl', 'Biceps', [{ weight: 125, reps: 12 }, { weight: 100, reps: 15 }], true)],
                '1999-04-08': [ex('Curl', 'Biceps', [{ weight: 30, reps: 30 }], false)]
            };
            withDays(days, function() {
                var ctx = SS.livePRContext(days['1999-04-08'][0], '1999-04-08');
                assert.equal(SS.setPRKind({ weight: 130, reps: 5 }, ctx), 'pr');
                assert.equal(SS.setPRKind({ weight: 125, reps: 13 }, ctx), 'pr');   // more reps at the top weight
                assert.equal(SS.setPRKind({ weight: 110, reps: 13 }, ctx), 'rep');
                assert.equal(SS.setPRKind({ weight: 110, reps: 12 }, ctx), null);   // 125x12 already covers it
                assert.equal(SS.setPRKind({ weight: 30, reps: 40 }, ctx), null);    // below the e1RM floor
                var first = SS.livePRContext(ex('New', 'Biceps', []), '1999-04-08');
                assert.equal(SS.setPRKind({ weight: 500, reps: 5 }, first), null);
            });
        });

        it('prHitsToday groups PR kinds per exercise and fmtPR shows the old mark', function() {
            var days = {
                '1999-05-01': [ex('Curl', 'Biceps', [{ weight: 125, reps: 12 }], true)],
                '1999-05-08': [ex('Curl', 'Biceps', [{ weight: 125, reps: 16 }], true)]
            };
            withDays(days, function() {
                var hits = SS.prHitsToday({ exercises: days['1999-05-08'] }, '1999-05-08');
                assert.arrayLength(hits, 1);
                var kinds = hits[0].prs.map(function(p) { return p.kind; });
                assert.includes(kinds, 'e1rm');
                assert.equal(hits[0].prs[0].tier, 1);
                var rep = hits[0].prs.filter(function(p) { return p.kind === 'reps'; })[0];
                var t = SS.fmtPR(rep);
                assert.equal(t.value, '125×16');
                assert.equal(t.was, 'was 125×12');
                assert.equal(SS.fmtPR({ kind: 'e1rm', value: 188, prev: 175 }).value, 'e1RM 188');
            });
        });

        it('repBestsLine marks only new bests as today and volumeDelta gives a pill', function() {
            var prior = [{ date: '1999-06-01', sets: [{ weight: 140, reps: 5 }, { weight: 100, reps: 12 }] }];
            var line = SS.repBestsLine(prior, [{ weight: 120, reps: 7 }, { weight: 100, reps: 10 }], '1999-06-08');
            assert.deepEqual(line.map(function(p) { return p.weight + 'x' + p.reps + (p.today ? '*' : ''); }),
                ['140x5', '120x7*', '100x12']);
            assert.deepEqual(SS.volumeDelta(1100, { vol: 1000, date: '1999-06-01' }),
                { dir: 'up', delta: 100, pct: 10, date: '1999-06-01' });
            assert.equal(SS.volumeDelta(0, { vol: 1000, date: '1999-06-01' }), null);
        });

        it('loadDay unsticks finished-but-not-completed exercises', function() {
            var stuck = { id: 'x', name: 'Dip', bodyPart: 'Triceps', finished: true, completed: false, sets: [] };
            withDays({ '1999-03-01': [stuck] }, function() {
                var day = SS.loadDay('1999-03-01');
                assert.equal(day.exercises[0].finished, false);
                assert.arrayLength(SS.loadDay('1999-03-02').exercises, 0);
            });
        });
    });
})();
