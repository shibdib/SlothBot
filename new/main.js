//modules
//Setup globals and prototypes
require("require");
let profiler = require('screeps-profiler');
let _ = require('lodash');
let screepsPlus = require('screepsplus');
let hive = require('main.Hive');
let cleanUp = require('module.Cleanup');
let segments = require('module.segmentManager');

//profiler.enable();

module.exports.loop = function() {
    profiler.wrap(function () {
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
    });
};