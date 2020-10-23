/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

let wallCheck;
module.exports.role = function (creep) {
    creep.room.cacheRoomIntel();
    creep.say(_.sample(EXPLORER_SPAM), true);
    if (creep.room.hostileCreeps.length && creep.shibKite()) return creep.memory.destination = undefined;
    // Set destination
    if (!creep.memory.destination) {
        let portal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_PORTAL)[0];
        if (portal && !portal.destination.shard && !creep.memory.usedPortal && (creep.memory.other.portalJump || Math.random() > 0.5)) {
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
            // If there's unexplored prioritize else pick a random adjacent
            possibles = _.filter(adjacent, (r) => !Memory.roomCache[r]) || _.min(adjacent, (r) => Memory.roomCache[r].cached);
            if (possibles.length && Math.random() > 0.2) target = _.sample(possibles); else target = _.sample(adjacent);
            // Use try/catch for private servers that don't support this
            try {
                let [EW, NS] = target.match(/\d+/g);
                let isAlleyRoom = EW % 10 == 0 || NS % 10 == 0;
                if (!isAlleyRoom && Game.map.getRoomStatus(target).status !== Game.map.getRoomStatus(creep.memory.overlord).status) {
                    target = _.sample(adjacent);
                    if (Game.map.getRoomStatus(target).status !== Game.map.getRoomStatus(creep.memory.overlord).status) return creep.moveRandom();
                }
            } catch {
                target = _.sample(adjacent);
            }
            if (!creep.pos.findClosestByPath(Game.map.findExit(creep.room.name, target)) || creep.pos.findClosestByPath(Game.map.findExit(creep.room.name, target)).checkForImpassible()) {
                return creep.moveRandom();
            }
            creep.memory.destination = target;
        }
    }
    if (creep.memory.destinationReached !== true) {
        if (creep.pos.roomName === creep.memory.destination) {
            // Sign the controller
            if (creep.room.controller && (!creep.room.controller.owner || creep.room.controller.level < 3) && (!creep.room.controller.reservation || !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
                if (!creep.moveToHostileConstructionSites(false, true)) {
                    if (!SIGN_CLEANER) {
                        // If already signed continue
                        if (creep.room.controller.sign && creep.room.controller.sign.username === MY_USERNAME) return creep.memory.destinationReached = true;
                        // Else sign
                        switch (creep.signController(creep.room.controller, _.sample(EXPLORED_ROOM_SIGNS))) {
                            case ERR_NOT_IN_RANGE:
                                // If you cant reach the controller continue else move to it
                                if (!creep.room.controller.pos.countOpenTerrainAround() || Memory.roomCache[creep.room.name].obstructions) return creep.memory.destinationReached = true;
                                creep.shibMove(creep.room.controller);
                        }
                    } else {
                        // If already cleaned continue
                        if (!creep.room.controller.sign || creep.room.controller.sign.username === MY_USERNAME) return creep.memory.destinationReached = true;
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
