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
    creep.room.cacheRoomIntel();
    let sayings = EXPLORER_SPAM;
    creep.say(_.sample(sayings), true);
    let sectorScout = creep.memory.other.sectorScout;
    if (!creep.memory.destination) {
        let portal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_PORTAL)[0];
        if (!sectorScout && portal && !portal.destination.shard && !creep.memory.usedPortal && (creep.memory.other.portalJump || Math.random() > 0.5)) {
            if (!creep.memory.other.portalJump) {
                creep.memory.other.portalJump = portal.destination.roomName;
                log.a(creep.name + ' has found a portal in ' + roomLink(creep.room.name) + ' and is taking it.')
            } else if (creep.memory.other.portalJump === creep.room.name) {
                return creep.memory.usedPortal = true;
            }
            return creep.moveTo(portal);
        } else {
            let adjacent = Game.map.describeExits(creep.pos.roomName);
            let possibles, target;
            possibles = _.filter(adjacent, (r) => !Memory.roomCache[r] || (Memory.roomCache[r].cached + 3000 < Game.time && (!sectorScout || !Memory.roomCache[r].isHighway)));
            if (possibles.length) {
                target = _.sample(possibles);
            }
            if (!possibles.length || (target && Game.map.getRoomStatus(target) !== 'normal')) {
                target = _.sample(adjacent);
            }
            //if (Game.map.getRoomStatus(target) !== 'normal') return creep.say("??");
            creep.memory.destination = target;
        }
    }
    if (creep.memory.destinationReached !== true) {
        if (creep.pos.roomName === creep.memory.destination) {
            if (creep.room.controller && (!creep.room.controller.owner || creep.room.controller.level < 3) && (!creep.room.controller.reservation || !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
                try {
                    if (creep.room.controller.sign && creep.room.controller.sign.username === MY_USERNAME) {
                        return creep.memory.destinationReached = true;
                    }
                } catch (e) {

                }
                let signs = EXPLORED_ROOM_SIGNS;
                switch (creep.signController(creep.room.controller, _.sample(signs))) {
                    case OK:
                        creep.memory.destinationReached = true;
                        break;
                    case ERR_NOT_IN_RANGE:
                        if (!creep.shibMove(creep.room.controller, {offRoad: true})) creep.memory.destinationReached = true;
                }
            } else if (!creep.moveToHostileConstructionSites(true)) {
                creep.memory.destinationReached = true;
            }
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {
                offRoad: true
            });
        }
    } else {
        creep.memory.destination = undefined;
        creep.memory.destinationReached = undefined;
        creep.memory.cached = undefined;
    }
};