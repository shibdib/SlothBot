const activeSegments = [0, 1, 2, 3, 4, 23, 98];

module.exports.init = function () {
    RawMemory.setActiveSegments(activeSegments);

    // Track allied requests
    logRequests();

    // Make requests
    if (Game.time % 50 === 0) makeRequests();
}

let intelSegmentChecked;
let segmentNumber = 0;
if (Game.shard.name.match(/\d+/)[0]) segmentNumber = Game.shard.name.match(/\d+/)[0];
module.exports.retrieveIntel = function () {
    // Retrieve intel cache
    if (!_.size(INTEL) || !intelSegmentChecked) {
        if (RawMemory.segments[segmentNumber]) {
            intelSegmentChecked = true;
            let intelCache = JSON.parse(RawMemory.segments[segmentNumber]);
            // Check for invalid cache
            if (!_.size(intelCache) || !intelCache[Object.keys(intelCache)[0]].name) {
                log.e('Invalid intel cache, clearing.');
                RawMemory.segments[segmentNumber] = undefined;
                global.INTEL = {};
            } else global.INTEL = JSON.parse(RawMemory.segments[segmentNumber]) || {};
        } else {
            RawMemory.setActiveSegments(activeSegments);
            log.d("Intel segment not accessible, enabling the segment for the next tick.");
            global.INTEL = {};
        }
    }
    return true;
}

let lastIntelStore;
module.exports.storeIntel = function () {
    // Don't store if we never retrieved
    if (!intelSegmentChecked) {
        log.d("Intel segment not accessed, not storing.");
        return;
    }
    if (!lastIntelStore || lastIntelStore + CREEP_LIFE_TIME < Game.time || Math.random() > 0.95) {
        // Check for invalid cache
        if (!_.size(INTEL) || !INTEL[Object.keys(INTEL)[0]].name) {
            log.e('Invalid intel cache, clearing.');
            return global.INTEL = {};
        }
        let store = JSON.parse(JSON.stringify(INTEL));
        try {
            if (JSON.stringify(store).length >= 95000) {
                let sorted = _.sortBy(store, 'cached');
                for (let entry of sorted) {
                    delete store[entry.name];
                    if (JSON.stringify(store).length < 75000) break;
                }
            }
            RawMemory.segments[segmentNumber] = JSON.stringify(store);
            lastIntelStore = Game.time;
        } catch (e) {
            log.e("Error stringifying intel cache, skipping store.");
            log.e(e.stack);
        }
    }
}

function logRequests() {
    if (!LOANcheck) return;
    // Store last tick
    if (RawMemory.foreignSegment && FRIENDLIES.includes(RawMemory.foreignSegment.username) && RawMemory.foreignSegment.id === 98) {
        ALLY_HELP_REQUESTS[RawMemory.foreignSegment.username] = JSON.parse(RawMemory.foreignSegment.data);
    }
    // Lookup and store for review next tick
    let filtered = _.filter(FRIENDLIES, (f) => f !== MY_USERNAME);
    if (filtered.length) {
        try {
            RawMemory.setActiveForeignSegment(filtered[Game.time % filtered.length], 98);
        } catch (e) {
        }
    }
}

function makeRequests() {
    RawMemory.setPublicSegments([98])
    RawMemory.setDefaultPublicSegment(98)
    let requestArray = [];
    // Energy requests
    /**
    let energyRooms = _.filter(MY_ROOMS, (r) => Game.rooms[r].energyState < 2 && Game.rooms[r].terminal);
    for (let room of energyRooms) {
        if (room) {
            let priority = 0.1;
            if (Game.rooms[room].memory.spawnDefenders) priority = 1;
            else if (!Game.rooms[room].energyState) priority = _.round(1 - (Game.rooms[room].energy / ENERGY_AMOUNT[Game.rooms[room].level]), 2);
            requestArray.push(
                {
                    requestType: 0,
                    resourceType: RESOURCE_ENERGY,
                    maxAmount: ENERGY_AMOUNT[Game.rooms[room].level] - Game.rooms[room].energy,
                    roomName: room,
                    priority: priority
                }
            )
        }
    }
     **/

    // Base mineral requests && Boost requests
    if (Memory.saleTerminal) {
        for (let resource of BASE_MINERALS) {
            if (Memory.harvestableMinerals && !Memory.harvestableMinerals.includes(resource) && Game.rooms[Memory.saleTerminal.room].store(resource) < REACTION_AMOUNT * 3) {
                let priority = 0.1;
                requestArray.push(
                    {
                        requestType: 0,
                        resourceType: resource,
                        maxAmount: (REACTION_AMOUNT * 3) - Game.rooms[Memory.saleTerminal.room].store(resource),
                        roomName: Memory.saleTerminal.room,
                        priority: priority
                    }
                )
            }
        }
        for (let boost of BUY_THESE_BOOSTS) {
            if (Game.rooms[Memory.saleTerminal.room] && Game.rooms[Memory.saleTerminal.room].store(boost) < BOOST_AMOUNT * 3) {
                requestArray.push(
                    {
                        requestType: 0,
                        resourceType: boost,
                        maxAmount: (BOOST_AMOUNT * 3) - Game.rooms[Memory.saleTerminal.room].store(boost),
                        roomName: Memory.saleTerminal.room,
                        priority: 0.1
                    }
                )
            }
        }
    }

    // Ghodium requests
    let terminalRooms = _.filter(MY_ROOMS, (r) => Game.rooms[r].terminal);
    for (let room of terminalRooms) {
        if (Game.rooms[room].store(RESOURCE_GHODIUM) < NUKER_GHODIUM_CAPACITY) {
            requestArray.push(
                {
                    requestType: 0,
                    resourceType: RESOURCE_GHODIUM,
                    maxAmount: NUKER_GHODIUM_CAPACITY - Game.rooms[room].store(RESOURCE_GHODIUM),
                    roomName: room,
                    priority: 0.5
                }
            )
        }
    }

    // Defense requests
    let defenseRooms = _.filter(MY_ROOMS, (r) => Game.rooms[r].memory.dangerousAttack || Game.rooms[r].memory.defenseCooldown > Game.time);
    for (let room of defenseRooms) {
        let priority = 0.25;
        if (INTEL[room].threatLevel === 4) priority = 1;
        requestArray.push(
            {
                requestType: 1,
                roomName: room,
                priority: priority
            }
        )
    }

    // Attack Requests
    if (_.size(Game.flags)) {
        let requestFlag = _.find(Game.flags, (f) => _.startsWith(f.name, 'request'))
        if (requestFlag) {
            requestArray.push(
                {
                    requestType: 2,
                    roomName: requestFlag.pos.roomName,
                    priority: requestFlag.name.match(/\d+$/)[0] || 0.5
                }
            )
        }
    }
    RawMemory.segments[98] = JSON.stringify(requestArray);
}