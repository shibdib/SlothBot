/**
 * Created by Bob on 6/24/2017.
 */

const profiler = require('screeps-profiler');
let _ = require('lodash');

function labManager() {
    for (let key in shuffle(Memory.ownedRooms)) {
        if (Memory.ownedRooms[key].controller.level < 6) continue;
        let room = Memory.ownedRooms[key];
        let reactionRooms = _.filter(Memory.ownedRooms, (r) => r.memory.reactionRoom);
        if (!reactionRooms[0]) room.memory.reactionRoom = true;
        if (!room.memory.reactionRoom) {
            room.memory.reactionRoom = true;
            log.a(room.name + ' is now a reaction room.');
        }
        let terminal = room.terminal;
        let lab = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB)[0];
        if (lab && terminal && room.memory.reactionRoom && Game.time % 25 === 0) manageBoostProduction(room);
        if (lab && terminal && room.memory.reactionRoom && Game.time % 3 === 0) manageActiveLabs(room);
        if (lab && terminal && Game.time % 50 === 0) cleanBoostLabs(room);
    }
}

module.exports.labManager = profiler.registerFN(labManager, 'labManager');

function manageBoostProduction(room) {
    let availableLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && !s.memory.active && s.pos.findInRange(room.structures, 2, {filter: (l) => l.structureType === STRUCTURE_LAB && !l.memory.active}).length >= 2);
    if (!availableLabs.length) return;
    availableLabs = availableLabs[0];
    let storage = room.storage;
    let terminal = room.terminal;
    let boost;
    for (let key in MAKE_THESE_BOOSTS) {
        boost = checkForInputs(room, MAKE_THESE_BOOSTS[key]);
        if (!boost) continue;
        let alreadyCreating = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.creating === boost);
        let outputLab = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === boost);
        let fresh = 0;
        if (outputLab[0]) fresh = outputLab[0].mineralAmount;
        let terminalAmount = terminal.store[boost] || 0;
        let storageAmount = storage.store[boost] || 0;
        if (alreadyCreating.length || terminalAmount + storageAmount + fresh >= BOOST_AMOUNT) {
            boost = undefined;
        } else {
            break;
        }
    }
    if (!boost) {
        for (let key in END_GAME_BOOSTS) {
            boost = checkForInputs(room, END_GAME_BOOSTS[key]);
            if (!boost) continue;
            let alreadyCreating = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.creating === boost);
            let outputLab = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === boost);
            let fresh = 0;
            if (outputLab[0]) fresh = outputLab[0].mineralAmount;
            let terminalAmount = terminal.store[boost] || 0;
            let storageAmount = storage.store[boost] || 0;
            if (alreadyCreating.length || terminalAmount + storageAmount + fresh >= BOOST_AMOUNT) {
                boost = undefined;
            } else {
                break;
            }
        }
    }
    if (!boost) return;
    let componentOne = BOOST_COMPONENTS[boost][0];
    let componentTwo = BOOST_COMPONENTS[boost][1];
    let hub = availableLabs.pos.findInRange(room.structures, 2, {filter: (s) => s.structureType === STRUCTURE_LAB && !s.memory.active});
    for (let labID in hub) {
        let one = _.filter(hub, (h) => h.memory.itemNeeded === componentOne)[0];
        let two = _.filter(hub, (h) => h.memory.itemNeeded === componentTwo)[0];
        if (!one) {
            hub[labID].memory = {
                itemNeeded: componentOne,
                creating: boost,
                room: hub[labID].pos.roomName,
                id: hub[labID].id,
                active: true
            };
        } else if (!two) {
            hub[labID].memory = {
                itemNeeded: componentTwo,
                creating: boost,
                room: hub[labID].pos.roomName,
                id: hub[labID].id,
                active: true
            };
        } else {
            hub[labID].memory = {
                creating: boost,
                room: hub[labID].pos.roomName,
                id: hub[labID].id,
                active: true
            };
            log.a(room.name + ' queued ' + boost + ' for creation.');
            break;
        }
    }
}

function manageActiveLabs(room) {
    let activeLabs = _.filter(room.structures, (s) => s.room.memory.reactionRoom && s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.creating);
    if (activeLabs.length) {
        active:
            for (let key in activeLabs) {
                let hub = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.creating === activeLabs[key].memory.creating && s.memory.active && s.pos.roomName === activeLabs[key].pos.roomName);
                let creators = _.pluck(_.filter(hub, (l) => l.memory.itemNeeded), 'id');
                let outputLab = Game.getObjectById(_.pluck(_.filter(hub, (l) => !l.memory.itemNeeded), 'id')[0]);
                if (!outputLab) {
                    for (let id in hub) {
                        hub[id].memory = undefined;
                    }
                    continue;
                }
                if (outputLab.memory.creating) {
                    for (let lab of hub) {
                        lab.room.visual.text(
                            lab.memory.creating,
                            lab.pos.x,
                            lab.pos.y,
                            {opacity: 0.8, font: 0.3}
                        );
                    }
                }
                //If on cooldown continue
                if (outputLab.cooldown) continue;
                let creatorOne = Game.getObjectById(creators[0]);
                let creatorTwo = Game.getObjectById(creators[1]);
                //If any dont exist reset
                if (!outputLab || !creatorOne || !creatorTwo) {
                    for (let id in creators) {
                        creators[id].memory = undefined;
                    }
                    outputLab.memory = undefined;
                    continue
                }
                //Clean bad boosting
                if (outputLab.memory.neededBoost && outputLab.memory.neededBoost !== outputLab.memory.creating) delete outputLab.memory.neededBoost;
                if (creatorOne.memory.neededBoost && creatorOne.memory.neededBoost !== creatorOne.memory.itemNeeded) delete creatorOne.memory.neededBoost;
                if (creatorTwo.memory.neededBoost && creatorTwo.memory.neededBoost !== creatorTwo.memory.itemNeeded) delete creatorTwo.memory.neededBoost;
                if (outputLab.memory.creating) {
                    switch (outputLab.runReaction(Game.getObjectById(creators[0]), Game.getObjectById(creators[1]))) {
                        case OK:
                            // Enough created
                            let total = getBoostAmount(outputLab.room, outputLab.memory.creating);
                            if ((!_.includes(TIER_2_BOOSTS, outputLab.memory.creating) || !_.includes(END_GAME_BOOSTS, outputLab.memory.creating)) && total >= BOOST_AMOUNT * 2.5) {
                                log.a(outputLab.room.name + ' is no longer producing ' + outputLab.memory.creating + ' due to reaching the production cap.');
                                for (let id in creators) {
                                    creators[id].memory = undefined;
                                }
                                outputLab.memory = undefined;
                                continue;
                            }
                            continue;
                        case ERR_NOT_ENOUGH_RESOURCES:
                            for (let id in creators) {
                                let lab = Game.getObjectById(creators[id]);
                                let total = getBoostAmount(lab.room, lab.memory.itemNeeded);
                                if (total < 150) {
                                    log.a(outputLab.room.name + ' is no longer producing ' + lab.memory.creating + ' due to a shortage of ' + lab.memory.itemNeeded);
                                    for (let id in creators) {
                                        creators[id].memory = undefined;
                                    }
                                    outputLab.memory = undefined;
                                    continue active;
                                }
                            }
                            continue;
                        case ERR_NOT_IN_RANGE:
                            log.a(outputLab.room.name + ' is no longer producing ' + outputLab.memory.creating + ' due to a range issue.');
                            for (let id in creators) {
                                creators[id].memory = undefined;
                            }
                            outputLab.memory = undefined;
                    }
                }
            }
    }
}

function checkForInputs(room, boost) {
    let storage = room.storage;
    let terminal = room.terminal;
    let components = BOOST_COMPONENTS[boost];
    if (!components || !components.length) return undefined;
    for (let input of shuffle(components)) {
        let storageAmount = storage.store[input] || 0;
        let terminalAmount = terminal.store[input] || 0;
        if (storageAmount + terminalAmount < 500) return checkForInputs(room, input);
    }
    return boost;
}

function getBoostAmount(room, boost) {
    let boostInRoomStructures = _.sum(room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
        if (s['structure'] && s['structure'].store) {
            return s['structure'].store[boost] || 0;
        } else if (s['structure'] && s['structure'].mineralType === boost) {
            return s['structure'].mineralAmount || 0;
        } else {
            return 0;
        }
    });
    let boostInRoomCreeps = _.sum(room.lookForAtArea(LOOK_CREEPS, 0, 0, 49, 49, true), (s) => {
        if (s['creep'] && s['creep'].carry) {
            return s['creep'].carry[boost] || 0;
        } else {
            return 0;
        }
    });
    return boostInRoomCreeps + boostInRoomStructures;
}

function cleanBoostLabs(room) {
    let boostLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.neededBoost);
    for (let key in boostLabs) {
        let boostLab = boostLabs[key];
        if (boostLab.memory && (!boostLab.memory.requested || boostLab.memory.requested + 150 < Game.time)) {
            boostLab.memory = undefined;
        }
    }
}