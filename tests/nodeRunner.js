/* Node.js test runner — mocks browser APIs to run tests from terminal */
'use strict';

// Mock localStorage
const storage = {};
const localStorage = {
    _data: storage,
    getItem(key) { return key in storage ? storage[key] : null; },
    setItem(key, val) { storage[key] = String(val); },
    removeItem(key) { delete storage[key]; },
    key(i) { return Object.keys(storage)[i] || null; },
    get length() { return Object.keys(storage).length; },
    clear() { for (const k of Object.keys(storage)) delete storage[k]; }
};

// Mock window + globals
const window = global;
global.window = window;
global.localStorage = localStorage;
global.confirm = () => true;
global.Date._now = Date.now;

// Load scripts in order
require('./prng.js');
require('./dataPools.js');
require('./seedGenerator.js');
require('./seedInjector.js');
require('./testFramework.js');
require('./testSuiteData.js');
require('./testSuiteAggregation.js');
require('./testSuiteUI.js');

// Run
const result = window.TestFramework.runAllSuites();

// Print results
console.log('\n========================================');
console.log('  LEVELUP TEST RESULTS');
console.log('========================================\n');

let currentSuite = '';
window.TestResults.forEach(r => {
    if (r.suite !== currentSuite) {
        currentSuite = r.suite;
        console.log(`\n  ${currentSuite}`);
        console.log('  ' + '-'.repeat(currentSuite.length));
    }
    const icon = r.status === 'pass' ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`    [${icon}] ${r.test}`);
    if (r.error) {
        console.log(`           \x1b[31m${r.error}\x1b[0m`);
    }
});

console.log('\n========================================');
const color = result.failed === 0 ? '\x1b[32m' : '\x1b[31m';
console.log(`  ${color}${result.passed} passed, ${result.failed} failed, ${result.total} total\x1b[0m`);
console.log('========================================\n');

process.exit(result.failed > 0 ? 1 : 0);
