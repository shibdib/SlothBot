/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Shared operator specialty constants and stock/coverage helpers.
 * Leaf module — powerManager and powerRole.operator both require this
 * so Screeps does not see a circular require at role load.
 */

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

module.exports = {
    SPECIALTY_ECO,
    SPECIALTY_LAB,
    SPECIALTY_FACTORY,
    SPECIALTY_GENERALIST,
    getSparePowerLevels,
    getLowestMyOperator,
    operatorSpecialty,
    isEcoCover,
    needMoreEcoOperators,
    needMoreLabOperators,
};
