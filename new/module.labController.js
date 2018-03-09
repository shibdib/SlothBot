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
    let activeLabs = _.filter(Memory.structures, (s) => s.active);
    if (activeLabs[0]) {
        for (let key in activeLabs) {
            let hub = _.filter(Memory.structures, (s) => s.creating === activeLabs[key].creating);
            let creators = _.pluck(_.filter(hub, (l) => l.itemNeeded), 'id');
            let output = _.pluck(_.filter(hub, (l) => !l.itemNeeded), 'id');
            let creatorOne = Game.getObjectById(creators[0]);
            let creatorTwo = Game.getObjectById(creators[1]);
            let outputLab = Game.getObjectById(output[0]);
            if (!outputLab.cooldown) outputLab.runReaction(creatorOne, creatorTwo);
        }
    }
    for (let key in MAKE_THESE_BOOSTS) {
        let boost = MAKE_THESE_BOOSTS[key];
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
                    let out = _.filter(hub, (h) => h.memory.itemNeeded === boost)[0];
                    if (!one) {
                        Memory.structures[hub[labID].id] = {
                            itemNeeded: componentOne,
                            creating: boost,
                            room: hub[labID].pos.roomName,
                            id: hub[labID].id,
                            active: true
                        };
                    } else if (!two) {
                        Memory.structures[hub[labID].id] = {
                            itemNeeded: componentTwo,
                            creating: boost,
                            room: hub[labID].pos.roomName,
                            id: hub[labID].id,
                            active: true
                        };
                    } else if (!out) {
                        Memory.structures[hub[labID].id] = {
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