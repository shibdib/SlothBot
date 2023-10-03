// Helper functions to call from the console or codebase.
let helpers = function () {
    // Abandon a room
    global.abandonRoom = function (room) {
        if (!room) return log.e(room.name + ' does not appear to be owned by you.');
        _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room.name).forEach((c) => c.suicide());
        if (room.impassibleStructures && room.impassibleStructures.length) {
            for (let structure of room.impassibleStructures) {
                structure.destroy();
            }
        }
        if (room.constructionSites && room.constructionSites.length) {
            for (let site of room.constructionSites) {
                site.remove();
            }
        }
        delete room.memory;
        Memory.targetRooms[room.name] = undefined;
        Memory.auxiliaryTargets[room.name] = undefined;
        room.cacheRoomIntel(true);
        INTEL[room.name].noClaim = Game.time + 10000;
        if (INTEL[room.name].failedClaim) INTEL[room.name].failedClaim++;
        else INTEL[room.name].failedClaim = 1;
        room.controller.unclaim();
    };

    // Get nukes in range
    global.nukes = function (target) {
        let nukes = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && !s.store.getFreeCapacity(RESOURCE_ENERGY) && !s.store.getFreeCapacity(RESOURCE_GHODIUM) && !s.cooldown);
        if (target) nukes = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && !s.store.getFreeCapacity(RESOURCE_ENERGY) && !s.store.getFreeCapacity(RESOURCE_GHODIUM) && !s.cooldown && Game.map.getRoomLinearDistance(s.room.name, target) <= 10);
        if (!nukes.length && !target) return log.a('No nukes available');
        if (!nukes.length && target) return log.a('No nukes available in range of ' + target);
        for (let key in nukes) {
            if (target) log.a(nukes[key].room.name + ' has a nuclear missile available that is in range of ' + target);
            if (!target) log.a(nukes[key].room.name + ' has a nuclear missile available.')
        }
    };

    // Clear Console
    global.clear = function () {
        console.log(
            "<script>angular.element(document.getElementsByClassName('fa fa-trash ng-scope')[0].parentNode).scope().Console.clear()</script>"
        );
    };

    // Check if rooms share a sector
    global.sameSectorCheck = function (roomA, roomB) {
        let [EW, NS] = roomA.match(/\d+/g);
        let roomAEWInt = EW.toString()[0];
        let roomANSInt = NS.toString()[0];
        let [EW2, NS2] = roomB.match(/\d+/g);
        let roomBEWInt = EW2.toString()[0];
        let roomBNSInt = NS2.toString()[0];
        return roomAEWInt === roomBEWInt && roomANSInt === roomBNSInt;
    };

    // Get the total amount of a resource you have
    global.getResourceTotal = function (resource) {
        let amount = 0;
        for (let roomName of MY_ROOMS) {
            let room = Game.rooms[roomName];
            amount += room.store(resource);
        }
        return amount;
    }

    // Get the total uptime for the current global
    global.getUptime = function () {
        let uptime = (Game.time - (Memory.lastGlobalReset || Game.time));
        log.a('Current global uptime: ' + uptime + ' ticks', ' ');
    }

    // Get room intel
    global.intel = function (roomName) {
        if (!INTEL[roomName]) return log.e('No intel for ' + roomName);
        log.a('--INTEL FOR ' + roomName + '--', ' ');
        for (let key in INTEL[roomName]) {
            log.e(key + ': ' + INTEL[roomName][key], ' ');
        }
    }

    // Returns the max known level for a user from the INTEL cache
    global.userStrength = function (user) {
        return _.max(_.filter(INTEL, (r) => r.owner === user), 'level').level || 0;
    }

    // Return the closest owned room or the range to it
    let closestCache = {};
    global.findClosestOwnedRoom = function (roomName, range = false, minLevel = 1) {
        // Check if you own the room
        if (MY_ROOMS.includes(roomName) && minLevel <= Game.rooms[roomName].controller.level) {
            closestCache[roomName] = {};
            closestCache[roomName].closest = roomName;
            closestCache[roomName].distance = 0;
            if (range) return 0; else return roomName;
        }
        if (!closestCache.length || !closestCache[roomName] || closestCache[roomName].ownedCount !== MY_ROOMS.length) {
            closestCache[roomName] = {};
            closestCache[roomName].ownedCount = MY_ROOMS.length;
            let distance = 99;
            let closest;
            for (let key of MY_ROOMS) {
                let myRoom = Game.rooms[key];
                if (!myRoom || myRoom.controller.level < minLevel) continue;
                // Handle absurd distances
                let path = Game.map.findRoute(key, roomName).length;
                if (path >= (CREEP_LIFE_TIME / 50)) {
                    let currentRoom = roomName;
                    let closestPortal = _.sortBy(_.filter(INTEL, (r) => r.portal), function (f) {
                        Game.map.getRoomLinearDistance(f.name, currentRoom)
                    });
                    let closest = closestPortal.length - 1;
                    if (closestPortal[closest]) {
                        let portalDestination = JSON.parse(INTEL[closestPortal[closest].name].portal)[0].destination.roomName || JSON.parse(INTEL[closestPortal[closest].name].portal)[0].destination.room;
                        if (INTEL[portalDestination]) path = Game.map.getRoomLinearDistance(closestPortal[closest].name, currentRoom) + findClosestOwnedRoom(portalDestination, true);
                    }
                }
                if (!path) continue;
                if (!distance) {
                    distance = path;
                    closest = myRoom.name;
                } else if (path < distance) {
                    distance = path;
                    closest = myRoom.name;
                }
            }
            if (!closest) closest = _.sample(Game.spawns).room.name;
            if (!distance && closest) distance = Game.map.getRoomLinearDistance(roomName, closest);
            closestCache[roomName].closest = closest;
            closestCache[roomName].distance = distance;
            if (!range) return closest;
            return distance;
        } else {
            if (!range) return closestCache[roomName].closest;
            return closestCache[roomName].distance;
        }
    };

    // Find the different between 2 numbers
    global.difference = function (num1, num2) {
        return (num1 > num2) ? num1 - num2 : num2 - num1
    }

    // Store room status for 10k ticks
    global.roomStatus = function (roomName) {
        if (!CACHE.ROOM_STATUS || CACHE.ROOM_STATUS.tick + 10000 < Game.time) {
            CACHE.ROOM_STATUS = {};
            CACHE.ROOM_STATUS.tick = Game.time;
        }
        if (CACHE.ROOM_STATUS[roomName]) return CACHE.ROOM_STATUS[roomName];
        else CACHE.ROOM_STATUS[roomName] = Game.map.getRoomStatus(roomName).status;
        return CACHE.ROOM_STATUS[roomName];
    }
}

module.exports = helpers;