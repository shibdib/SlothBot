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
     * Check if two rooms share the same sector (5x5 grid)
     * @param {string} roomA - First room name (e.g., "E5N3")
     * @param {string} roomB - Second room name (e.g., "E7N4")
     * @returns {boolean}
     */
    global.sameSectorCheck = function (roomA, roomB) {
        const coordsA = getRoomCoords(roomA);
        const coordsB = getRoomCoords(roomB);
        if (isNaN(coordsA.x) || isNaN(coordsA.y) || isNaN(coordsB.x) || isNaN(coordsB.y)) {
            return false;
        }
        if ((coordsA.x < 0) !== (coordsB.x < 0) || (coordsA.y < 0) !== (coordsB.y < 0)) {
            return false;
        }
        const sectorX_A = Math.floor(Math.abs(coordsA.x) / 5);
        const sectorY_A = Math.floor(Math.abs(coordsA.y) / 5);
        const sectorX_B = Math.floor(Math.abs(coordsB.x) / 5);
        const sectorY_B = Math.floor(Math.abs(coordsB.y) / 5);
        return sectorX_A === sectorX_B && sectorY_A === sectorY_B;
    };

    /**
     * Check if any owned room is in the same sector as the given room
     * @param {string} room - Room to compare against (e.g., "E5N3")
     * @returns {boolean}
     */
    global.myRoomInSectorCheck = function (room) {
        const coords = getRoomCoords(room);
        if (isNaN(coords.x) || isNaN(coords.y) || !Array.isArray(MY_ROOMS)) {
            return false;
        }
        const sectorX = Math.floor(Math.abs(coords.x) / 5);
        const sectorY = Math.floor(Math.abs(coords.y) / 5);
        const xIsNegative = coords.x < 0;
        const yIsNegative = coords.y < 0;
        for (const myRoom of MY_ROOMS) {
            const myCoords = getRoomCoords(myRoom);
            if (isNaN(myCoords.x) || isNaN(myCoords.y)) continue;
            if ((myCoords.x < 0) === xIsNegative && (myCoords.y < 0) === yIsNegative) {
                const mySectorX = Math.floor(Math.abs(myCoords.x) / 5);
                const mySectorY = Math.floor(Math.abs(myCoords.y) / 5);
                if (sectorX === mySectorX && sectorY === mySectorY) {
                    return true;
                }
            }
        }
        return false;
    };

    /**
     * Convert room name to coordinates efficiently
     * @param {string} roomName - Room name (e.g., "E5N3")
     * @returns {Object} - { x: number, y: number }
     */
    function getRoomCoords(roomName) {
        const isWest = roomName[0] === 'W';
        const nsIndex = roomName.indexOf('N') !== -1 ? roomName.indexOf('N') : roomName.indexOf('S');
        const x = parseInt(roomName.slice(1, nsIndex));
        const y = parseInt(roomName.slice(nsIndex + 1));
        return {
            x: isWest ? -x : x,
            y: roomName[nsIndex] === 'S' ? -y : y
        };
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
    global.INTEL_ROOM_PURGE = [];
    global.purgeIntel = function (roomName, segment = 0) {
        if (!roomName) {
            log.a('--INTEL CACHE PURGED--', ' ');
            global.INTEL = {};
        } else {
            log.a(`--INTEL PURGED FOR ${roomLink(roomName)}--`, ' ');
            INTEL_ROOM_PURGE.push(roomName)
        }
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
            if (availableForCombat && !myRoom.energyState) continue;
            if (myRoom && myRoom.controller && myRoom.controller.level >= minLevel) {
                let distance = Game.map.getRoomLinearDistance(roomName, key);
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
             // First spawn's room
            closest = Game.spawns[Object.keys(Game.spawns)[0]].room.name;
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
     * Filters an object
     * @param obj
     * @param predicate
     * @returns {object}
     */
    global.objFilter = function (obj, predicate) {
        return Object.keys(obj)
            .filter(key => predicate(obj[key]))
            .reduce((res, key) => (res[key] = obj[key], res), {});
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

    /**
     * Find and purge all routes containing a room
     * @param {string} roomName - The name of the room whose status is to be retrieved.
     * @returns {void}
     */
    global.purgeBadRoute = function (roomName) {
        let routeCache = ROUTE_CACHE;
        try {
            routeCache = objFilter(routeCache, (r) => !JSON.parse(r.route).includes(roomName));
            CACHE.ROUTE_CACHE = routeCache;
        } catch (e) {

        }
    }

    /**
     * Get all the surrounding rooms regardless of connection
     * @param {string} roomName - The name of the room.
     * @returns {array} Array of rooms names
     */
    global.getSurroundingRooms = function (roomName) {
        const match = roomName.match(/([WE])(\d+)([NS])(\d+)/);
        if (!match) return [];
        const [, EW, E, NS, N] = match;
        const ECoord = parseInt(E);
        const W = EW === 'W';
        const NCoord = parseInt(N);
        const S = NS === 'S';
        const rooms = {};
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                let newECoord = ECoord + dx;
                let newW = W;
                let newNCoord = NCoord + dy;
                let newS = S;
                if (newECoord < 0) {
                    newECoord = Math.abs(newECoord) - 1;
                    newW = !newW;
                }
                if (newNCoord < 0) {
                    newNCoord = Math.abs(newNCoord) - 1;
                    newS = !newS;
                }
                let newRoomName = `${newW ? 'W' : 'E'}${newECoord}${newS ? 'S' : 'N'}${newNCoord}`;
                if (Game.map.getRoomLinearDistance(roomName, newRoomName) === 1) {
                    rooms[newRoomName] = true;
                }
            }
        }
        return Object.keys(rooms);
    }

    /**
     * Gets the energy cost of all buildings at that level
     * @param {int} level - The name of the room whose status is to be retrieved.
     * @returns {int}
     */
    let storedCost = {};
    global.constructionCost = function (level) {
        if (storedCost[level]) return storedCost[level];
        const levelCost = {};
        for (const structure in CONTROLLER_STRUCTURES) {
            if ([STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL].includes(structure)) continue;
            for (const key in CONTROLLER_STRUCTURES[structure]) {
                if (!levelCost[key]) levelCost[key] = 0;
                const count = CONTROLLER_STRUCTURES[structure][key];
                levelCost[key] += CONSTRUCTION_COST[structure] * count;
            }
        }
        storedCost = levelCost;
        return storedCost[level];
    }
}

module.exports = helpers;