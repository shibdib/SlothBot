/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.role = function (creep) {
    Game.map.visual.text('TEST', creep.pos, {color: '#FF0000', fontSize: 5});
    if (creep.renewalCheck()) return;
    if (!creep.memory.destination) return;
    // Set Squad
    creep.memory.other.squadmates = [];
    let potentialSquad = _.filter(Game.creeps, (c) => c.memory.role === creep.memory.role && c.memory.destination === creep.memory.destination && c.id !== creep.id);
    if (potentialSquad.length) {
        creep.memory.other.squadmates = _.union(_.pluck(potentialSquad, 'id'), [creep.id]);
        potentialSquad.forEach((c) => c.memory.other.squadmates = _.union(_.pluck(potentialSquad, 'id'), [creep.id]))
    }
    if (!creep.memory.other.squadmates || !creep.memory.other.squadmates.length) return;
    let leader = Game.getObjectById(_.min(creep.memory.other.squadmates, function (c) {
        if (Game.getObjectById(c)) {
            return Game.getObjectById(c).ticksToLive;
        }
    }))
    if (leader.id !== creep.id) {
        let range = creep.pos.getRangeTo(leader);
        if (range > 1 || range === Infinity) creep.shibMove(leader);
    } else {
        // If quadmates are there
        let allInRange = _.filter(creep.room.lookForAtArea(LOOK_CREEPS, creep.pos.y - 1, creep.pos.x - 1, creep.pos.y + 1, creep.pos.x + 1, true), (c) => creep.memory.other.squadmates.includes(c.creep.id)).length === 4;
        if (allInRange >= 4) {

        } else {
            creep.goToHub();
        }
    }
    // Roles
    /**
     if (leader.id !== creep.id) {
        creep.say('F')
        if (creep.room.name !== leader.room.name) return creep.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 22});
    } else {
        creep.say('L')
        if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
        let leftPos, topLeftPos, topPos;
        let left = Game.getObjectById(creep.memory.other.left) || Game.getObjectById(_.sample(_.filter(creep.memory.other.squadmates, (c) => Game.getObjectById(c) && c !== creep.id && (!Game.getObjectById(c).memory.other.posSet || Game.getObjectById(c).memory.other.posSet === 'left'))));
        if (left) {
            left.memory.other.posSet = 'left';
            creep.memory.other.left = left.id;
            leftPos = creep.pos.positionAtDirection(LEFT);
            if (left.pos.getRangeTo(leftPos) || left.room.name !== leftPos.roomName) left.shibMove(leftPos, {range: 0}); else leftPos = undefined;
        }
        let topLeft = Game.getObjectById(creep.memory.other.topLeft) || Game.getObjectById(_.sample(_.filter(creep.memory.other.squadmates, (c) => Game.getObjectById(c) && c !== creep.id && (!Game.getObjectById(c).memory.other.posSet || Game.getObjectById(c).memory.other.posSet === 'topLeft'))));
        if (topLeft) {
            topLeft.memory.other.posSet = 'topLeft';
            creep.memory.other.topLeft = topLeft.id;
            topLeftPos = creep.pos.positionAtDirection(TOP_LEFT);
            if (topLeft.pos.getRangeTo(topLeftPos) || topLeft.room.name !== topLeftPos.roomName) topLeft.shibMove(topLeftPos, {range: 0}); else topLeftPos = undefined;
        }
        let top = Game.getObjectById(creep.memory.other.top) || Game.getObjectById(_.sample(_.filter(creep.memory.other.squadmates, (c) => Game.getObjectById(c) && c !== creep.id && (!Game.getObjectById(c).memory.other.posSet || Game.getObjectById(c).memory.other.posSet === 'top'))));
        if (top) {
            top.memory.other.posSet = 'top';
            creep.memory.other.top = top.id;
            topPos = creep.pos.positionAtDirection(TOP);
            if (top.pos.getRangeTo(topPos) || top.room.name !== topPos.roomName) top.shibMove(topPos, {range: 0}); else topPos = undefined;
        }
        if (!leftPos && !topLeftPos && !topPos) {
            if (!creep.memory.getPath || !creep.memory.getPath.length) creep.shibMove(new RoomPosition(11, 38, creep.memory.destination), {getPath: true})
            let nextDirection = parseInt(creep.memory.getPath[0], 10);
            creep.memory.getPath = creep.memory.getPath.slice(1);
            for (let squadMate of creep.memory.other.squadmates) {
                squadMate = Game.getObjectById(squadMate);
                squadMate.move(nextDirection)
            }
            creep.memory.nextDirection = undefined;
        }
    }**/
};
