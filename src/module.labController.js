/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let primaryLabs = {};

module.exports.labManager = function () {
    let labRooms = _.filter(MY_ROOMS, (r) => _.filter(Game.rooms[r].structures, (s) => s.structureType === STRUCTURE_LAB).length >= 3);
    if (labRooms.length) {
        if (Game.time % 500 === 0) cleanLabs();
        for (let roomName of labRooms) {
            let room = Game.rooms[roomName];
            // If no hubs, continue
            if (!room.memory.labHub) continue;
            if (Game.time % 100 === 0 || !primaryLabs[room.name]) manageBoostProduction(room);
            manageActiveLabs(room);
        }
    }
};

function manageActiveLabs(room) {
    if (!room.memory.producingBoost) return;
    let hub = primaryLabs[room.name].map(id => Game.getObjectById(id));
    hub[0].say(room.memory.producingBoost);
    let secondaryLabs = _.filter(room.impassibleStructures, (s) => !s.cooldown && s.structureType === STRUCTURE_LAB && !primaryLabs[room.name].includes(s.id) &&
        (!s.memory.neededBoost || s.memory.neededBoost === room.memory.producingBoost) && (!s.mineralType || s.mineralType === room.memory.producingBoost));
    if (secondaryLabs.length) {
        for (let target of secondaryLabs) {
            switch (target.runReaction(hub[0], hub[1])) {
                case OK:
                    // Handle cutoff checks
                    // Check if we already have enough
                    let cutOff = BOOST_AMOUNT * 1.5;
                    // Ghodium special case, always have NUKER_GHODIUM_CAPACITY * 2
                    if (room.memory.producingBoost === RESOURCE_GHODIUM) cutOff = (NUKER_GHODIUM_CAPACITY * 5) + (SAFE_MODE_COST * 3);
                    if (_.includes(LAB_PRIORITY, room.memory.producingBoost)) cutOff = BOOST_AMOUNT * 3;
                    if (Math.random() > 0.8 && room.store(room.memory.producingBoost) > cutOff) {
                        log.a(room.name + ' is no longer producing ' + room.memory.producingBoost + ' due to reaching the production cap.');
                        room.memory.producingBoost = undefined;
                        primaryLabs[room.name] = undefined;
                        for (let lab of hub) {
                            lab.memory = undefined;
                        }
                        return;
                    }
                    return;
                case ERR_NOT_ENOUGH_RESOURCES:
                    for (let hubLab of hub) {
                        if (room.store(hubLab.memory.itemNeeded) < 50) {
                            log.a(room.name + ' is no longer producing ' + room.memory.producingBoost + ' due to a shortage of ' + hubLab.memory.itemNeeded);
                            room.memory.producingBoost = undefined;
                            primaryLabs[room.name] = undefined;
                            for (let lab of hub) {
                                lab.memory = undefined;
                            }
                            return;
                        }
                    }
                    return;
            }
        }
    }
}

function manageBoostProduction(room) {
    let hub;
    // Get input labs
    if (!primaryLabs[room.name]) {
        let labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
        let labs = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB && ((s.pos.x === labHub.x && s.pos.y === labHub.y) || (s.pos.x === labHub.x && s.pos.y === labHub.y + 1)));
        if (labs.length) primaryLabs[room.name] = _.pluck(labs, 'id');
        return;
    } else {
        hub = primaryLabs[room.name].map(id => Game.getObjectById(id));
    }
    if (room.memory.producingBoost) return;
    let secondaryLabs = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_LAB && !primaryLabs[room.name].includes(s.id));
    if (!secondaryLabs.length || hub.length < 2) return;
    // Find boosts we can make
    let boost;
    let boostList = _.union(LAB_PRIORITY, BASE_COMPOUNDS, TIER_1_BOOSTS, TIER_2_BOOSTS, TIER_3_BOOSTS);
    for (let key in boostList) {
        // Check if we already have enough
        let cutOff = BOOST_AMOUNT;
        // Ghodium special case, always have NUKER_GHODIUM_CAPACITY * 2.5 and SAFE_MODE_COST * 1.5
        if (boostList[key] === RESOURCE_GHODIUM) cutOff = (NUKER_GHODIUM_CAPACITY * 2.5) + (SAFE_MODE_COST * 1.5);
        if (_.includes(LAB_PRIORITY, boostList[key])) cutOff = BOOST_AMOUNT * 1.5;
        if (room.store(boostList[key], true) >= cutOff) continue;
        // Check for inputs
        if (!checkForInputs(room, boostList[key])) continue;
        boost = boostList[key];
        break;
    }
    if (!boost) return;
    let i = 0;
    for (let lab of hub) {
        lab.memory = {
            itemNeeded: BOOST_COMPONENTS[boost][i],
            room: room.name
        };
        i++;
    }
    room.memory.producingBoost = boost;
    log.a(room.name + ' queued ' + boost + ' for creation.');
}

function checkForInputs(room, boost) {
    let components = BOOST_COMPONENTS[boost];
    if (!components || !components.length) return undefined;
    for (let input of shuffle(components)) {
        if (room.store(input, true) < 75) return false;
    }
    return boost;
}

function cleanLabs() {
    let boostLabs = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.neededBoost);
    for (let key in boostLabs) {
        let boostLab = boostLabs[key];
        if (boostLab.memory && (!boostLab.memory.requested || boostLab.memory.requested + 150 < Game.time || !Game.getObjectById(boostLab.memory.requestor))) {
            boostLab.memory = undefined;
        }
    }
}