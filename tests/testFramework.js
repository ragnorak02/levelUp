/* --------------------------------
   testFramework.js — Minimal Assertion Library
   Browser-only, no dependencies
----------------------------------*/
(function() {
    'use strict';

    const suites = [];
    let currentSuite = null;

    window.TestResults = [];

    /* ===== Suite / Test Registration ===== */
    function describe(suiteName, fn) {
        suites.push({ name: suiteName, fn: fn, tests: [] });
    }

    function it(testName, fn) {
        if (!currentSuite) {
            console.error('it() called outside describe()');
            return;
        }
        currentSuite.tests.push({ name: testName, fn: fn });
    }

    /* ===== Assertions ===== */
    const assert = {
        equal: function(actual, expected, msg) {
            if (actual !== expected) {
                throw new Error((msg || 'assert.equal') + ': expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
            }
        },

        deepEqual: function(actual, expected, msg) {
            const a = JSON.stringify(actual);
            const b = JSON.stringify(expected);
            if (a !== b) {
                throw new Error((msg || 'assert.deepEqual') + ': objects not deep-equal.\nActual:   ' + a.slice(0, 200) + '\nExpected: ' + b.slice(0, 200));
            }
        },

        ok: function(val, msg) {
            if (!val) {
                throw new Error((msg || 'assert.ok') + ': expected truthy but got ' + JSON.stringify(val));
            }
        },

        throws: function(fn, msg) {
            let threw = false;
            try { fn(); } catch(e) { threw = true; }
            if (!threw) {
                throw new Error((msg || 'assert.throws') + ': expected function to throw');
            }
        },

        arrayLength: function(arr, n, msg) {
            if (!Array.isArray(arr)) {
                throw new Error((msg || 'assert.arrayLength') + ': expected array but got ' + typeof arr);
            }
            if (arr.length !== n) {
                throw new Error((msg || 'assert.arrayLength') + ': expected length ' + n + ' but got ' + arr.length);
            }
        },

        typeOf: function(val, type, msg) {
            if (typeof val !== type) {
                throw new Error((msg || 'assert.typeOf') + ': expected typeof ' + type + ' but got ' + typeof val);
            }
        },

        hasKeys: function(obj, keys, msg) {
            if (typeof obj !== 'object' || obj === null) {
                throw new Error((msg || 'assert.hasKeys') + ': expected object but got ' + typeof obj);
            }
            const missing = keys.filter(function(k) { return !(k in obj); });
            if (missing.length > 0) {
                throw new Error((msg || 'assert.hasKeys') + ': missing keys: ' + missing.join(', '));
            }
        },

        greaterThan: function(actual, expected, msg) {
            if (!(actual > expected)) {
                throw new Error((msg || 'assert.greaterThan') + ': expected ' + actual + ' > ' + expected);
            }
        },

        includes: function(arr, val, msg) {
            if (!Array.isArray(arr) || arr.indexOf(val) === -1) {
                throw new Error((msg || 'assert.includes') + ': ' + JSON.stringify(val) + ' not found in array');
            }
        },

        closeTo: function(actual, expected, delta, msg) {
            if (Math.abs(actual - expected) > delta) {
                throw new Error((msg || 'assert.closeTo') + ': expected ' + actual + ' to be within ' + delta + ' of ' + expected);
            }
        }
    };

    /* ===== Runner ===== */
    function runAllSuites() {
        window.TestResults = [];
        let passed = 0;
        let failed = 0;
        let errors = 0;

        suites.forEach(function(suite) {
            currentSuite = suite;
            try {
                suite.fn();
            } catch(e) {
                console.error('Error registering suite "' + suite.name + '":', e);
            }
            currentSuite = null;

            suite.tests.forEach(function(test) {
                const fullName = suite.name + ' > ' + test.name;
                try {
                    test.fn();
                    window.TestResults.push({ suite: suite.name, test: test.name, status: 'pass', error: null });
                    passed++;
                } catch(e) {
                    window.TestResults.push({ suite: suite.name, test: test.name, status: 'fail', error: e.message });
                    failed++;
                    console.error('FAIL: ' + fullName + '\n  ' + e.message);
                }
            });

            // Clear tests for re-run capability
            suite.tests = [];
        });

        const summary = { passed: passed, failed: failed, total: passed + failed };
        console.log('Test Results: ' + passed + ' passed, ' + failed + ' failed, ' + summary.total + ' total');
        return summary;
    }

    window.TestFramework = {
        describe: describe,
        it: it,
        assert: assert,
        runAllSuites: runAllSuites
    };

    // Also expose globally for convenience
    window.describe = describe;
    window.it = it;
    window.assert = assert;
})();
