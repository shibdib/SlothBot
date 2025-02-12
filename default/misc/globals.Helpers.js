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
            if (creep.memory.colony === room.name) creep.suicide();
        });

        // Remove impassible structures
        const cleanThese = room.structures.filter((s) => ![STRUCTURE_ROAD, STRUCTURE_CONTROLLER].includes(s.structureType));
        if (cleanThese.length) {
            cleanThese.forEach(structure => structure.destroy());
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
        let [EWNum, NSNum] = roomA.match(/\d+/g);
        let match = roomA.match(/[a-zA-Z]/g);
        let EWLetter = match[0];
        let NSLetter = match[1];
        let int1 = EWNum.toString()[0];
        let int2 = NSNum.toString()[0];
        [EWNum, NSNum] = roomB.match(/\d+/g);
        match = roomB.match(/[a-zA-Z]/g);
        let EWLetter2 = match[0];
        let NSLetter2 = match[1];
        let intB1 = EWNum.toString()[0];
        let intB2 = NSNum.toString()[0];
        if (EWLetter === EWLetter2 && NSLetter === NSLetter2 && isInSameRange(int1, intB1) && isInSameRange(int2, intB2)) return true;
    };

    /**
     * Check if we own any rooms in this room's sector
     * @param {string} room - Room to compare against
     * @returns {boolean}
     */
    global.myRoomInSectorCheck = function (room) {
        let [EWNum, NSNum] = room.match(/\d+/g);
        let match = room.match(/[a-zA-Z]/g);
        let EWLetter = match[0];
        let NSLetter = match[1];
        let int1 = EWNum.toString()[0];
        let int2 = NSNum.toString()[0];
        for (const myRoom of MY_ROOMS) {
            let [EWNum, NSNum] = myRoom.match(/\d+/g);
            let match = myRoom.match(/[a-zA-Z]/g);
            let EWLetter2 = match[0];
            let NSLetter2 = match[1];
            let intB1 = EWNum.toString()[0];
            let intB2 = NSNum.toString()[0];
            if (EWLetter === EWLetter2 && NSLetter === NSLetter2 && isInSameRange(int1, intB1) && isInSameRange(int2, intB2)) return true;
        }
    };

    function isInSameRange(num1, num2) {
        // Calculate the start of the decade for both numbers
        let decadeStart1 = Math.floor(num1 / 10) * 10;
        let decadeStart2 = Math.floor(num2 / 10) * 10;

        // If the start of the decade is the same for both numbers, they're in the same range
        return decadeStart1 === decadeStart2;
    }

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
     * Get the intel for a room
     * @param resource
     */
    global.market = function (resource = undefined) {
        const resources = resource ? [resource] : BASE_MINERALS;
        const headers = ['Property', 'Value'];
        const widths = [20, 15];
        for (const item of resources) {
            const data = latestMarketHistory(item);
            log.a(`-- MARKET DATA FOR ${item.toUpperCase()} --`, ' ');
            let headerLine = '';
            for (let i = 0; i < headers.length; i++) {
                headerLine += headers[i].padEnd(widths[i], ' ');
            }
            log.a(headerLine, ' ');
            for (const [key, value] of Object.entries(data)) {
                let row = '';
                row += key.padEnd(widths[0], ' ');
                row += String(value).padEnd(widths[1], ' '); // Convert value to string for padding
                log.e(row, ' ');
            }
            log.a('', ' ');
        }
    };

    global.latestMarketHistory = function (resource) {
        if (!MARKET_HISTORY[resource] || MARKET_HISTORY[resource].tick !== Game.time) {
            let history = Game.market.getHistory(resource);
            if (Array.isArray(history) && history.length > 0) {
                const prices = history.map(entry => entry.avgPrice);
                const totalVolume = history.reduce((sum, entry) => sum + entry.volume, 0);
                const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
                const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
                const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
                const stdDev = Math.sqrt(variance);
                const mode = prices.sort((a, b) =>
                    prices.filter(v => v === a).length
                    - prices.filter(v => v === b).length
                ).pop();
                const range = Math.max(...prices) - Math.min(...prices);
                const lastPrice = prices.length > 0 ? prices[0].toFixed(2) : '0.00';
                const entries = history.length;

                MARKET_HISTORY[resource] = {
                    data: {
                        avg: mean.toFixed(2),
                        highest: Math.max(...prices).toFixed(2),
                        lowest: Math.min(...prices).toFixed(2),
                        trend: (prices[0] - prices[prices.length - 1]).toFixed(2),
                        trend5: (prices.slice(0, 5).reduce((sum, price) => sum + price, 0) / 5).toFixed(2),
                        trend10: (prices.slice(0, 10).reduce((sum, price) => sum + price, 0) / 10).toFixed(2),
                        trend20: (prices.slice(0, 20).reduce((sum, price) => sum + price, 0) / 20).toFixed(2),
                        last: lastPrice,
                        totalVolume: totalVolume,
                        median: median.toFixed(2),
                        stdDev: stdDev.toFixed(2),
                        mode: mode.toFixed(2),
                        range: range.toFixed(2),
                        entries: entries
                    },
                    tick: Game.time
                };
            }
        }
        // Fallback
        if (!MARKET_HISTORY[resource]) {
            const cheapestOrder = _.min(getAllOrders().filter(order => order.amount >= 50 && order.resourceType === resource &&
                order.type === ORDER_SELL && !MY_ROOMS.includes(order.roomName)), 'price');
            const highestOrder = _.max(getAllOrders().filter(order => order.amount >= 50 && order.resourceType === resource &&
                order.type === ORDER_SELL && !MY_ROOMS.includes(order.roomName)), 'price');
            MARKET_HISTORY[resource] = {};
            MARKET_HISTORY[resource].data = {};
            if (cheapestOrder && cheapestOrder.id) {
                MARKET_HISTORY[resource].data.avg = cheapestOrder.price;
                MARKET_HISTORY[resource].data.highest = highestOrder.price;
                MARKET_HISTORY[resource].data.lowest = cheapestOrder.price;
            } else {
                MARKET_HISTORY[resource].data.avg = 50;
                MARKET_HISTORY[resource].data.highest = 50;
                MARKET_HISTORY[resource].data.lowest = 50;
            }
            MARKET_HISTORY[resource].data.entries = 1;
        }
        return MARKET_HISTORY[resource].data;

        function getAllOrders() {
            return Game.market.getAllOrders()
        }
    }

    /**
     * Get the strength of a user
     * @param user
     * @returns {number}
     */
    global.userStrength = function (user) {
        return _.max(_.filter(INTEL, (r) => r && r.owner === user), 'level').level || 0;
    }

    let closestCache = {};
    /**
     * Find the closest owned room to a given room
     * @param roomName
     * @param range
     * @param minLevel
     * @param availableForCombat
     * @returns {number|*|number|string}
     */
    global.findClosestOwnedRoom = function (roomName, range = false, minLevel = 1, availableForCombat = undefined) {
        // Direct check if the current room is owned and meets level criteria
        if (MY_ROOMS.includes(roomName)) {
            const room = Game.rooms[roomName];
            if (room && room.controller && room.controller.level >= minLevel) {
                if (!closestCache[roomName]) {
                    closestCache[roomName] = {
                        closest: roomName,
                        distance: 0,
                        lastUpdated: Game.time
                    };
                } else {
                    closestCache[roomName].lastUpdated = Game.time;
                }
                return range ? 0 : roomName;
            }
        }

        // Cache check
        const cached = closestCache[roomName];
        if (cached && Game.time - cached.lastUpdated < CREEP_LIFE_TIME * 3) {
            return range ? cached.distance : cached.closest;
        }

        let closest = null;
        let closestDistance = Infinity;

        // Loop through owned rooms
        for (let key of MY_ROOMS) {
            const myRoom = Game.rooms[key];
            if (availableForCombat && !myRoom.memory.availableForAssignment) continue;
            if (myRoom && myRoom.controller && myRoom.controller.level >= minLevel) {
                let distance = Game.map.getRoomLinearDistance(roomName, key);
                // If not an absurd distance, use findRoute
                if (distance <= 12) distance = Game.map.findRoute(roomName, key).length;
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closest = key;
                    // Exit if we find the closest possible (direct neighbor)
                    if (distance === 1) break;
                }
            }
        }

        // If no valid room was found, use a fallback
        if (!closest) {
            let spawnRoom = Game.spawns[Object.keys(Game.spawns)[0]].room.name; // First spawn's room
            closest = spawnRoom;
            closestDistance = Game.map.getRoomLinearDistance(roomName, closest);
        }

        // Update cache
        closestCache[roomName] = {
            closest: closest,
            distance: closestDistance,
            lastUpdated: Game.time
        };

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