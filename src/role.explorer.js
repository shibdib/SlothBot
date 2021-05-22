/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.say(ICONS.eye, true);
    Game.map.visual.text(ICONS.eye, creep.pos, {color: '#FF0000', fontSize: 2});
    // Set destination
    if (!creep.memory.destination) {
        let portal = Game.getObjectById(creep.memory.portal) || creep.pos.findClosestByRange(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_PORTAL));
        if (portal && (!Game.cpu.shardLimits || Game.cpu.shardLimits[portal.destination.shard] > 0) && !creep.memory.usedPortal && (creep.memory.other.portalJump || Math.random() > 0.5 || creep.memory.other.portalForce)) {
            if (!creep.memory.other.portalJump) {
                let roomName;
                if (portal.destination.shard) roomName = portal.destination.room.name; else roomName = portal.destination.roomName;
                creep.memory.other.portalJump = roomName;
                if (!creep.memory.portal) log.a(creep.name + ' has found a portal in ' + roomLink(creep.room.name) + ' and is taking it.')
                creep.memory.portal = portal.id;
            } else if (creep.memory.other.portalJump === creep.room.name) {
                return creep.memory.usedPortal = true;
            }
            return creep.moveTo(portal);
        } else {
            let adjacent = _.filter(_.map(Game.map.describeExits(creep.pos.roomName)), (r) => Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(creep.memory.overlord).status);
            // If there's unexplored prioritize else pick the oldest intel
            let target = _.filter(adjacent, (r) => !Memory.roomCache[r])[0] || _.min(adjacent, (r) => Memory.roomCache[r].cached);
            if (target) creep.memory.destination = target; else creep.idleFor(25);
        }
    } else if (creep.pos.roomName === creep.memory.destination) {
        creep.memory.destination = undefined;
        /**
         // Sign the controller
         if (creep.room.controller && (!creep.room.controller.owner || creep.room.controller.level < 3) && (!creep.room.controller.reservation || !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
            if (!creep.moveToHostileConstructionSites(false, true)) {
                if (!SIGN_CLEANER) {
                    // If already signed continue
                    if (creep.room.controller.sign && (creep.room.controller.sign.username === MY_USERNAME || creep.room.controller.sign.username === 'Screeps')) return creep.memory.destinationReached = true;
                    // Else sign
                    switch (creep.signController(creep.room.controller, _.sample(EXPLORED_ROOM_SIGNS))) {
                        case ERR_NOT_IN_RANGE:
                            // If you cant reach the controller continue else move to it
                            if (!creep.room.controller.pos.countOpenTerrainAround() || Memory.roomCache[creep.room.name].obstructions) return creep.memory.destinationReached = true;
                            creep.shibMove(creep.room.controller);
                    }
                } else {
                    // If already cleaned continue
                    if (!creep.room.controller.sign || creep.room.controller.sign.username === MY_USERNAME || creep.room.controller.sign.username === 'Screeps') return creep.memory.destinationReached = true;
                    // Else clean signs
                    switch (creep.signController(creep.room.controller, '')) {
                        case ERR_NOT_IN_RANGE:
                            // If you cant reach the controller continue else move to it
                            if (!creep.room.controller.pos.countOpenTerrainAround() || Memory.roomCache[creep.room.name].obstructions) return creep.memory.destinationReached = true;
                            creep.shibMove(creep.room.controller);
                    }
                }
            }
        } else if (!creep.moveToHostileConstructionSites(false, true)) {
            creep.memory.destination = undefined;
        }**/
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    }
};