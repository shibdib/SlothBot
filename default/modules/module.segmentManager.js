/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

// 0-3 intel
// 69 path
// 70 routes
const activeSegments = [0, 1, 2, 3, 4, 23, 69, 70, 77, 98];

module.exports.init = function () {
    RawMemory.setActiveSegments(activeSegments);

    // Track allied requests
    logRequests();
}

let intelSegmentChecked;
let intelCheckCounter = 0;
let segmentNumber = 0;
try {
    if (Game.shard.name.match(/\d+/) !== null) segmentNumber = Game.shard.name.match(/\d+/)[0];
} catch (e) {
    // For some reason private servers hate this
}
module.exports.retrieveIntel = function () {
    if (intelSegmentChecked) return true;
    // Retrieve intel cache
    if (intelCheckCounter < 5) {
        if (Memory.intelVersion === INTEL_VERSION) {
            if (RawMemory.segments[segmentNumber]) {
                intelSegmentChecked = true;
                global.INTEL = JSON.parse(RawMemory.segments[segmentNumber]) || {};
                log.e("Intel segment retrieved, restoring old intel.", "INTEL MANAGER: ");
            } else {
                intelCheckCounter++;
                RawMemory.setActiveSegments(activeSegments);
                log.d("Intel segment not accessible, enabling the segment for the next tick.", "INTEL MANAGER: ");
            }
        } else {
            intelSegmentChecked = true;
            log.e("Intel update detected, wiping caches.", "INTEL MANAGER: ");
            RawMemory.segments[segmentNumber] = '';
            Memory.intelVersion = INTEL_VERSION;
        }
    } else {
        intelSegmentChecked = true;
        global.INTEL = {};
        log.e("Intel segment not accessible, defaulting to global.", "INTEL MANAGER: ");
    }
    return true;
}

let lastIntelStore;
module.exports.storeIntel = function () {
    // Don't store if we never retrieved
    if (!intelSegmentChecked) {
        log.d("Intel segment not accessed, not storing.", "INTEL MANAGER: ");
        return;
    }
    if (!lastIntelStore || lastIntelStore + CREEP_LIFE_TIME < Game.time || INTEL_ROOM_PURGE.length || Memory.forceIntel) {
        Memory.forceIntel = undefined;
        // Check for invalid cache
        if (!_.size(INTEL) || !INTEL[Object.keys(INTEL)[0]].name) {
            log.e('Invalid intel cache, clearing.', "INTEL MANAGER: ");
            return global.INTEL = {};
        }
        // Purge any rooms as required
        if (INTEL_ROOM_PURGE.length) {
            INTEL_ROOM_PURGE.forEach((r) => INTEL[r] = undefined);
            global.INTEL_ROOM_PURGE = [];
        }
        // Store the data
        let store = JSON.parse(JSON.stringify(INTEL));
        try {
            if (JSON.stringify(store).length >= 75000) {
                store = cleanStore(store);
            }
            RawMemory.segments[segmentNumber] = JSON.stringify(store);
            lastIntelStore = Game.time;
            global.INTEL = store;
        } catch (e) {
            log.e("Error stringifying intel cache, skipping store.", "INTEL MANAGER: ");
            log.e(e.stack);
        }
    }
}

let pathingSegmentChecked;
let pathingCheckCounter = 0;
module.exports.retrievePathing = function () {
    if (pathingSegmentChecked) return true;
    // Retrieve pathing and routing cache
    if (pathingCheckCounter < 25) {
        if (Memory.pathingVersion === PATHFINDER_VERSION) {
            // Paths
            if (RawMemory.segments[69] !== undefined && _.size(RawMemory.segments[69])) {
                pathingSegmentChecked = true;
                CACHE.PATH_CACHE = JSON.parse(RawMemory.segments[69]);
                log.e("Pathing segment retrieved, restoring old path cache.", "PATHING MANAGER: ");
            } else if (RawMemory.segments[69] !== undefined && !_.size(RawMemory.segments[69])) {
                pathingSegmentChecked = true;
                CACHE.PATH_CACHE = {};
                log.e("Pathing segment retrieved and is empty, refreshing path cache.", "PATHING MANAGER: ");
            } else {
                pathingCheckCounter++;
                RawMemory.setActiveSegments(activeSegments);
                log.d("Pathing segment not accessible, enabling the segment for the next tick.", "PATHING MANAGER: ");
            }
            // Routes
            if (RawMemory.segments[70] !== undefined && _.size(RawMemory.segments[70])) {
                pathingSegmentChecked = true;
                CACHE.ROUTE_CACHE = JSON.parse(RawMemory.segments[70]);
                log.e("Routing segment retrieved, restoring old routing cache.", "PATHING MANAGER: ");
            } else if (RawMemory.segments[70] !== undefined && !_.size(RawMemory.segments[70])) {
                pathingSegmentChecked = true;
                CACHE.ROUTE_CACHE = {};
                log.e("Routing segment retrieved and is empty, refreshing routing cache.", "PATHING MANAGER: ");
            } else {
                pathingCheckCounter++;
                RawMemory.setActiveSegments(activeSegments);
                log.d("Routing segment not accessible, enabling the segment for the next tick.", "PATHING MANAGER: ");
            }
        } else {
            pathingSegmentChecked = true;
            log.e("Pathfinder update detected, wiping caches.", "PATHING MANAGER: ");
            RawMemory.segments[69] = '';
            RawMemory.segments[70] = '';
            Memory.pathingVersion = PATHFINDER_VERSION;
        }
    } else {
        pathingSegmentChecked = true;
        global.CACHE.PATH_CACHE = {};
        global.CACHE.ROUTE_CACHE = {};
        log.e("Pathing/Routing segment not accessible, resetting.", "PATHING MANAGER: ");
    }
    return true;
}

let lastPathingStore;
module.exports.storePathing = function () {
    // Don't store if we never retrieved
    if (!pathingSegmentChecked) {
        log.d("Pathing segment not accessed, not storing.", "PATHING MANAGER: ");
        return;
    }
    if (!lastPathingStore || lastPathingStore + CREEP_LIFE_TIME < Game.time) {
        // Handle paths
        // Check for invalid cache
        if (!_.size(CACHE.PATH_CACHE)) {
            return global.CACHE.PATH_CACHE = {};
        }
        let store = JSON.parse(JSON.stringify(CACHE.PATH_CACHE));
        try {
            if (JSON.stringify(store).length >= 75000) {
                store = cleanStore(store);
            }
            RawMemory.segments[69] = JSON.stringify(store);
            lastPathingStore = Game.time;
        } catch (e) {
            log.e("Error stringifying pathing cache, skipping store.", "PATHING MANAGER: ");
            log.e(e.stack);
        }

        // Handle routes
        // Check for invalid cache
        if (!_.size(CACHE.ROUTE_CACHE)) {
            return global.CACHE.ROUTE_CACHE = {};
        }
        store = JSON.parse(JSON.stringify(CACHE.ROUTE_CACHE));
        try {
            if (JSON.stringify(store).length >= 75000) {
                store = cleanStore(store);
            }
            RawMemory.segments[70] = JSON.stringify(store);
            lastPathingStore = Game.time;
        } catch (e) {
            log.e("Error stringifying routing cache, skipping store.", "PATHING MANAGER: ");
            log.e(e.stack);
        }
    }
}

function logRequests() {
    if (!LOAN_CHECK) return;
    // Store last tick
    if (RawMemory.foreignSegment && FRIENDLIES.includes(RawMemory.foreignSegment.username) && RawMemory.foreignSegment.id === 77) {
        ALLY_HELP_REQUESTS[RawMemory.foreignSegment.username] = JSON.parse(RawMemory.foreignSegment.data);
    }
    // Lookup and store for review next tick
    let filtered = _.filter(FRIENDLIES, (f) => f !== MY_USERNAME);
    if (filtered.length) {
        try {
            RawMemory.setActiveForeignSegment(filtered[Game.time % filtered.length], 77);
        } catch (e) {
        }
    }
    // Store your own requests
    const myRequest = ALLY_HELP_REQUESTS[MY_USERNAME] || {
        requests: {
            resource: [],
            defense: [],
            attack: [],
            player: [],
            work: [],
            funnel: [],
            room: []
        }
    };
    ALLY_HELP_REQUESTS[MY_USERNAME] = myRequest;
    RawMemory.segments[77] = JSON.stringify(myRequest);
}

function cleanStore(store) {
    let totalSize = 0;
    let sorted = _.sortBy(Object.values(store), 'cached'); // Use Object.values for less iteration
    let newStore = {};
    for (let i = sorted.length - 1; i >= 0; i--) { // Iterate from the end to keep newer data
        let item = sorted[i];
        let itemString = JSON.stringify(item);
        if (totalSize + itemString.length < 75000) {
            newStore[item.roomName || item.name] = item; // Assuming each item has either roomName or name
            totalSize += itemString.length;
        } else {
            // Optionally, log items that are being dropped
            log.d(`Dropping item due to size limit: ${item.roomName || item.name}`, "INTEL MANAGER: ");
            break; // Once we can't add more, stop the loop to save CPU
        }
    }
    for (let key in store) {
        if (!(key in newStore)) {
            delete store[key];
        }
    }
    Object.assign(store, newStore);
    return store;
}