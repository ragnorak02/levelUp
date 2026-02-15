/* --------------------------------
   prng.js — Deterministic PRNG
   Mulberry32 seeded RNG with helpers
----------------------------------*/
(function() {
    'use strict';

    function mulberry32(seed) {
        let s = seed | 0;
        return function() {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    let _seed = 42;
    let _rng = mulberry32(_seed);

    function reset(seed) {
        _seed = seed != null ? seed : 42;
        _rng = mulberry32(_seed);
    }

    function raw() {
        return _rng();
    }

    function randInt(min, max) {
        return Math.floor(_rng() * (max - min + 1)) + min;
    }

    function randFloat(min, max) {
        return _rng() * (max - min) + min;
    }

    function pick(arr) {
        return arr[Math.floor(_rng() * arr.length)];
    }

    function pickN(arr, n) {
        const shuffled = shuffle([...arr]);
        return shuffled.slice(0, Math.min(n, arr.length));
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(_rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function chance(probability) {
        return _rng() < probability;
    }

    window.TestPRNG = {
        reset,
        raw,
        randInt,
        randFloat,
        pick,
        pickN,
        shuffle,
        chance,
        getSeed: function() { return _seed; }
    };
})();
