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

module.exports.loop = function() {
    profiler.wrap(function () {
        let mainCpu = Game.cpu.getUsed();
        Memory.loggingLevel = 5; //Set level 1-5 (5 being most info)

        //Update allies
        populateLOANlist();

        Memory.stats.cpu.init = Game.cpu.getUsed();

        //Grafana
        screepsPlus.collect_stats();

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
    log.a('~~~~~BENCHMARK REPORT~~~~~');
    let sorted = _.sortBy(Memory._benchmark, 'avg');
    for (let key in sorted) {
        log.a(key + ' - Was Used ' + sorted[key]['useCount'] + ' times over ' + sorted[key]['tickCount'] + ' ticks. Average CPU Used: ' + sorted[key]['avg']);
    }
    if (notify) {
        Game.notify('~~~~~BENCHMARK REPORT~~~~~');
        for (let key in sorted) {
            log.a(key + ' - Was Used ' + sorted[key]['useCount'] + ' times over ' + sorted[key]['tickCount'] + ' ticks. Average CPU Used: ' + sorted[key]['avg']);
        }
    }
};

resetBench = function () {
    Memory._benchmark = undefined;
    Memory.reportBench = undefined;
    Memory.reportBenchNotify = undefined;
    log.a('Benchmarks Reset');
};