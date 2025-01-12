/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

// Helper functions to call from the console or codebase.
let helpers = function () {
    /**
     * Abandon a room
     * @param room
     */
    global.abandonRoom = function (room) {
        if (!room || !room.controller || room.controller.owner.username !== MY_USERNAME) {
            return log.e(room ? `${room.name} does not appear to be owned by you.` : 'Room does not exist.');
        }

        // Suicide all creeps associated with this room
        _.forEach(Game.creeps, (creep) => {
            if (creep.memory.overlord === room.name) creep.suicide();
        });

        // Remove impassible structures
        if (room.impassibleStructures.length) {
            room.impassibleStructures.forEach(structure => structure.destroy());
        }

        // Remove construction sites
        if (room.constructionSites.length) {
            room.constructionSites.forEach(site => site.remove());
        }

        // Cleanup memory and related targets
        cleanupMemory(room);

        // Reset room intel
        resetRoomIntel(room);

        // Unclaim the room controller
        room.controller.unclaim();

        function cleanupMemory(room) {
            // Only clear relevant memory if room is fully owned
            const roomName = room.name;
            delete room.memory;
            Memory.targetRooms[roomName] = undefined;
            Memory.auxiliaryTargets[roomName] = undefined;
        }

        function resetRoomIntel(room) {
            const roomName = room.name;
            if (!INTEL[roomName]) INTEL[roomName] = {};
            INTEL[roomName].noClaim = Game.time + 10000;
            INTEL[roomName].failedClaim = (INTEL[roomName].failedClaim || 0) + 1;
            room.cacheRoomIntel(true);  // Only cache intel if necessary
        }
    };


    /**
     * Get nukes in range
     * @param target
     */
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

    /**
     * Clear the console
     */
    global.clear = function () {
        console.log(
            "<script>angular.element(document.getElementsByClassName('fa fa-trash ng-scope')[0].parentNode).scope().Console.clear()</script>"
        );
    };

    /**
     * Check if rooms share a sector
     * @param roomA
     * @param roomB
     * @returns {boolean}
     */
    global.sameSectorCheck = function (roomA, roomB) {
        let [EW, NS] = roomA.match(/\d+/g);
        let roomAEWInt = EW.toString()[0];
        let roomANSInt = NS.toString()[0];
        let [EW2, NS2] = roomB.match(/\d+/g);
        let roomBEWInt = EW2.toString()[0];
        let roomBNSInt = NS2.toString()[0];
        return roomAEWInt === roomBEWInt && roomANSInt === roomBNSInt;
    };

    /**
     * Check if we own any rooms in this rooms sector
     * @param room Room to compare against
     * @returns {boolean}
     */
    global.myRoomInSectorCheck = function (room) {
        // Extract the sector information (first digit of EW and NS)
        let [EW, NS] = room.match(/\d+/g).map(Number);
        let roomSector = `${String(EW)[0]}${String(NS)[0]}`;

        // Check if any of MY_ROOMS belong to the same sector
        return MY_ROOMS.some(myRoom => {
            let [EW2, NS2] = myRoom.match(/\d+/g).map(Number);
            let myRoomSector = `${String(EW2)[0]}${String(NS2)[0]}`;
            return roomSector === myRoomSector;
        });
    };


    /**
     * Get the total amount of a resource you have
     * @param resource
     * @returns {number}
     */
    global.getResourceTotal = function (resource) {
        let amount = 0;
        for (let roomName of MY_ROOMS) {
            let room = Game.rooms[roomName];
            amount += room.store(resource);
        }
        return amount;
    }

    /**
     * Run profiler
     */
    global.profile = function () {
        log.a('Running the Profiler', ' ');
        Game.profiler.stream(25);
    }

    /**
     * Time since last reset
     */
    global.getUptime = function () {
        let uptime = (Game.time - (Memory.lastGlobalReset || Game.time));
        log.a('Current global uptime: ' + uptime + ' ticks', ' ');
    }

    /**
     * Get the intel for a room
     * @param roomName
     */
    global.intel = function (roomName) {
        if (!INTEL[roomName]) return log.e('No intel for ' + roomName);
        log.a('--INTEL FOR ' + roomName + '--', ' ');
        for (let key in INTEL[roomName]) {
            log.e(key + ': ' + INTEL[roomName][key], ' ');
        }
    }

    /**
     * Purges the intel cache
     */
    global.purgeIntel = function (segment = 0) {
        log.a('--INTEL CACHE PURGED--', ' ');
        global.INTEL = {};
    }

    /**
     * Get the strength of a user
     * @param user
     * @returns {number}
     */
    global.userStrength = function (user) {
        return _.max(_.filter(INTEL, (r) => r.owner === user), 'level').level || 0;
    }

    let closestCache = {};
    /**
     * Find the closest owned room to a given room
     * @param roomName
     * @param range
     * @param minLevel
     * @returns {number|*|number|string}
     */
    global.findClosestOwnedRoom = function (roomName, range = false, minLevel = 1) {
        // Check if you own the room and if the controller level meets the minimum level
        const room = Game.rooms[roomName];
        if (MY_ROOMS.includes(roomName) && room.controller.level >= minLevel) {
            closestCache[roomName] = {
                closest: roomName,
                distance: 0,
                lastUpdated: Game.time
            };
            return range ? 0 : roomName;
        }

        // Check if we have a valid cache
        const cached = closestCache[roomName];
        if (cached) {
            // If the cache is expired (older than 10,000 ticks), invalidate it
            if (Game.time - cached.lastUpdated > 10000) {
                delete closestCache[roomName]; // Expire cache
            } else {
                // Return the cached value if it's still valid
                if (cached.ownedCount === MY_ROOMS.length) {
                    return range ? cached.distance : cached.closest;
                }
            }
        }

        // Initialize cache for this room if not already
        closestCache[roomName] = {ownedCount: MY_ROOMS.length, lastUpdated: Game.time};
        let closest = null;
        let closestDistance = Infinity;

        // Check all owned rooms for proximity
        for (let key of MY_ROOMS) {
            const myRoom = Game.rooms[key];
            if (!myRoom || myRoom.controller.level < minLevel) continue;

            let distance = 0;

            const path = myRoom.shibRoute(roomName);
            if (path) {
                distance = path.length;
            }

            // If this room is closer, update the closest room and distance
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = myRoom.name;

                // If we find an optimal room, exit early to avoid unnecessary loops
                if (distance === 1) break;
            }
        }

        // Fallback if no closest room is found, just pick a random spawn
        if (!closest) {
            closest = _.sample(Game.spawns).room.name;
            closestDistance = Game.map.getRoomLinearDistance(roomName, closest);
        }

        // Cache the result for future use
        closestCache[roomName].closest = closest;
        closestCache[roomName].distance = closestDistance;
        closestCache[roomName].lastUpdated = Game.time; // Store the time of the cache update

        return range ? closestDistance : closest;
    };

    /**
     * Difference between two numbers
     * @param num1
     * @param num2
     * @returns {number}
     */
    global.difference = function (num1, num2) {
        return (num1 > num2) ? num1 - num2 : num2 - num1
    }

    /**
     * Get and store the room status for a given room.
     * @param {string} roomName - The name of the room whose status is to be retrieved.
     * @returns {string} The status of the room.
     */
    global.roomStatus = function (roomName) {
        const cache = CACHE.ROOM_STATUS;

        // Refresh the cache if it is outdated or doesn't exist
        if (!cache || cache.tick + 10000 < Game.time) {
            CACHE.ROOM_STATUS = {
                tick: Game.time
            };
        }

        // If the room status is not in cache, retrieve and store it
        if (!CACHE.ROOM_STATUS[roomName]) {
            CACHE.ROOM_STATUS[roomName] = Game.map.getRoomStatus(roomName).status;
        }

        return CACHE.ROOM_STATUS[roomName];
    };
}

module.exports = helpers;