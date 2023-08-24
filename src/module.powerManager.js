/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 5/16/2017.
 */

module.exports.powerControl = function () {
    let powerSpawns = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN && s.store[RESOURCE_POWER] && s.store[RESOURCE_ENERGY] >= 50);
    if (powerSpawns.length) {
        for (let powerSpawn of powerSpawns) {
            powerSpawn.processPower();
        }
    }
    // Handle PC spawning
    if (Game.gpl.level) {
        let sparePowerLevels = Game.gpl.level - (_.size(Game.powerCreeps) + _.sum(Game.powerCreeps, 'level'));
        let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME && r.controller.level >= 7);
        let lowestOperator = _.min(Game.powerCreeps, 'level');
        if (sparePowerLevels > 1 && _.size(Game.powerCreeps) < myRooms.length && (!lowestOperator.id || lowestOperator.level >= 11)) {
            let name = 'operator_' + _.random(1, 999);
            log.a('Created an operator named ' + name);
            PowerCreep.create(name, POWER_CLASS.OPERATOR);
        } else if (_.size(Game.powerCreeps)) {
            let powerCreeps = _.filter(Game.powerCreeps, (c) => c.my);
            for (let powerCreep of powerCreeps) {
                if (powerCreep.ticksToLive) {
                    const powerCreepRole = require('powerRole.' + powerCreep.className);
                    try {
                        // Handle suicide
                        if (!powerCreep.level && sparePowerLevels <= 0) {
                            powerCreep.suicide();
                            continue;
                        }
                        // If idle sleep
                        if (powerCreep.idle) continue;
                        // Handle nuke flee
                        if (powerCreep.memory.fleeNukeTime && powerCreep.fleeNukeRoom()) return;
                        powerCreepRole.role(powerCreep);
                    } catch (e) {
                        log.e(powerCreepRole.name + ' in room ' + powerCreep.room.name + ' experienced an error');
                        log.e(e.stack);
                        Game.notify(e.stack);
                    }
                } else if (!powerCreep.deleteTime) {
                    // Handle deleting
                    if (!powerCreep.level && (sparePowerLevels <= 1 || (lowestOperator.id && lowestOperator.id !== powerCreep.id && lowestOperator.level < 11 && sparePowerLevels <= 11))) {
                        powerCreep.delete();
                    } else if (!powerCreep.spawnCooldownTime || powerCreep.spawnCooldownTime < Date.now()) {
                        let spawn = _.find(Game.structures, (s) => s.my && s.structureType === STRUCTURE_POWER_SPAWN && s.isActive());
                        if (spawn) {
                            log.a('Spawned an operator in ' + roomLink(spawn.room.name));
                            powerCreep.spawn(spawn);
                        }
                    }
                }
            }
        }
    }
};

