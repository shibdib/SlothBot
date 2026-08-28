/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by rober on 5/16/2017.
 */

const {roomCanBurnSurplus} = require('spawnFlow');

const SPECIALTY_ECO = 'eco';
const SPECIALTY_LAB = 'lab';
const SPECIALTY_FACTORY = 'factory';
const SPECIALTY_GENERALIST = 'generalist';

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

function operatorSpecialty(powerCreep) {
    return (powerCreep.memory && powerCreep.memory.specialty) || SPECIALTY_ECO;
}

function isEcoCover(powerCreep) {
    const spec = operatorSpecialty(powerCreep);
    return spec === SPECIALTY_ECO || spec === SPECIALTY_GENERALIST;
}

function rcl7RoomCount() {
    if (!MY_ROOMS) return 0;
    let n = 0;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const room = Game.rooms[MY_ROOMS[i]];
        if (room && room.controller && room.controller.my && room.level >= 7) n++;
    }
    return n;
}

function ecoOperatorCount() {
    let n = 0;
    for (const name in Game.powerCreeps) {
        const c = Game.powerCreeps[name];
        if (!c || !c.my) continue;
        if (isEcoCover(c)) n++;
    }
    return n;
}

function labOperatorCount() {
    let n = 0;
    for (const name in Game.powerCreeps) {
        const c = Game.powerCreeps[name];
        if (!c || !c.my) continue;
        if (operatorSpecialty(c) === SPECIALTY_LAB) n++;
    }
    return n;
}

function producingBoostCount() {
    if (!MY_ROOMS) return 0;
    let n = 0;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const room = Game.rooms[MY_ROOMS[i]];
        if (room && room.memory && room.memory.producingBoost) n++;
    }
    return n;
}

function needMoreEcoOperators() {
    return ecoOperatorCount() < rcl7RoomCount();
}

function needMoreLabOperators() {
    const producing = producingBoostCount();
    if (!producing) return false;
    return labOperatorCount() < Math.ceil(producing / 2);
}

function hasFactoryPowerLevel(level) {
    for (const name in Game.powerCreeps) {
        const c = Game.powerCreeps[name];
        if (!c || !c.my) continue;
        const power = c.powers && c.powers[PWR_OPERATE_FACTORY];
        if (power && power.level === level) return true;
        if (operatorSpecialty(c) === SPECIALTY_FACTORY && (c.memory.factoryLevel || 1) === level) return true;
    }
    return false;
}

function uncoveredFactoryLevel() {
    if (!MY_ROOMS) return 0;
    let best = 0;
    for (let i = 0; i < MY_ROOMS.length; i++) {
        const room = Game.rooms[MY_ROOMS[i]];
        const factory = room && room.factory;
        const level = factory && factory.level;
        if (!level) continue;
        if (hasFactoryPowerLevel(level)) continue;
        if (!best || level < best) best = level;
    }
    return best;
}

function getRegenSourceOperatorForRoom(roomName) {
    if (!roomName) return null;
    let best = null;
    let bestLevel = 0;
    for (const name in Game.powerCreeps) {
        const c = Game.powerCreeps[name];
        if (!c || !c.my || !c.memory) continue;
        if (!isEcoCover(c)) continue;
        if (c.memory.destinationRoom !== roomName) continue;
        const regen = c.powers && c.powers[PWR_REGEN_SOURCE];
        if (!regen || !regen.level) continue;
        if (regen.level > bestLevel) {
            best = c;
            bestLevel = regen.level;
        }
    }
    return best;
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

function nextOperatorSpec() {
    const sparePowerLevels = getSparePowerLevels();
    if (sparePowerLevels <= 5) return null;
    const lowestOperator = getLowestMyOperator();
    if (lowestOperator.id && lowestOperator.level < 11) return null;

    if (needMoreEcoOperators()) return {specialty: SPECIALTY_ECO};

    if (lowestOperator.id && lowestOperator.level < 14) return null;

    if (needMoreLabOperators()) return {specialty: SPECIALTY_LAB};

    const factoryLevel = uncoveredFactoryLevel();
    if (factoryLevel) return {specialty: SPECIALTY_FACTORY, factoryLevel};

    return null;
}

function createOperator(spec) {
    if (!Memory._powerCreeps) Memory._powerCreeps = {nameSerial: 0};
    const specialty = spec && spec.specialty || SPECIALTY_ECO;
    for (let attempt = 0; attempt < 25; attempt++) {
        const name = 'operator_' + (++Memory._powerCreeps.nameSerial);
        if (PowerCreep.create(name, POWER_CLASS.OPERATOR) === OK) {
            const created = Game.powerCreeps[name];
            const pending = {specialty, factoryLevel: spec && spec.factoryLevel};
            Memory._powerCreeps.pending = Memory._powerCreeps.pending || {};
            Memory._powerCreeps.pending[name] = pending;
            if (created) {
                created.memory.specialty = specialty;
                if (specialty === SPECIALTY_FACTORY) {
                    created.memory.factoryLevel = spec.factoryLevel || 1;
                }
            }
            const extra = specialty === SPECIALTY_FACTORY ? (' T' + (spec.factoryLevel || 1)) : '';
            log.a('Created a ' + specialty + extra + ' operator named ' + name);
            return;
        }
    }
    log.e('Failed to create a power creep operator after 25 attempts.', 'POWER MANAGER: ');
}

module.exports.getSparePowerLevels = getSparePowerLevels;
module.exports.getLowestMyOperator = getLowestMyOperator;
module.exports.getRegenSourceOperatorForRoom = getRegenSourceOperatorForRoom;
module.exports.needMoreEcoOperators = needMoreEcoOperators;
module.exports.needMoreLabOperators = needMoreLabOperators;
module.exports.isEcoCover = isEcoCover;
module.exports.operatorSpecialty = operatorSpecialty;
module.exports.SPECIALTY_ECO = SPECIALTY_ECO;
module.exports.SPECIALTY_LAB = SPECIALTY_LAB;
module.exports.SPECIALTY_FACTORY = SPECIALTY_FACTORY;
module.exports.SPECIALTY_GENERALIST = SPECIALTY_GENERALIST;

module.exports.powerControl = function () {
    const powerSpawns = [];
    for (const r of MY_ROOMS) {
        const room = Game.rooms[r];
        if (!room) continue;
        const spawn = getRoomPowerSpawn(room);
        if (spawn && spawn.store[RESOURCE_POWER] > 0 && spawn.store[RESOURCE_ENERGY] >= 50
            && roomCanBurnSurplus(room)) {
            powerSpawns.push(spawn);
        }
    }
    for (const powerSpawn of powerSpawns) {
        powerSpawn.processPower();
    }

    if (!Game.gpl || !Game.gpl.level) return;

    const sparePowerLevels = getSparePowerLevels();
    const lowestOperator = getLowestMyOperator();
    const spec = nextOperatorSpec();
    if (spec) createOperator(spec);

    if (!_.size(Game.powerCreeps)) return;

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
};
