/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by rober on 5/16/2017.
 */

function getSparePowerLevels() {
    if (!Game.gpl || !Game.gpl.level) return 0;
    return Game.gpl.level - (_.size(Game.powerCreeps) + _.sum(Game.powerCreeps, 'level'));
}

function getLowestMyOperator() {
    const mine = _.filter(Game.powerCreeps, c => c.my);
    if (!mine.length) return {id: null, level: 0};
    const lowest = _.min(mine, 'level');
    return lowest || {id: null, level: 0};
}

function getRoomPowerSpawn(room) {
    if (!room || !room.structures) return undefined;
    return room.structures.find(s => (s.safeIsMy ? s.safeIsMy() : false) && s.structureType === STRUCTURE_POWER_SPAWN);
}

function findSpawnForPowerCreep(powerCreep) {
    const destName = powerCreep.memory.destinationRoom;
    if (destName) {
        const destRoom = Game.rooms[destName];
        const destSpawn = destRoom && getRoomPowerSpawn(destRoom);
        if (destSpawn && destSpawn.isActive()) return destSpawn;
    }

    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room || !room.controller || room.controller.level < 8) continue;
        const spawn = getRoomPowerSpawn(room);
        if (spawn && spawn.isActive()) return spawn;
    }

    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room) continue;
        const spawn = getRoomPowerSpawn(room);
        if (spawn && spawn.isActive()) return spawn;
    }

    return _.find(Game.structures, s => (s.safeIsMy ? s.safeIsMy() : false) && s.structureType === STRUCTURE_POWER_SPAWN && (function () {
        try {
            return s.isActive();
        } catch (e) {
            return false;
        }
    })());
}

function createOperator() {
    if (!Memory._powerCreeps) Memory._powerCreeps = {nameSerial: 0};
    for (let attempt = 0; attempt < 25; attempt++) {
        const name = 'operator_' + (++Memory._powerCreeps.nameSerial);
        if (PowerCreep.create(name, POWER_CLASS.OPERATOR) === OK) {
            log.a('Created an operator named ' + name);
            return;
        }
    }
    log.e('Failed to create a power creep operator after 25 attempts.', 'POWER MANAGER: ');
}

module.exports.getSparePowerLevels = getSparePowerLevels;
module.exports.getLowestMyOperator = getLowestMyOperator;

module.exports.powerControl = function () {
    const powerSpawns = [];
    for (const r of MY_ROOMS) {
        const room = Game.rooms[r];
        if (!room) continue;
        const spawn = getRoomPowerSpawn(room);
        if (spawn && spawn.store[RESOURCE_POWER] > 0 && spawn.store[RESOURCE_ENERGY] >= 50) {
            powerSpawns.push(spawn);
        }
    }
    for (const powerSpawn of powerSpawns) {
        powerSpawn.processPower();
    }

    if (!Game.gpl || !Game.gpl.level) return;

    const sparePowerLevels = getSparePowerLevels();
    const lowestOperator = getLowestMyOperator();
    const myRooms = _.filter(Game.rooms, r =>
        r.energyAvailable && r.controller && r.controller.owner && r.controller.owner.username === MY_USERNAME && r.controller.level >= 7
    );

    if (sparePowerLevels > 5 && _.size(Game.powerCreeps) < myRooms.length && (!lowestOperator.id || lowestOperator.level >= 14)) {
        createOperator();
    } else if (_.size(Game.powerCreeps)) {
        const powerCreeps = _.filter(Game.powerCreeps, c => c.my);
        for (const powerCreep of powerCreeps) {
            if (powerCreep.ticksToLive) {
                const powerCreepRole = require('powerRole.' + powerCreep.className);
                try {
                    if (!powerCreep.level && sparePowerLevels <= 0) {
                        powerCreep.suicide();
                        continue;
                    }
                    if (powerCreep.idle) continue;
                    if (powerCreep.memory.fleeNukeTime && powerCreep.fleeNukeRoom()) return;
                    powerCreepRole.role(powerCreep);
                } catch (e) {
                    const roomName = powerCreep.room ? powerCreep.room.name : 'unspawned';
                    log.e(powerCreep.className + ' in ' + roomName + ' experienced an error');
                    log.e(e.stack);
                    Game.notify(e.stack);
                }
            } else if (!powerCreep.deleteTime) {
                if (!powerCreep.level && (sparePowerLevels <= 1 || (lowestOperator.id && lowestOperator.id !== powerCreep.id && lowestOperator.level < 11 && sparePowerLevels <= 11))) {
                    powerCreep.delete();
                } else if (!powerCreep.spawnCooldownTime || powerCreep.spawnCooldownTime < Date.now()) {
                    const spawn = findSpawnForPowerCreep(powerCreep);
                    if (spawn) {
                        log.a('Spawned an operator in ' + roomLink(spawn.room.name));
                        powerCreep.spawn(spawn);
                    }
                }
            }
        }
    }
};