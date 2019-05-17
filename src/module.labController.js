/**
 * Created by Bob on 6/24/2017.
 */

module.exports.labManager = function () {
    for (let key in shuffle(Memory.ownedRooms)) {
        if (Memory.ownedRooms[key].controller.level < 6) continue;
        let room = Memory.ownedRooms[key];
        room.memory.reactionRoom = true;
        let lab = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB)[0];
        if (lab && room.terminal && Math.random() >= 0.5) cleanLabs(room);
        if (lab && room.terminal && room.memory.reactionRoom && Game.time % 10 === 0) manageBoostProduction(room);
        if (lab && room.terminal && room.memory.reactionRoom && Game.time % 2 === 0) manageActiveLabs(room);
    }
};

function manageBoostProduction(room) {
    let hub;
    let availableLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && !s.memory.active);
    for (let lab of availableLabs) {
        hub = lab.pos.findInRange(room.structures, 1, {filter: (s) => s.structureType === STRUCTURE_LAB && !s.memory.active});
        if (hub.length >= 3) break;
    }
    if (!hub || !hub.length || hub.length < 3) return;
    let boost;
    let boostList = _.union(MAKE_THESE_BOOSTS, TIER_2_BOOSTS, TIER_1_BOOSTS, BASE_COMPOUNDS);
    for (let key in boostList) {
        // Only one hub per output
        if (_.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.creating === boostList[key]).length) continue;
        // Check for inputs
        if (!checkForInputs(room, boostList[key])) continue;
        // Check if we already have enough
        if (room.getBoostAmount(boostList[key]) >= BOOST_AMOUNT * 2) continue;
        boost = boostList[key];
        break;
    }
    if (!boost) return;
    let componentOne = BOOST_COMPONENTS[boost][0];
    let componentTwo = BOOST_COMPONENTS[boost][1];
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
        } else if (one && two) {
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
    let activeLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && !s.cooldown && s.memory.active && s.memory.creating && !s.memory.itemNeeded);
    if (activeLabs.length) {
        active:
            for (let key in activeLabs) {
                let hub = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.creating === activeLabs[key].memory.creating && s.memory.active && s.pos.roomName === activeLabs[key].pos.roomName);
                let outputLab = Game.getObjectById(_.pluck(_.filter(hub, (l) => !l.memory.itemNeeded), 'id')[0]);
                if (!outputLab) {
                    for (let id in hub) {
                        hub[id].memory = undefined;
                    }
                    continue;
                }
                if (outputLab.memory.creating) {
                    for (let lab of hub) {
                        if (lab.memory.itemNeeded) lab.lineTo(outputLab);
                    }
                    outputLab.say(outputLab.memory.creating);
                }
                let creators = _.pluck(_.filter(hub, (l) => l.memory.itemNeeded), 'id');
                let creatorOne = Game.getObjectById(creators[0]);
                let creatorTwo = Game.getObjectById(creators[1]);
                //If any dont exist reset
                if (!outputLab || !creatorOne || !creatorTwo) {
                    log.a(outputLab.room.name + ' is no longer producing ' + outputLab.memory.creating + ' due to a lab error (2).');
                    for (let id in creators) {
                        creators[id].memory = undefined;
                    }
                    outputLab.memory = undefined;
                    continue
                }
                //Clean bad boosting
                if (outputLab.memory.neededBoost && outputLab.memory.neededBoost !== outputLab.memory.creating) outputLab.memory.neededBoost = undefined;
                if (creatorOne.memory.neededBoost && creatorOne.memory.neededBoost !== creatorOne.memory.itemNeeded) creatorOne.memory.neededBoost = undefined;
                if (creatorTwo.memory.neededBoost && creatorTwo.memory.neededBoost !== creatorTwo.memory.itemNeeded) creatorTwo.memory.neededBoost = undefined;
                if (outputLab.memory.creating) {
                    switch (outputLab.runReaction(Game.getObjectById(creators[0]), Game.getObjectById(creators[1]))) {
                        case OK:
                            // Enough created
                            let total = outputLab.room.getBoostAmount(outputLab.memory.creating);
                            if (((!_.includes(TIER_2_BOOSTS, outputLab.memory.creating) || !_.includes(END_GAME_BOOSTS, outputLab.memory.creating)) && total >= BOOST_AMOUNT * 2.25) ||
                                ((_.includes(TIER_2_BOOSTS, outputLab.memory.creating) || _.includes(END_GAME_BOOSTS, outputLab.memory.creating)) && total >= BOOST_AMOUNT * 6)) {
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
                                let total = lab.room.getBoostAmount(lab.memory.itemNeeded);
                                if (total < 10) {
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
                            log.a(outputLab.room.name + ' is no longer producing ' + outputLab.memory.creating + ' due to a range issue. Lab IDs ' + outputLab.id + ', ' + creators[0] + ', ' + creators[1]);
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
        if (storageAmount + terminalAmount < 150) return false;
    }
    return boost;
}

function cleanLabs(room) {
    let boostLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.neededBoost);
    for (let key in boostLabs) {
        let boostLab = boostLabs[key];
        if (boostLab.memory && (!boostLab.memory.requested || boostLab.memory.requested + 150 < Game.time)) {
            boostLab.memory.neededBoost = undefined;
        }
    }
    let reactionLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.creating);
    for (let key in reactionLabs) {
        let reactionLab = reactionLabs[key];
        let reactionHub = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active && s.memory.creating === reactionLab.memory.creating);
        if (reactionHub.length < 3 || reactionLab.pos.findInRange(reactionHub, 2).length < 3) {
            reactionLab.memory = undefined;
        }
    }
}