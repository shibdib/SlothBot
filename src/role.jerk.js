/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.room.cacheRoomIntel();
    if (creep.memory.operation === 'poke') return creep.pokeRoom();
    let sentence = ['Just', 'Here', 'Annoying', 'You'];
    let word = Game.time % sentence.length;
    creep.say(sentence[word], true);
    if (!creep.memory.destination) {
        let adjacent = Game.map.describeExits(creep.pos.roomName);
        let target = _.sample(adjacent);
        if (!Game.map.isRoomAvailable(target)) return creep.say("??");
        creep.memory.destination = target;
    }
    if (creep.memory.destinationReached !== true) {
        urgentMilitary(creep)
        if (creep.pos.roomName === creep.memory.destination) {
            if (!creep.handleMilitaryCreep(false, false, false, true)) {
                if (creep.room.controller && (!creep.room.controller.sign || creep.room.controller.sign.username !== USERNAME) &&
                    (!creep.room.controller.owner || !_.includes(FRIENDLIES, creep.room.controller.owner.username)) &&
                    (!creep.room.controller.reservation || !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
                    let signs = ["#Overlord-Bot was here.", "#Overlord-Bot has collected intel from this room. We Know."];
                    switch (creep.signController(creep.room.controller, _.sample(signs))) {
                        case OK:
                            creep.memory.destinationReached = true;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(creep.room.controller);
                    }
                } else {
                    creep.memory.destinationReached = true;
                }
            }
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {
                allowHostile: true,
                range: 23
            });
        }
    } else {
        creep.memory.destination = undefined;
        creep.memory.destinationReached = undefined;
    }
}

module.exports.role = profiler.registerFN(role, 'explorerRole');

function urgentMilitary(creep) {
    let sendScout;
    let range = creep.room.findClosestOwnedRoom(true);
    // Operation cooldown per room
    if (Memory.roomCache[creep.room.name] && !Memory.roomCache[creep.room.name].manual && Memory.roomCache[creep.room.name].lastOperation && Memory.roomCache[creep.room.name].lastOperation + ATTACK_COOLDOWN > Game.time) {
        return
    }
    // Already a target or too far
    if (Memory.targetRooms[creep.room.name] || range > 10) return;
    let otherCreeps = _.filter(creep.room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper' && c.body.length > 1);
    let lootStructures = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.structureType === STRUCTURE_TERMINAL && s.structureType === STRUCTURE_STORAGE && _.sum(s.store) > 0);
    if (creep.room.controller) {
        // If neutral/hostile owned room
        if (creep.room.controller.owner && !_.includes(FRIENDLIES, creep.room.controller.owner.username) && (creep.room.controller.level < 3 || !_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TOWER).length)) {
            sendScout = true;
        }
        // If unowned but lootable
        if (!creep.room.controller.owner && lootStructures.length) {
            sendScout = true;
        }
    }
    // If other creeps and nearby
    if (otherCreeps.length && range <= LOCAL_SPHERE + 2) {
        sendScout = true;
    }
    if (sendScout) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[creep.room.name] = {
            tick: tick,
            type: 'scout',
        };
        Memory.targetRooms = cache;
    }
}
