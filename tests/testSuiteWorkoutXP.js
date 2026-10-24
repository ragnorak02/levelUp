/* --------------------------------
   testSuiteWorkoutXP.js — powerUp/workoutXP.js
   How much of a level each workout earns. Scores built from in-memory
   day lists, so these never touch localStorage.
----------------------------------*/
(function() {
    'use strict';

    var XP = window.WorkoutXP;

    function set(w, r) { return { weight: w, reps: r, done: true }; }
    function ex(name, part, sets) { return { name: name, bodyPart: part, finished: true, sets: sets }; }
    function day(date, exercises) { return { date: date, exercises: exercises }; }
    function bench(w) { return ex('Bench Press', 'Chest', [set(w, 8), set(w, 8), set(w, 8)]); }

    describe('WorkoutXP Scoring', function() {
        it('a first-ever workout earns the base percentage', function() {
            var s = XP.scoreAll([day('2026-01-01', [bench(100)])]);
            assert.closeTo(s.get('2026-01-01').pct, XP.BASE_PCT, 0.001);
        });

        it('the same session at a heavier weight earns more, plus a weight PR', function() {
            var s = XP.scoreAll([
                day('2026-01-01', [bench(100)]),
                day('2026-01-08', [bench(100)]),
                day('2026-01-15', [bench(130)])
            ]);
            var same = s.get('2026-01-08'), heavier = s.get('2026-01-15');
            assert.ok(heavier.strength > 1.2, 'strength ratio should reflect 30% heavier');
            assert.greaterThan(heavier.pct, same.pct + 5);
            assert.deepEqual(heavier.prs.map(function(p) { return p.kind; }), ['weight']);
        });

        it('a big legs day is judged against legs, not against arms', function() {
            var legs = function(w) { return ex('Squat', 'Legs', [set(w, 10), set(w, 10), set(w, 10)]); };
            var curl = function(w) { return ex('Curl', 'Biceps', [set(w, 10), set(w, 10), set(w, 10)]); };
            var s = XP.scoreAll([
                day('2026-02-01', [legs(300)]), day('2026-02-02', [curl(30)]),
                day('2026-02-08', [legs(300)]), day('2026-02-09', [curl(30)])
            ]);
            // 10x the volume, same effort relative to its own history
            assert.closeTo(s.get('2026-02-08').pct, s.get('2026-02-09').pct, 0.001);
        });

        it('only Done sets count until an exercise is finished', function() {
            var open = { name: 'Row', bodyPart: 'Back', finished: false,
                         sets: [{ weight: 100, reps: 8, done: false }] };
            var s = XP.scoreAll([day('2026-03-01', [open])]);
            assert.ok(!s.has('2026-03-01'), 'nothing done yet means no score');
        });

        it('PR bonus is capped', function() {
            var first = [], second = [];
            for (var i = 0; i < 10; i++) {
                first.push(ex('Lift ' + i, 'Back', [set(50, 8)]));
                second.push(ex('Lift ' + i, 'Back', [set(60, 8), set(60, 8), set(60, 8), set(60, 8)]));
            }
            var s = XP.scoreAll([day('2026-04-01', first), day('2026-04-08', second)]);
            assert.equal(s.get('2026-04-08').bonus, XP.BONUS_CAP);
        });

        it('report summarises each body part it has learned', function() {
            var s = XP.scoreAll([
                day('2026-06-01', [bench(100)]),
                day('2026-06-08', [bench(110)]),
                day('2026-06-15', [ex('Squat', 'Legs', [set(200, 5)])])
            ]);
            var r = XP.buildReport(s);
            assert.equal(r.summary.workouts, 3);
            assert.equal(r.summary.byBodyPart.Chest.sessions, 2);
            assert.equal(r.summary.byBodyPart.Legs.usualVolumeLb, 1000);
            assert.equal(r.workouts[1].prs[0].kind, 'weight');
            assert.equal(r.settings.basePct, XP.BASE_PCT);
        });

        it('pctSince sums only workouts after the given date', function() {
            var s = XP.scoreAll([day('2026-05-01', [bench(100)]), day('2026-05-08', [bench(100)])]);
            assert.closeTo(XP.pctSince('2026-05-01', s), s.get('2026-05-08').pct, 0.001);
            assert.equal(XP.pctSince('2026-05-08', s), 0);
        });
    });
})();
