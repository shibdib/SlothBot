/**
 * Created by Bob on 6/24/2017.
 */

const profiler = require('screeps-profiler');
let _ = require('lodash');

function labManager() {
    for (let key in Memory.ownedRooms) {
        if (Memory.ownedRooms[key].controller.level < 6) continue;
        let room = Memory.ownedRooms[key];
        let reactionRoom = _.filter(Memory.ownedRooms, (r) => r.memory.reactionRoom)[0];
        if (!reactionRoom) room.memory.reactionRoom = true;
        if (room.memory.reactionRoom) manageReactions(room);
    }
}

module.exports.labManager = profiler.registerFN(labManager, 'labManager');

function manageReactions(room) {
    let storage = _.filter(room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    let terminal = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    let activeLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active);
    if (activeLabs[0]) {
        for (let key in activeLabs) {
            let hub = _.filter(activeLabs, (s) => s.memory.creating === activeLabs[key].memory.creating);
            let creators = _.pluck(_.filter(hub, (l) => l.memory.itemNeeded), 'id');
            let output = _.pluck(_.filter(hub, (l) => !l.memory.itemNeeded), 'id');
            let creatorOne = Game.getObjectById(creators[0]);
            let creatorTwo = Game.getObjectById(creators[1]);
            let outputLab = Game.getObjectById(output[0]);
            if (!outputLab.cooldown) outputLab.runReaction(creatorOne, creatorTwo);
            if ((((storage.store[outputLab.memory.creating] || 0) + (terminal.store[outputLab.memory.creating] || 0) + outputLab.mineralAmount) >= 2500) || creators.length < 2) {
                if (creatorOne) creatorOne.memory = undefined;
                if (creatorTwo) creatorTwo.memory = undefined;
                if (outputLab) outputLab.memory = undefined;
            }
            if (((storage.store[creatorOne.memory.itemNeeded] || 0) + (terminal.store[creatorOne.memory.itemNeeded] || 0) + creatorOne.itemNeeded) < 100) {
                if (creatorOne) creatorOne.memory = undefined;
                if (creatorTwo) creatorTwo.memory = undefined;
                if (outputLab) outputLab.memory = undefined;
            }
            if (((storage.store[creatorTwo.memory.itemNeeded] || 0) + (terminal.store[creatorTwo.memory.itemNeeded] || 0) + creatorTwo.itemNeeded) < 100) {
                if (creatorOne) creatorOne.memory = undefined;
                if (creatorTwo) creatorTwo.memory = undefined;
                if (outputLab) outputLab.memory = undefined;
            }
        }
    }
    if (Game.time % 25 === 0) {
        for (let key in MAKE_THESE_BOOSTS) {
            let boost = MAKE_THESE_BOOSTS[key];
            let outputLab = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === boost);
            let fresh = 0;
            if (outputLab[0]) fresh = outputLab[0].mineralAmount;
            if ((storage.store[boost] || 0) + (terminal.store[boost] || 0) + fresh >= 250) continue;
            let componentOne = BOOST_COMPONENTS[boost][0];
            let componentTwo = BOOST_COMPONENTS[boost][1];
            if (((storage.store[componentOne] || 0 + terminal.store[componentOne] || 0) > 500) && ((storage.store[componentTwo] || 0 + terminal.store[componentTwo] || 0) > 500)) {
                let availableLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && !s.memory.active && s.pos.findInRange(room.structures, 3, {filter: (l) => l.structureType === STRUCTURE_LAB && !l.memory.active}).length >= 2)[0];
                if (availableLabs) {
                    log.a(room.name + ' queued ' + boost + ' for creation.');
                    room.memory.activeReaction = boost;
                    let hub = availableLabs.pos.findInRange(room.structures, 3, {filter: (s) => s.structureType === STRUCTURE_LAB && !s.memory.active});
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
                        }
                    }
                }
            }
        }
    }
}