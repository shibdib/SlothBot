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
        if (!room || !room.controller || (room.controller.owner && room.controller.owner.username !== MY_USERNAME)) {
            return log.a(room ? `${room.name} does not appear to be owned by you.` : 'Room does not exist.');
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
            if (Memory.targetRooms) Memory.targetRooms[roomName] = undefined;
            if (Memory.auxiliaryTargets) Memory.auxiliaryTargets[roomName] = undefined;
        }

        function resetRoomIntel(room) {
            const roomName = room.name;
            if (!INTEL[roomName]) INTEL[roomName] = {};
            INTEL[roomName].noClaim = Game.time + 50000;
            INTEL[roomName].failedClaim = (INTEL[roomName].failedClaim || 0) + 1;
            room.cacheRoomIntel(true);  // Only cache intel if necessary
        }
    };


    /**
     * Get nukes in range
     * @param target
     */
    global.nukes = function (target) {
        let nukes = [];
        for (let r of MY_ROOMS) {
            let room = Game.rooms[r];
            if (room && room.nuker && !room.nuker.store.getFreeCapacity(RESOURCE_ENERGY) && !room.nuker.store.getFreeCapacity(RESOURCE_GHODIUM) && !room.nuker.cooldown) {
                if (!target || Game.map.getRoomLinearDistance(r, target) <= 10) {
                    nukes.push(room.nuker);
                }
            }
        }
        if (!nukes.length && !target) return log.a('No nukes available');
        if (!nukes.length && target) return log.a('No nukes available in range of ' + target);
        for (let key in nukes) {
            if (target) log.a(nukes[key].room.name + ' has a nuclear missile available that is in range of ' + target);
            if (!target) log.a(nukes[key].room.name + ' has a nuclear missile available.')
        }
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
     * Source Keeper rooms sit at the center of each 10x10 sector (x%10===4 && y%10===4).
     * @param {string} roomName
     * @returns {boolean}
     */
    global.isSourceKeeperRoomName = function (roomName) {
        if (!roomName || roomName.length < 4) return false;
        const parsed = parseRoomXY(roomName);
        return parsed && parsed.x % 10 === 4 && parsed.y % 10 === 4;
    };

    /**
     * Highway rooms sit on the 10-room grid lines (x%10===0 || y%10===0).
     * Power banks and commodity deposits only spawn here.
     * @param {string} roomName
     * @returns {boolean}
     */
    global.isHighwayRoomName = function (roomName) {
        if (!roomName || roomName.length < 4) return false;
        const parsed = parseRoomXY(roomName);
        return !!(parsed && (parsed.x % 10 === 0 || parsed.y % 10 === 0));
    };

    /**
     * Sector-center rooms (x%10===5 && y%10===5): no controller, no keepers, mineral only.
     * @param {string} roomName
     * @returns {boolean}
     */
    global.isSectorCenterRoomName = function (roomName) {
        if (!roomName || roomName.length < 4) return false;
        const parsed = parseRoomXY(roomName);
        return parsed && parsed.x % 10 === 5 && parsed.y % 10 === 5;
    };

    function parseRoomXY(roomName) {
        const nsIndex = roomName.indexOf('N') !== -1 ? roomName.indexOf('N') : roomName.indexOf('S');
        if (nsIndex < 2) return null;
        const x = parseInt(roomName.slice(1, nsIndex), 10);
        const y = parseInt(roomName.slice(nsIndex + 1), 10);
        if (isNaN(x) || isNaN(y)) return null;
        return {x, y};
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
        if (!INTEL[roomName]) return log.w('No intel for ' + roomName);
        log.a('--INTEL FOR ' + roomName + '--', ' ');
        for (let key in INTEL[roomName]) {
            log.a(key + ': ' + INTEL[roomName][key], ' ');
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
            if (global.rebuildIntelIndexes) global.rebuildIntelIndexes();
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
                log.a(row, ' ');
            }
            log.a('', ' ');
        }
    };

    global.latestMarketHistory = function (resource) {
        if (!MARKET_HISTORY[resource] || MARKET_HISTORY[resource].tick !== Game.time) {
            let history = Game.market.getHistory(resource);
            if (Array.isArray(history) && history.length > 0) {
                const prices = history.map(entry => entry.avgPrice);
                const chronological = prices.slice();
                const totalVolume = history.reduce((sum, entry) => sum + entry.volume, 0);
                const lastNAvg = (n) => {
                    const slice = chronological.slice(-n);
                    return slice.reduce((sum, price) => sum + price, 0) / slice.length;
                };
                const lastPrice = chronological.length ? chronological[chronological.length - 1] : 0;
                const sorted = prices.slice().sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)];
                const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
                const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
                const stdDev = Math.sqrt(variance);
                const mode = prices.slice().sort((a, b) =>
                    prices.filter(v => v === a).length
                    - prices.filter(v => v === b).length
                ).pop();
                const range = Math.max(...prices) - Math.min(...prices);
                const entries = history.length;

                MARKET_HISTORY[resource] = {
                    data: {
                        avg: mean.toFixed(2),
                        highest: Math.max(...prices).toFixed(2),
                        lowest: Math.min(...prices).toFixed(2),
                        trend: (lastPrice - chronological[0]).toFixed(2),
                        trend5: lastNAvg(5).toFixed(2),
                        trend10: lastNAvg(10).toFixed(2),
                        trend20: lastNAvg(20).toFixed(2),
                        last: lastPrice.toFixed(2),
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
     * Get the composite strength of a user, scored on the same 0..8+ scale as controller
     * level so existing callers (highCommand, creepSpawning) keep working.
     *
     * Per-room score blends: controller level, active towers, storage/terminal energy tier,
     * rampart median HP tier, and a staleness factor (rooms not re-observed recently count
     * for less). Aggregated across rooms with diminishing returns so a sprawl bot doesn't
     * read as 5x a single-hub bot of comparable RCL.
     *
     * Result is cached on Memory._userList[user].strength with TTL.
     * @param user
     * @returns {number}
     */
    const STRENGTH_TTL = 50;
    const STRENGTH_WEIGHTS = {
        rclScale: 8,                    // base score is controller.level / rclScale
        towerWeight: 0.04,              // per active tower
        towerCap: 6,                    // cap at 6 towers (RCL8 max)
        storageScale: 1000000,          // 1M energy = full storage (RCL8 max ~1M)
        storageWeight: 0.10,
        terminalScale: 300000,          // 300k energy ~ full terminal
        terminalWeight: 0.05,
        rampartScale: 100000000,        // 100M HP saturates rampart contribution
        rampartWeight: 0.10,
        safemodeBonus: 0.05,            // safemode = held actively
        downgradeThreshold: 0.3,        // ticksToDowngrade < threshold × max → penalty
        downgradePenalty: 0.7,
        staleHalveTicks: 20000,         // no observation in this long → halve score
        staleQuarterTicks: 10000,       // ...or in this long → 0.75× score
        diminishingFactor: 0.4,         // satellite rooms contribute / (1 + i × this)
        levelScale: 8                   // map composite total back to level-equivalent
    };
    const strengthCache = {};   // module-local cache for users not in _userList
    global.userStrength = function (user) {
        if (!user || user === 'Invader' || user === 'Source Keeper') return 0;

        const tracked = Memory._userList && Memory._userList[user];
        const cacheEntry = tracked || strengthCache[user];
        if (cacheEntry && cacheEntry._strengthTick + STRENGTH_TTL > Game.time && cacheEntry.strength != null) {
            return cacheEntry.strength;
        }

        const currentTime = Game.time;
        const rooms = [];
        for (const name in INTEL) {
            const r = INTEL[name];
            if (r && r.owner === user) rooms.push(r);
        }

        if (!rooms.length) {
            // No persistence for strangers with no rooms — just memo in-process.
            if (tracked) {
                tracked.strength = 0;
                tracked._strengthTick = currentTime;
            } else {
                strengthCache[user] = {strength: 0, _strengthTick: currentTime};
            }
            return 0;
        }

        const W = STRENGTH_WEIGHTS;
        const perRoomScores = rooms.map(r => scoreRoomForStrength(r, currentTime, W));

        // Aggregate with diminishing returns: best room counts fully, subsequent rooms
        // contribute at decreasing weight. Caps growth so 30 satellites don't dominate RCL.
        perRoomScores.sort((a, b) => b - a);
        let total = 0;
        for (let i = 0; i < perRoomScores.length; i++) {
            total += perRoomScores[i] / (1 + i * W.diminishingFactor);
        }

        // Map back to the level-equivalent scale callers expect (0..~10).
        const strength = Math.round(total * W.levelScale * 10) / 10;

        if (tracked) {
            tracked.strength = strength;
            tracked._strengthTick = currentTime;
        } else {
            strengthCache[user] = {strength, _strengthTick: currentTime};
        }
        return strength;
    }

    function scoreRoomForStrength(r, currentTime, W) {
        const level = r.level || 0;
        let s = level / W.rclScale;
        s += Math.min((r.towers || 0), W.towerCap) * W.towerWeight;
        if (r.storageEnergy) s += Math.min(r.storageEnergy / W.storageScale, 1) * W.storageWeight;
        if (r.terminalEnergy) s += Math.min(r.terminalEnergy / W.terminalScale, 1) * W.terminalWeight;
        if (r.rampartMedHP) s += Math.min(r.rampartMedHP / W.rampartScale, 1) * W.rampartWeight;
        if (r.safemode && r.safemode > currentTime) s += W.safemodeBonus;

        // Staleness — intel not refreshed recently fades.
        const lastSeen = r.lastOwnedAt || r.cached || 0;
        const age = currentTime - lastSeen;
        if (age > W.staleHalveTicks) s *= 0.5;
        else if (age > W.staleQuarterTicks) s *= 0.75;

        // Downgrading controller — if they're letting it slip, weight down.
        if (r.ticksToDowngrade && CONTROLLER_DOWNGRADE[level]
            && r.ticksToDowngrade < CONTROLLER_DOWNGRADE[level] * W.downgradeThreshold) {
            s *= W.downgradePenalty;
        }

        return s;
    }

    /**
     * Console helper — print the per-room composition behind a user's strength score.
     * Usage: strengthBreakdown('PlayerName')
     */
    global.strengthBreakdown = function (user) {
        if (!user) {
            console.log('usage: strengthBreakdown(username)');
            return;
        }
        const currentTime = Game.time;
        const W = STRENGTH_WEIGHTS;
        const rooms = [];
        for (const name in INTEL) {
            const r = INTEL[name];
            if (r && r.owner === user) rooms.push(r);
        }
        if (!rooms.length) {
            console.log(`No rooms in INTEL owned by ${user}. (strength = 0)`);
            return;
        }

        const scored = rooms.map(r => ({room: r, score: scoreRoomForStrength(r, currentTime, W)}));
        scored.sort((a, b) => b.score - a.score);

        console.log(`\nStrength breakdown for ${user}:`);
        console.log(`  ${'room'.padEnd(10)} ${'rcl'.padStart(4)} ${'tow'.padStart(4)} ${'storeE'.padStart(8)} ${'rampMed'.padStart(10)} ${'age'.padStart(7)} ${'score'.padStart(7)}`);
        let total = 0;
        for (let i = 0; i < scored.length; i++) {
            const {room: r, score} = scored[i];
            const contribution = score / (1 + i * W.diminishingFactor);
            total += contribution;
            const age = currentTime - (r.lastOwnedAt || r.cached || 0);
            console.log(`  ${r.name.padEnd(10)} ${String(r.level || 0).padStart(4)} ${String(r.towers || 0).padStart(4)} ${String(r.storageEnergy || 0).padStart(8)} ${String(r.rampartMedHP || 0).padStart(10)} ${String(age).padStart(7)} ${score.toFixed(3).padStart(7)} -> contributes ${contribution.toFixed(3)}`);
        }
        const finalStrength = Math.round(total * W.levelScale * 10) / 10;
        console.log(`  Total composite: ${total.toFixed(3)}  →  strength = ${finalStrength}\n`);
    }

    let closestCache = {};
    let closestLinearCache = {};
    /**
     * Find the closest owned (or optionally allied) room to a given room by route distance.
     * @param {string} roomName - target room
     * @param {boolean} [range=false] - if true return route distance, else return room name
     * @param {number} [minLevel=1] - minimum controller level required
     * @param {boolean} [includeAllies=false] - also consider FRIENDLIES with level >= minLevel
     * @param {boolean} [linear=false] - if true return linear distance, else return route distance
     * @returns {string|number|undefined}
     */
    global.findClosestOwnedRoom = function (roomName, range = false, minLevel = 1, includeAllies = false, linear = false) {
        const cacheKey = `${roomName}_${minLevel}_${includeAllies}`;
        const cache = linear ? closestLinearCache : closestCache;

        // Direct check if the current room is owned and meets level criteria
        if (MY_ROOMS.includes(roomName)) {
            const room = Game.rooms[roomName];
            if (room && room.controller && room.controller.level >= minLevel) {
                cache[cacheKey] = {closest: roomName, distance: 0, lastUpdated: Game.time};
                return range ? 0 : roomName;
            }
        }

        // Cache check — linear and route lookups are different values, keep them apart.
        const cached = cache[cacheKey];
        if (cached && Game.time - cached.lastUpdated < CREEP_LIFE_TIME * 3) {
            return range ? cached.distance : cached.closest;
        }

        // Build candidates, pre-sort by linear distance so we can break once
        // linear exceeds the best route length found (route length >= linear distance).
        const baseNames = includeAllies
            ? MY_ROOMS.concat(_.pluck(_.filter(INTEL, (r) => r && r.owner && FRIENDLIES.includes(r.owner) && r.level >= minLevel), 'name'))
            : MY_ROOMS;
        const candidates = baseNames
            .map((name) => ({name, linear: Game.map.getRoomLinearDistance(roomName, name)}))
            .sort((a, b) => a.linear - b.linear);

        if (linear) {
            closestLinearCache[cacheKey] = {
                closest: candidates[0]?.name,
                distance: candidates[0]?.linear,
                lastUpdated: Game.time
            };
            return range ? closestLinearCache[cacheKey].distance : closestLinearCache[cacheKey].closest;
        }

        let closest = null;
        let closestDistance = Infinity;
        for (const {name, linear} of candidates) {
            if (linear >= closestDistance) break;
            const room = Game.rooms[name];
            if (!room) continue;
            if (!INTEL[name]) room.cacheRoomIntel();
            if (!INTEL[name] || INTEL[name].level < minLevel) continue;
            const distance = room.routeDistance(roomName);
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = name;
                if (distance === 1) break;
            }
        }

        // Fallback: first spawn's room, only if it satisfies minLevel
        if (!closest) {
            const firstSpawn = Game.spawns[Object.keys(Game.spawns)[0]];
            if (firstSpawn && firstSpawn.room.controller && firstSpawn.room.controller.level >= minLevel) {
                closest = firstSpawn.room.name;
                closestDistance = firstSpawn.room.routeDistance(roomName);
            } else {
                return range ? Infinity : undefined;
            }
        }

        closestCache[cacheKey] = {closest: closest, distance: closestDistance, lastUpdated: Game.time};
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
            routeCache = _.filter(routeCache, (r) => !JSON.parse(r.route).includes(roomName));
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

    global.abilityPower = function (body) {
        let meleePower = 0;
        let rangedPower = 0;
        let healPower = 0;
        let rangedHealPower = 0;
        let ehp = 0;
        let lowestDamageMultiplier = 1;

        for (let part of body) {
            let partType, boost, hits;
            if (typeof part === 'string') {
                partType = part;
                boost = undefined;
                hits = 100;
            } else {
                if (part.hits <= 0) continue;
                partType = part.type;
                boost = part.boost;
                hits = part.hits;
            }

            // Generic hits calculation (EHP)
            let currentDmgMult = 1;
            if (partType === TOUGH && boost && BOOSTS[partType][boost].damage) {
                currentDmgMult = BOOSTS[partType][boost].damage;
                if (currentDmgMult < lowestDamageMultiplier) lowestDamageMultiplier = currentDmgMult;
            }
            ehp += hits / currentDmgMult;

            // Calculate based on part type
            switch (partType) {
                case ATTACK:
                    meleePower += boost
                        ? ATTACK_POWER * BOOSTS[partType][boost].attack
                        : ATTACK_POWER;
                    break;
                case RANGED_ATTACK:
                    rangedPower += boost
                        ? RANGED_ATTACK_POWER * BOOSTS[partType][boost].rangedAttack
                        : RANGED_ATTACK_POWER;
                    break;
                case HEAL:
                    healPower += boost
                        ? HEAL_POWER * BOOSTS[partType][boost].heal
                        : HEAL_POWER;
                    rangedHealPower += boost
                        ? RANGED_HEAL_POWER * BOOSTS[partType][boost].heal
                        : RANGED_HEAL_POWER;
                    break;
                default:
                    break;
            }
        }

        // Effective healing represents how much raw damage the creep can absorb per tick based on its own heals + damage reduction
        const effectiveHealingMultiplier = 1 / lowestDamageMultiplier;

        return {
            attack: meleePower + rangedPower, // Total true DPS potential
            meleeAttack: meleePower,
            rangedAttack: rangedPower,
            heal: healPower, // Total true HPS potential
            rangedHeal: rangedHealPower,
            // New metrics for enhanced combat logic:
            effectiveHeal: healPower * effectiveHealingMultiplier,
            defense: ehp, // Effective Health Pool (EHP)
            damageMultiplier: lowestDamageMultiplier
        };
    };

    // === INTEL INDEXES: one full scan per tick to feed fast queries everywhere ===
    // Replaces multiple O(|INTEL|) loops in diplomacy, highCommand, explorer, observer, HUD etc.
    // Updated incrementally on intel changes for mid-tick accuracy.

    function isHarassOwner(user) {
        if (!user) return false;
        if (global.FRIENDLIES && FRIENDLIES.includes(user)) return false;
        if (global.NO_DIRECT_ATTACKS && NO_DIRECT_ATTACKS.includes(user)) return false;
        if (global.THREATS && THREATS.includes(user)) return true;
        const war = global.WAR_TARGETS;
        if (war) {
            for (let i = 0; i < war.length; i++) {
                if (war[i] && war[i].user === user) return true;
            }
        }
        return false;
    }

    global.isHarassOwner = isHarassOwner;

    function intelIndexThreatUser(user) {
        return isHarassOwner(user);
    }

    function intelIndexHarassRemote(roomName, r, ct) {
        if (!r || r.owner || r.towers) return false;
        if (r.safemode && r.safemode > ct) return false;
        const exits = Game.map.describeExits(roomName);
        if (!exits || Object.values(exits).length <= 1) return false;
        for (const neighbor of Object.values(exits)) {
            const ni = global.INTEL && INTEL[neighbor];
            if (!ni || !intelIndexThreatUser(ni.owner)) continue;
            if (ni.safemode && ni.safemode > ct) continue;
            return true;
        }
        return false;
    }

    function intelIndexStrongholdActive(r, ct) {
        return !!(r && r.sk && r.towers && r.invaderCore && r.invaderCore > ct);
    }

    function intelIndexMineralCandidate(r) {
        if (!r || r.sk) return false;
        if (!r.sources || r.sources < 3) return false;
        if (r.user && global.FRIENDLIES && !FRIENDLIES.includes(r.user)) return false;
        if (!r.mineralAmount) return false;
        return true;
    }

    function intelIndexClaimCandidate(r, ct) {
        if (!r || !r.hubCheck || r.owner) return false;
        if (!r.cached || r.cached + 10000 <= ct) return false;
        if (r.noClaim && r.noClaim >= ct) return false;
        if (r.obstacles) return false;
        if (r.reservation && r.reservation !== MY_USERNAME) return false;
        return true;
    }

    function intelIndexRefreshHarass(idx, roomName, ct) {
        idx.harassRemotes.delete(roomName);
        const r = global.INTEL && INTEL[roomName];
        if (r && intelIndexHarassRemote(roomName, r, ct)) idx.harassRemotes.add(roomName);
    }

    function intelIndexRefreshHarassNeighborhood(idx, roomName, ct) {
        intelIndexRefreshHarass(idx, roomName, ct);
        const exits = Game.map.describeExits(roomName);
        if (!exits) return;
        for (const neighbor of Object.values(exits)) intelIndexRefreshHarass(idx, neighbor, ct);
    }

    global.INTEL_INDEX = {
        tick: 0,
        byOwner: {},
        power: new Set(),
        commodity: new Set(),
        highways: new Set(),
        threats: new Set(),
        requestingSupport: new Set(),
        unownedSources: new Set(),
        invaderCores: new Set(),
        activeRemotes: new Set(),
        strongholdActive: new Set(),
        mineralCandidates: new Set(),
        harassRemotes: new Set(),
        claimCandidates: new Set(),
    };

    global.rebuildIntelIndexes = function (currentTime = Game.time) {
        if (global.INTEL_INDEX && global.INTEL_INDEX.tick === currentTime) return global.INTEL_INDEX;
        const byOwner = {};
        const power = new Set();
        const commodity = new Set();
        const highways = new Set();
        const threats = new Set();
        const requestingSupport = new Set();
        const unownedSources = new Set();
        const invaderCores = new Set();
        const activeRemotes = new Set();
        const strongholdActive = new Set();
        const mineralCandidates = new Set();
        const harassRemotes = new Set();
        const claimCandidates = new Set();
        const ct = currentTime;
        const intel = global.INTEL || {};
        for (const roomName in intel) {
            const r = intel[roomName];
            if (!r) continue;
            const account = r.owner || r.user || r.reservation;
            if (account) {
                (byOwner[account] = byOwner[account] || []).push(r);  // store intel objs for compatibility
            }
            if (r.power && r.power > ct) power.add(roomName);
            if (r.commodity) commodity.add(roomName);
            if (r.isHighway) highways.add(roomName);
            if (r.threatLevel && r.threatLevel > 0) threats.add(roomName);
            if (r.requestingSupport) requestingSupport.add(roomName);
            if (r.sources && !r.owner) unownedSources.add(roomName);
            if (r.invaderCore && r.invaderCore > ct) invaderCores.add(roomName);
            if (r.activeRemote && r.activeRemote + 500 > ct) activeRemotes.add(roomName);
            if (intelIndexStrongholdActive(r, ct)) strongholdActive.add(roomName);
            if (intelIndexMineralCandidate(r)) mineralCandidates.add(roomName);
            if (intelIndexHarassRemote(roomName, r, ct)) harassRemotes.add(roomName);
            if (intelIndexClaimCandidate(r, ct)) claimCandidates.add(roomName);
        }
        global.INTEL_INDEX = {
            tick: currentTime,
            byOwner,
            power,
            commodity,
            highways,
            threats,
            requestingSupport,
            unownedSources,
            invaderCores,
            activeRemotes,
            strongholdActive,
            mineralCandidates,
            harassRemotes,
            claimCandidates,
        };
        return global.INTEL_INDEX;
    };

    global.updateIntelIndex = function (roomName, oldIntel, newIntel, currentTime = Game.time) {
        if (!global.INTEL_INDEX || global.INTEL_INDEX.tick !== currentTime) {
            global.rebuildIntelIndexes(currentTime);
            return;
        }
        const idx = global.INTEL_INDEX;
        const ct = currentTime;

        // byOwner update (remove from old, add to new if changed)
        const oldAccount = oldIntel && (oldIntel.owner || oldIntel.user || oldIntel.reservation);
        const newAccount = newIntel && (newIntel.owner || newIntel.user || newIntel.reservation);
        if (oldAccount && idx.byOwner[oldAccount]) {
            idx.byOwner[oldAccount] = idx.byOwner[oldAccount].filter(item => item && item.name !== roomName);
            if (idx.byOwner[oldAccount].length === 0) delete idx.byOwner[oldAccount];
        }
        if (newAccount) {
            const list = (idx.byOwner[newAccount] = idx.byOwner[newAccount] || []);
            const existing = list.findIndex(item => item && item.name === roomName);
            if (existing >= 0) list[existing] = newIntel;
            else list.push(newIntel);
        }

        // category sets: remove then conditionally add
        idx.power.delete(roomName);
        idx.commodity.delete(roomName);
        idx.highways.delete(roomName);
        idx.threats.delete(roomName);
        idx.requestingSupport.delete(roomName);
        idx.unownedSources.delete(roomName);
        idx.invaderCores.delete(roomName);
        idx.activeRemotes.delete(roomName);
        idx.strongholdActive.delete(roomName);
        idx.mineralCandidates.delete(roomName);
        idx.claimCandidates.delete(roomName);

        if (newIntel) {
            if (newIntel.power && newIntel.power > ct) idx.power.add(roomName);
            if (newIntel.commodity) idx.commodity.add(roomName);
            if (newIntel.isHighway) idx.highways.add(roomName);
            if (newIntel.threatLevel && newIntel.threatLevel > 0) idx.threats.add(roomName);
            if (newIntel.requestingSupport) idx.requestingSupport.add(roomName);
            if (newIntel.sources && !newIntel.owner) idx.unownedSources.add(roomName);
            if (newIntel.invaderCore && newIntel.invaderCore > ct) idx.invaderCores.add(roomName);
            if (newIntel.activeRemote && newIntel.activeRemote + 500 > ct) idx.activeRemotes.add(roomName);
            if (intelIndexStrongholdActive(newIntel, ct)) idx.strongholdActive.add(roomName);
            if (intelIndexMineralCandidate(newIntel)) idx.mineralCandidates.add(roomName);
            if (intelIndexClaimCandidate(newIntel, ct)) idx.claimCandidates.add(roomName);
        }

        intelIndexRefreshHarassNeighborhood(idx, roomName, ct);
    };

    // Helper to get (and ensure built) indexes for this tick
    global.getIntelIndexes = function (currentTime = Game.time) {
        if (!global.INTEL_INDEX || global.INTEL_INDEX.tick !== currentTime) {
            global.rebuildIntelIndexes(currentTime);
        }
        return global.INTEL_INDEX;
    };
}

module.exports = helpers;