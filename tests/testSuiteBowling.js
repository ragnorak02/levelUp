/* --------------------------------
   testSuiteBowling.js — bowling/bowlingCore.js
   Scoring checked against real bowling results. Frames are built in
   memory; nothing touches localStorage.
----------------------------------*/
(function() {
    'use strict';

    var B = window.BowlingCore;

    /* pinsLeft lists for "n pins still standing" */
    function left(n) { var a = []; for (var i = 1; i <= n; i++) a.push(i); return a; }
    function strike() { return { shots: [{ pinsLeft: [] }] }; }
    function spare(first) { return { shots: [{ pinsLeft: left(10 - first) }, { pinsLeft: [] }] }; }
    function open(a, b) { return { shots: [{ pinsLeft: left(10 - a) }, { pinsLeft: left(10 - a - b) }] }; }
    function tenth() {   // tenth(9, 1, 8) etc: pins knocked by each ball
        var balls = Array.prototype.slice.call(arguments), standing = 10, shots = [];
        balls.forEach(function(k) {
            standing -= k;
            shots.push({ pinsLeft: left(standing) });
            if (standing === 0) standing = 10;
        });
        return { shots: shots };
    }
    function game(frames) { return { frames: frames }; }
    function repeat(fn, n) { var out = []; for (var i = 0; i < n; i++) out.push(fn()); return out; }

    describe('Bowling Scoring', function() {
        it('perfect game is 300', function() {
            var g = game(repeat(strike, 9).concat([tenth(10, 10, 10)]));
            assert.equal(B.getFinalScore(g), 300);
        });

        it('all 9/ spares with a 9 fill ball is 190', function() {
            var g = game(repeat(function() { return spare(9); }, 9).concat([tenth(9, 1, 9)]));
            assert.equal(B.getFinalScore(g), 190);
        });

        it('all 7-2 open frames is 90', function() {
            var g = game(repeat(function() { return open(7, 2); }, 9).concat([tenth(7, 2)]));
            assert.equal(B.getFinalScore(g), 90);
        });

        it('a spare frame waits for its bonus ball', function() {
            var scores = B.calculateGameScore([spare(9)].concat(repeat(function() { return { shots: [] }; }, 9)));
            assert.equal(scores[0], null);
            var scored = B.calculateGameScore([spare(9), open(7, 2)].concat(repeat(function() { return { shots: [] }; }, 8)));
            assert.deepEqual(scored.slice(0, 2), [17, 26]);
        });

        it('10th frame: strike then a spare earns a third ball', function() {
            var f = { shots: [{ pinsLeft: [] }, { pinsLeft: left(3) }] };
            assert.ok(!B.isFrameComplete(f, 9), 'needs a third ball');
            assert.deepEqual(B.getAvailablePins(f, 9), left(3));
            f.shots.push({ pinsLeft: [] });
            assert.ok(B.isFrameComplete(f, 9));
            assert.equal(B.shotDisplay(f, 0, 9) + B.shotDisplay(f, 1, 9) + B.shotDisplay(f, 2, 9), 'X7/');
        });

        it('marks: strike, spare, gutter, count', function() {
            assert.equal(B.shotDisplay(strike(), 0, 0), 'X');
            var s = spare(8);
            assert.equal(B.shotDisplay(s, 0, 0) + B.shotDisplay(s, 1, 0), '8/');
            var o = open(0, 5);
            assert.equal(B.shotDisplay(o, 0, 0) + B.shotDisplay(o, 1, 0), '-5');
        });

        it('currentPosition walks frames and balls', function() {
            var g = game([strike(), { shots: [{ pinsLeft: left(2) }] }].concat(repeat(function() { return { shots: [] }; }, 8)));
            assert.deepEqual(B.currentPosition(g), { frame: 1, ball: 1 });
            assert.deepEqual(B.getAvailablePins(g.frames[1], 1), left(2));
        });
    });
})();
