/**
 * Created by Bob on 6/24/2017.
 */

const profiler = require('screeps-profiler');
let _ = require('lodash');

function labManager() {
    for (let key in Memory.ownedRooms) {
        if (Memory.ownedRooms[key].controller.level < 6) return;
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
    for (let key in MAKE_THESE_BOOSTS) {
        let boost = MAKE_THESE_BOOSTS[key];
        let boostInProgress = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.creating === boost)[0];
        if (boostInProgress) continue;
        let componentOne = BOOST_COMPONENTS[boost][0];
        let componentTwo = BOOST_COMPONENTS[boost][1];
        if ((storage.store[componentOne] + terminal.store[componentOne] > 100) && (storage.store[componentTwo] + terminal.store[componentTwo] > 100)) {
            let availableLabs = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB && !s.memory.active && s.pos.findInRange(room.structures, 3, {filter: (s) => s.structureType === STRUCTURE_LAB && !s.memory.active}).length >= 2)[0];
            if (availableLabs) {
                let hub = availableLabs.pos.findInRange(room.structures, 3, {filter: (s) => s.structureType === STRUCTURE_LAB && !s.memory.active})
                for (let key in hub) {
                    let one = _.filter(hub, (h) => h.memory.itemNeeded === componentOne)[0];
                    let two = _.filter(hub, (h) => h.memory.itemNeeded === componentTwo)[0];
                    let out = _.filter(hub, (h) => h.memory.itemNeeded === boost)[0];
                    hub[key].active = true;
                    if (!one) {
                        hub[key].memory.itemNeeded = componentOne;
                        hub[key].memory.creating = boost;
                    } else if (!two) {
                        hub[key].memory.itemNeeded = componentTwo;
                        hub[key].memory.creating = boost;
                    } else if (!out) {
                        hub[key].memory.itemNeeded = 'out';
                        hub[key].memory.creating = boost;
                    }
                }
            }
        }
    }
}