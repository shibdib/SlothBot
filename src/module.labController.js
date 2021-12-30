/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 6/24/2017.
 */

let MANAGE_TICKS = 15;
module.exports.labManager = function () {
    let myRooms = _.filter(Memory.myRooms, (r) => Game.rooms[r].level >= 7 && !Game.rooms[r].nukes.length && _.find(Game.rooms[r].structures, (s) => s.structureType === STRUCTURE_LAB));
    if (myRooms.length) {
        if (Game.time % 500 === 0) cleanLabs();
        if (Game.time % 275 === 0) {
            for (let room of myRooms) {
                manageBoostProduction(Game.rooms[room]);
            }
        }
        if (Game.time % MANAGE_TICKS === 0) manageActiveLabs();
    }
};

function manageBoostProduction(room) {
    let hub;
    let availableLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && !s.memory.active && !s.memory.neededBoost && s.isActive());
    for (let lab of availableLabs) {
        hub = lab.pos.findInRange(room.structures, 1, {filter: (s) => s.structureType === STRUCTURE_LAB && !s.memory.active});
        if (hub.length >= 3) break;
    }
    if (!hub || !hub.length || hub.length < 3) return;
    let boost;
    let boostList = _.union(LAB_PRIORITY, BASE_COMPOUNDS, TIER_1_BOOSTS, TIER_2_BOOSTS, TIER_3_BOOSTS);
    for (let key in boostList) {
        // Check if we already have enough
        let cutOff = BOOST_AMOUNT;
        // Ghodium special case, always have NUKER_GHODIUM_CAPACITY * 2
        if (boostList[key] === RESOURCE_GHODIUM) cutOff = (NUKER_GHODIUM_CAPACITY * 2.5) + (SAFE_MODE_COST * 1.5);
        if (_.includes(LAB_PRIORITY, boostList[key])) cutOff = BOOST_AMOUNT * 1.5;
        if (room.store(boostList[key], true) >= cutOff) continue;
        // Only one hub per output
        //if (_.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.creating === boostList[key]).length) continue;
        // Check for inputs
        if (!checkForInputs(room, boostList[key])) continue;
        boost = boostList[key];
        break;
    }
    if (!boost) return;
    let count = 0;
    let hubId = _.random(1, 999999999);
    for (let lab of hub) {
        lab.memory = {
            creating: boost,
            room: room.name,
            id: hub[0].id,
            targetLab: hubId,
            active: true
        };
        if (count < 2) lab.memory.itemNeeded = BOOST_COMPONENTS[boost][count];
        count++;
    }
    MANAGE_TICKS = REACTION_TIME[boost];
    log.a(room.name + ' queued ' + boost + ' for creation.');
}

function manageActiveLabs() {
    let activeLabs = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_LAB && !s.cooldown && s.memory.active && s.memory.creating && !s.memory.itemNeeded && !s.memory.paused);
    if (activeLabs.length) {
        for (let key in activeLabs) {
            let hub = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_LAB && s.room.name === activeLabs[key].room.name && s.memory.targetLab === activeLabs[key].memory.targetLab && s.memory.active);
            let outputLabs = _.pluck(_.filter(hub, (l) => !l.memory.itemNeeded), 'id');
            if (!outputLabs.length || hub.length < 3) {
                for (let id in hub) {
                    hub[id].memory = undefined;
                }
                continue;
            }
            let creators = _.pluck(_.filter(hub, (l) => l.memory.itemNeeded), 'id');
            let creatorOne = Game.getObjectById(creators[0]);
            let creatorTwo = Game.getObjectById(creators[1]);
            // If any don't exist reset
            if (!creatorOne || !creatorTwo) {
                for (let id in hub) {
                    hub[id].memory = undefined;
                }
                continue
            }
            //Clean bad boosting
            if (creatorOne.memory.neededBoost && creatorOne.memory.neededBoost !== creatorOne.memory.itemNeeded) creatorOne.memory.neededBoost = undefined;
            if (creatorTwo.memory.neededBoost && creatorTwo.memory.neededBoost !== creatorTwo.memory.itemNeeded) creatorTwo.memory.neededBoost = undefined;
            for (let outputLab of outputLabs) {
                outputLab = Game.getObjectById(outputLab);
                switch (outputLab.runReaction(creatorOne, creatorTwo)) {
                    case OK:
                        // Set reaction time
                        if (REACTION_TIME[outputLab.memory.creating] + 1 < MANAGE_TICKS) MANAGE_TICKS = REACTION_TIME[outputLab.memory.creating] + 1;
                        // Check if we already have enough
                        let cutOff = BOOST_AMOUNT * 1.5;
                        // Ghodium special case, always have NUKER_GHODIUM_CAPACITY * 2
                        if (outputLab.memory.creating === RESOURCE_GHODIUM) cutOff = (NUKER_GHODIUM_CAPACITY * 5) + (SAFE_MODE_COST * 3);
                        if (_.includes(LAB_PRIORITY, outputLab.memory.creating)) cutOff = BOOST_AMOUNT * 3;
                        if (outputLab.room.store(outputLab.memory.creating, true) + outputLab.store[outputLab.memory.creating] > cutOff) {
                            log.a(outputLab.room.name + ' is no longer producing ' + outputLab.memory.creating + ' due to reaching the production cap.');
                            for (let id in hub) {
                                hub[id].memory = undefined;
                            }
                            return;
                        }
                        continue;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        for (let id in creators) {
                            let lab = Game.getObjectById(creators[id]);
                            let total = lab.room.store(lab.memory.itemNeeded, true) + lab.store[lab.memory.itemNeeded];
                            if (total < 10) {
                                log.a(outputLab.room.name + ' is no longer producing ' + lab.memory.creating + ' due to a shortage of ' + lab.memory.itemNeeded);
                                for (let id in hub) {
                                    hub[id].memory = undefined;
                                }
                                return;
                            }
                        }
                        continue;
                    case ERR_NOT_IN_RANGE:
                        log.a(outputLab.room.name + ' is no longer producing ' + outputLab.memory.creating + ' due to a range issue. Lab IDs ' + outputLab.id + ', ' + creators[0] + ', ' + creators[1]);
                        for (let id in hub) {
                            hub[id].memory = undefined;
                        }
                        return;
                }
            }
        }
    }
}

function checkForInputs(room, boost) {
    let components = BOOST_COMPONENTS[boost];
    if (!components || !components.length) return undefined;
    for (let input of shuffle(components)) {
        if (room.store(input, true) < 25) return false;
    }
    return boost;
}

function cleanLabs() {
    let boostLabs = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.neededBoost);
    for (let key in boostLabs) {
        let boostLab = boostLabs[key];
        if (boostLab.memory && (!boostLab.memory.requested || boostLab.memory.requested + 150 < Game.time || !Game.getObjectById(boostLab.memory.requestor))) {
            boostLab.memory = undefined;
        }
    }
    let reactionLabs = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.creating);
    for (let lab of reactionLabs) {
        let reactionHub = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_LAB && s.room.name === lab.room.name && s.memory.targetLab === lab.memory.targetLab);
        if (reactionHub.length < 3 || lab.pos.findInRange(reactionHub, 1).length < 3) {
            reactionHub.forEach(function (l) {
                l.memory = undefined;
            })
        }
    }
    let oldLabs = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.creating && !s.memory.targetLab);
    for (let lab of oldLabs) {
        lab.memory = undefined;
    }
}