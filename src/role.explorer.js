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
    Game.map.visual.text(ICONS.eye, creep.pos, {color: '#FF0000', fontSize: 4});
    // Set destination
    if (!creep.memory.destination) {
        let portal = Game.getObjectById(creep.memory.portal) || creep.pos.findClosestByRange(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_PORTAL && !s.destination.shard));
        if (!creep.memory.usedPortal && portal && (creep.memory.other.portalJump || Math.random() > 0.01)) {
            if (!creep.memory.other.portalJump) {
                let roomName;
                if (portal.destination.shard) roomName = portal.destination.room.name; else roomName = portal.destination.roomName;
                creep.memory.other.portalJump = roomName;
                if (!creep.memory.portal) log.a(creep.name + ' has found a portal in ' + roomLink(creep.room.name) + ' and is taking it.')
                creep.memory.portal = portal.id;
            } else if (creep.memory.other.portalJump === creep.room.name) {
                return creep.memory.usedPortal = true;
            }
            return creep.shibMove(portal, {range: 0});
        } else {
            let adjacent = _.filter(_.map(Game.map.describeExits(creep.pos.roomName)), (r) => roomStatus(r) === roomStatus(creep.memory.overlord) && !_.find(creep.room.myCreeps, (c) => c.memory.destination === r) && creep.pos.findClosestByPath(Game.map.findExit(creep.pos.roomName, r)));
            if (!adjacent.length) adjacent = _.filter(_.map(Game.map.describeExits(creep.pos.roomName)), (r) => creep.pos.findClosestByPath(Game.map.findExit(creep.pos.roomName, r)));
            // If there's unexplored prioritize else pick the oldest intel
            let target = _.sample(_.filter(adjacent, (r) => !INTEL[r])) || _.min(adjacent, (r) => INTEL[r].cached);
            if (target) creep.memory.destination = target; else creep.idleFor(25);
        }
    } else if (creep.pos.roomName === creep.memory.destination) {
        // Sign the controller
        if (!creep.moveToHostileConstructionSites(false, true)) {
            if (creep.room.controller && !creep.room.controller.owner && !INTEL[creep.room.name].obstructions) {
                if ((SIGN_CLEANER || !creep.room.controller.sign) && (!creep.room.controller.sign || (creep.room.controller.sign.username !== MY_USERNAME && creep.room.controller.sign.username !== 'Screeps'))) {
                    // Else sign it
                    switch (creep.signController(creep.room.controller, _.sample(EXPLORED_ROOM_SIGNS))) {
                        case OK:
                            creep.memory.destination = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(creep.room.controller);
                    }
                    return;
                }
            }
        }
        creep.memory.destination = undefined;
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    }
};