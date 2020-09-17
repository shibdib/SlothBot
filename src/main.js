/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

//modules
//Setup globals and prototypes
require("require");
let tools = require("tools.misc");
let hive = require('main.hive');
let cleanUp = require('module.cleanup');
log.e('Global Reset - Last reset occurred ' + (Game.time - (Memory.lastGlobalReset || Game.time)) + ' ticks ago.');
Memory.lastGlobalReset = Game.time;

module.exports.loop = function () {
    // Misc Tools
    tools.memHack();
    tools.tickLength();
    tools.cleanMemory();
    tools.status();

    //Bucket Check
    if (Memory.cooldown) {
        if (Memory.cooldown + 25 < Game.time) {
            delete Memory.cooldown;
        } else {
            let countDown = (Memory.cooldown + 25) - Game.time;
            log.e('On CPU Cooldown For ' + countDown + ' more ticks. Current Bucket ' + Game.cpu.bucket);
            return;
        }
    } else if (Game.cpu.bucket < Game.cpu.limit * 10) {
        Memory.cooldown = Game.time;
        log.e('Skipping tick ' + Game.time + ' due to lack of CPU.');
        return;
    }

    // Update allies
    populateLOANlist();

    // Cleanup Modules
    cleanUp.cleanup();

    // Store owned rooms in array
    if (!Memory.myRooms || !Memory.myRooms.length || Game.time % 100 === 0) {
        let myRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.my);
        if (myRooms.length) {
            Memory.myRooms = _.pluck(myRooms, '.name');
            Memory.maxLevel = _.max(myRooms, 'controller.level').controller.level;
            Memory.minLevel = _.min(myRooms, 'controller.level').controller.level;
        }
    }

    //Hive Mind
    if (Memory.myRooms && Memory.myRooms.length) hive.hiveMind();

    // Pixel Gen
    if (Game.cpu.bucket >= 7500 && !!~['shard0', 'shard1', 'shard2', 'shard3'].indexOf(Game.shard.name)) {
        Game.cpu.generatePixel();
        log.a('Pixel Generated.');
        Memory.lastPixelGenerated = Game.time;
    }
};