//modules
//Setup globals and prototypes
require("require");
let profiler = require('screeps-profiler');
let _ = require('lodash');
let screepsPlus = require('screepsplus');
let hive = require('main.Hive');
let cleanUp = require('module.Cleanup');
let segments = require('module.segmentManager');
let shib = require("shibBench");

//profiler.enable();
//global.lastMemoryTick = undefined;

module.exports.loop = function() {
    profiler.wrap(function () {
        let mainCpu = Game.cpu.getUsed();
        //Dissi hack
        //tryInitSameMemory();

        //Logging level
        Memory.loggingLevel = 5; //Set level 1-5 (5 being most info)

        //GC
        let gcMem = Game.cpu.getUsed();
        if (!!~['shard0', 'shard1', 'shard2'].indexOf(Game.shard.name) && Game.cpu.getHeapStatistics().total_heap_size + Game.cpu.getHeapStatistics().externally_allocated_size > 0.85 * Game.cpu.getHeapStatistics().heap_size_limit) gc();
        shib.shibBench('garbageCollection', gcMem);

        //Update allies
        populateLOANlist();

        //Must run modules
        segments.segmentManager();
        cleanUp.cleanup();

        //Bucket Check
        if (Game.cpu.bucket < 100 * Game.cpu.tickLimit && Game.cpu.bucket < Game.cpu.limit * 10) {
            log.e('Skipping tick ' + Game.time + ' due to lack of CPU.');
            return;
        }

        //Hive Mind
        hive.hiveMind();

        shib.shibBench('Total', mainCpu);
        shib.processBench();
    });
};

requestBench = function (ticks, notify = false) {
    Memory._benchmark = undefined;
    Memory.reportBench = Game.time + ticks;
    Memory.reportBenchNotify = notify;
    log.a('Benchmark Queued');
};

currentStats = function (notify = false) {
    let sorted = _.sortBy(Memory._benchmark, 'avg');
    log.e('---------------------------------------------------------------------------');
    log.e('~~~~~BENCHMARK REPORT~~~~~');
    if (notify) Game.notify('~~~~~BENCHMARK REPORT~~~~~');
    let totalTicks;
    let overallAvg;
    let bucketAvg;
    let bucketTotal;
    for (let key in sorted) {
        if (sorted[key]['title'] === 'Total') {
            totalTicks = sorted[key]['tickCount'];
            overallAvg = sorted[key]['avg'];
            continue;
        }
        if (sorted[key]['title'] === 'bucket') {
            bucketAvg = sorted[key]['avg'];
            bucketTotal = sorted[key]['used'];
            continue;
        }
        log.a(sorted[key]['title'] + ' - Was Used ' + sorted[key]['useCount'] + ' times. ||| Average CPU Used: ' + _.round(sorted[key]['avg'], 3) + '. ||| Total CPU Used: ' + _.round(sorted[key]['avg'] * sorted[key]['useCount'], 3));
        if (notify) Game.notify(sorted[key]['title'] + ' - Was Used ' + sorted[key]['useCount'] + ' times. ||| Average CPU Used: ' + _.round(sorted[key]['avg'], 3) + '. ||| Total CPU Used: ' + _.round(sorted[key]['avg'] * sorted[key]['useCount'], 3));
    }
    log.e('Ticks Covered: ' + totalTicks + '. Average CPU Used: ' + _.round(overallAvg, 3));
    log.e('Total Bucket Used: ' + bucketTotal + '. Current Bucket: ' + Game.cpu.bucket);
    log.e('---------------------------------------------------------------------------');
    if (notify) Game.notify('Ticks Covered: ' + totalTicks + '. Average CPU Used: ' + _.round(overallAvg, 3));
    if (notify) Game.notify('Total Bucket Used: ' + bucketTotal + '. Current Bucket: ' + Game.cpu.bucket);
};

resetBench = function () {
    Memory._benchmark = undefined;
    Memory.reportBench = undefined;
    Memory.reportBenchNotify = undefined;
    log.a('Benchmarks Reset');
};


function tryInitSameMemory() {
    if (lastMemoryTick && global.LastMemory && Game.time === (lastMemoryTick + 1)) {
        delete global.Memory;
        global.Memory = global.LastMemory;
        RawMemory._parsed = global.LastMemory
    } else {
        Memory;
        global.LastMemory = RawMemory._parsed
    }
    lastMemoryTick = Game.time
}