/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Towing for immobile creeps (0 active MOVE). Truck pulls; trailer follows.
 */

const {
    getCreepMoveWeight,
    needsTow,
    canActAsTowTruck,
    towTruckEligible,
    towPullStats,
    towRuntime,
    sweepTowRuntime,
    MAX_TOW_PLAINS_GAP,
    endTow,
    releaseTruckRef,
    clearTrailerTowState,
    clearShibMove,
    inRangeSameRoom,
} = require('pathUtils');

const STALL_LIMIT = 30;
const EXIT_DIR_CACHE = Object.create(null);

function getTowDestination(trailer) {
    const td = trailer.memory.towDestination;
    if (!td) return null;
    if (typeof td === 'object' && td.x !== undefined) {
        return new RoomPosition(td.x, td.y, td.roomName);
    }
    const obj = Game.getObjectById(td);
    if (obj) return obj.pos;
    const pos = trailer.memory.towDestinationPos;
    if (pos) return new RoomPosition(pos.x, pos.y, pos.roomName);
    return null;
}

function trailerAtTowRange(trailer, towDestination) {
    const opts = trailer.memory.towOptions;
    if (!opts || !towDestination) return false;
    if (opts.range === 0) {
        return trailer.pos.x === towDestination.x
            && trailer.pos.y === towDestination.y
            && trailer.pos.roomName === towDestination.roomName;
    }
    return trailer.pos.getRangeTo(towDestination) <= opts.range;
}

function edgeStepsToward(pos, destRoom) {
    const key = pos.roomName + '>' + destRoom;
    let dir = EXIT_DIR_CACHE[key];
    if (dir === undefined) {
        dir = -1;
        try {
            const found = Game.map.findExit(pos.roomName, destRoom);
            if (typeof found === 'number' && found > 0) dir = found;
        } catch (e) { /* unmapped */
        }
        if (Object.keys(EXIT_DIR_CACHE).length > 400) {
            for (const k in EXIT_DIR_CACHE) delete EXIT_DIR_CACHE[k];
        }
        EXIT_DIR_CACHE[key] = dir;
    }
    if (dir === FIND_EXIT_TOP) return pos.y;
    if (dir === FIND_EXIT_BOTTOM) return 49 - pos.y;
    if (dir === FIND_EXIT_LEFT) return pos.x;
    if (dir === FIND_EXIT_RIGHT) return 49 - pos.x;
    return Math.min(pos.x, pos.y, 49 - pos.x, 49 - pos.y);
}

// Same-room Chebyshev. Across rooms, linear room distance plus steps to the
// exit — getRangeTo is Infinity off-room and never counted as progress.
function towSeparation(from, to) {
    if (!from || !to) return Infinity;
    if (from.roomName === to.roomName) return from.getRangeTo(to);
    const rooms = Game.map.getRoomLinearDistance(from.roomName, to.roomName, false);
    return rooms * 50 + edgeStepsToward(from, to.roomName);
}

function shouldEndTow(truck, trailer, towDestination) {
    const rt = towRuntime(truck);
    const lastProgress = rt.lastTowProgress || rt.towStart || Game.time;
    if (lastProgress + STALL_LIMIT < Game.time) return true;
    if (!towDestination || !trailer.memory.towOptions) return true;
    return trailerAtTowRange(trailer, towDestination);
}

function snapshotTowDestination(heading) {
    if (heading instanceof RoomPosition) {
        return {x: heading.x, y: heading.y, roomName: heading.roomName};
    }
    if (heading?.pos) {
        return {x: heading.pos.x, y: heading.pos.y, roomName: heading.pos.roomName};
    }
    return undefined;
}

function serializableTowDestination(heading) {
    if (!heading) return undefined;
    if (typeof heading === 'string') return heading;
    if (heading.id) return heading.id;
    return snapshotTowDestination(heading);
}

function serializableTowOptions(options) {
    const range = options && options.range;
    return {range: range == null ? 1 : range};
}

function refreshTowDestination(trailer, heading, options) {
    trailer.memory.towDestination = serializableTowDestination(heading);
    trailer.memory.towOptions = serializableTowOptions(options);
    const snap = snapshotTowDestination(heading);
    if (snap) trailer.memory.towDestinationPos = snap;
}

function requestTow(trailer, heading, options) {
    if (!needsTow(trailer)) {
        if (trailer.memory.towDestination) clearTrailerTowState(trailer);
        return false;
    }

    if (trailer.memory.towCreep) {
        const truck = Game.getObjectById(trailer.memory.towCreep);
        if (!pairStillGood(truck, trailer)) {
            if (truck && truck.memory.trailer === trailer.id) releaseTruckRef(truck);
            trailer.memory.towCreep = undefined;
        }
    }

    const range = options.range ?? 1;
    if (inRangeSameRoom(trailer.pos, heading, range)) {
        clearTrailerTowState(trailer);
        return false;
    }

    refreshTowDestination(trailer, heading, options);
    if (rangeZeroPadBlocked(trailer, getTowDestination(trailer))) {
        releasePadWait(trailer);
        return true;
    }
    assignTowForTrailer(trailer);
    return true;
}

function isPairedTow(truck, trailer) {
    return truck && trailer
        && truck.memory.trailer === trailer.id
        && trailer.memory.towCreep === truck.id
        && truck.pos.roomName === trailer.pos.roomName;
}

function truckOnHandoffTile(truck, trailer) {
    const opts = trailer.memory && trailer.memory.towOptions;
    if (!truck || !opts || opts.range !== 0) return false;
    const dest = getTowDestination(trailer);
    return !!(dest && truck.pos.isEqualTo(dest) && truck.pos.isNearTo(trailer));
}

// MOVE creep on a range-0 pad is the swap partner, including when it is carrying.
function padOccupantTruck(trailer) {
    const opts = trailer.memory && trailer.memory.towOptions;
    if (!opts || opts.range !== 0) return null;
    const dest = getTowDestination(trailer);
    if (!dest || dest.roomName !== trailer.pos.roomName || !trailer.pos.isNearTo(dest)) return null;
    const occ = dest.checkForCreep && dest.checkForCreep();
    if (!occ || occ.id === trailer.id || !occ.my || occ.spawning) return null;
    if (!occ.hasActiveBodyparts || !occ.hasActiveBodyparts(MOVE)) return null;
    if (occ.hasActiveBodyparts(ATTACK) || occ.hasActiveBodyparts(RANGED_ATTACK)
        || occ.hasActiveBodyparts(HEAL) || occ.hasActiveBodyparts(CLAIM)) return null;
    if (occ.memory && occ.memory.trailer && occ.memory.trailer !== trailer.id) return null;
    return occ;
}

function pairStillGood(truck, trailer) {
    if (!isPairedTow(truck, trailer)) return false;
    if (truckOnHandoffTile(truck, trailer)) return true;
    if (!towTruckEligible(truck, trailer)) return false;
    return towPullStats(truck, getCreepMoveWeight(trailer)).gap <= MAX_TOW_PLAINS_GAP;
}

function gatherTowTruckCandidates(room, trailer, busyTrucks) {
    if (!room) return [];
    const creeps = room.myCreeps;
    const candidates = [];
    const seen = new Set();
    const pinned = padOccupantTruck(trailer);
    if (pinned) {
        seen.add(pinned.id);
        candidates.push(pinned);
    }
    for (let i = 0; i < creeps.length; i++) {
        const creep = creeps[i];
        if (seen.has(creep.id) || busyTrucks.has(creep.id)) continue;
        if (!canActAsTowTruck(creep, trailer)) continue;
        seen.add(creep.id);
        candidates.push(creep);
    }
    return candidates;
}

function pickTowTruck(trailer, candidates) {
    if (!candidates.length) return null;

    const trailerWeight = getCreepMoveWeight(trailer);
    const pinned = padOccupantTruck(trailer);
    let best = null;
    let bestScore = Infinity;
    let bestCapable = false;

    for (let i = 0; i < candidates.length; i++) {
        const truck = candidates[i];
        if (pinned && truck.id === pinned.id) {
            best = truck;
            bestScore = -1;
            bestCapable = true;
            continue;
        }
        const stats = towPullStats(truck, trailerWeight);
        // A 1-MOVE creep on a 50-part trailer crawls for the whole haul.
        if (stats.gap > MAX_TOW_PLAINS_GAP) continue;
        const capable = stats.gap === 0;
        if (!capable && bestCapable) continue;
        const range = trailer.pos.getRangeTo(truck);
        // One tile of distance beats any spare-MOVE advantage. Margin only
        // breaks a tie so a far hauler is not pulled off its route.
        const score = range * 100 - Math.max(-20, Math.min(stats.margin, 20));
        if ((capable && !bestCapable) || score < bestScore) {
            best = truck;
            bestScore = score;
            bestCapable = capable;
        }
    }
    return best;
}

function adjustMovement(truck, trailer) {
    const range = trailer.pos.getRangeTo(truck);
    const rt = towRuntime(truck);
    if (rt.lastRangeToTrailer && rt.lastRangeToTrailer < 5 && rt.lastRangeToTrailer < range) {
        clearShibMove(truck);
    }
    rt.lastRangeToTrailer = range;
}

// Range 0 needs the truck on the tile, then a swap. A 0-MOVE creep already
// standing there is the blocker. A MOVE creep on the tile is the swap partner.
function rangeZeroPadBlocked(trailer, towDestination) {
    const opts = trailer.memory.towOptions;
    if (!opts || opts.range !== 0 || !towDestination) return false;
    if (towDestination.roomName !== trailer.pos.roomName) return false;
    if (!trailer.pos.isNearTo(towDestination)) return false;
    const occupant = towDestination.checkForCreep && towDestination.checkForCreep();
    if (!occupant || occupant.id === trailer.id) return false;
    if (trailer.memory.towCreep && occupant.id === trailer.memory.towCreep) return false;
    if (padOccupantTruck(trailer)) return false;
    return true;
}

function releasePadWait(trailer) {
    const truckId = trailer.memory.towCreep;
    if (!truckId) return;
    const truck = Game.getObjectById(truckId);
    if (truck && truck.memory.trailer === trailer.id) releaseTruckRef(truck);
    trailer.memory.towCreep = undefined;
}

function tryTowHandoff(truck, trailer, towDestination, targetRange) {
    const trailerDist = trailer.pos.getRangeTo(towDestination);
    const truckDist = truck.pos.getRangeTo(towDestination);

    if (trailerDist <= targetRange) return false;
    if (!truck.pos.isNearTo(trailer)) return false;

    const onHandoffTile = targetRange === 0
        ? truck.pos.isEqualTo(towDestination)
        : truckDist <= targetRange;

    if (!onHandoffTile) return false;

    // Swap this tick. A pause left the truck sitting on the pad while the
    // harvester, running later, cancelled the tow and blocked the exit.
    towRuntime(truck).towAtRing = undefined;
    const dir = truck.pos.getDirectionTo(trailer);
    if (dir) truck.move(dir);
    return true;
}

function moveToTowDestination(truck, trailer, towDestination) {
    const opts = trailer.memory.towOptions || {range: 1};
    const targetRange = opts.range ?? 1;

    if (tryTowHandoff(truck, trailer, towDestination, targetRange)) return;

    towRuntime(truck).towAtRing = undefined;
    clearShibMove(trailer);
    truck.shibMove(towDestination, {...opts, range: targetRange});
}


const TOW_LINK_STYLE = {
    active: {line: '#f39c12', truck: '#e67e22', trailer: '#fdebd0', badge: '#d35400', glyph: '⇄'},
    handoff: {line: '#f1c40f', truck: '#f39c12', trailer: '#fcf3cf', badge: '#b7950b', glyph: '↻'},
    pending: {line: '#5dade2', truck: '#3498db', trailer: '#d6eaf8', badge: '#2874a6', glyph: '…'},
};

function towPairKey(a, b) {
    return a < b ? a + ':' + b : b + ':' + a;
}

function towLinkVisualState(truck, trailer) {
    if (!isPairedTow(truck, trailer)) return 'pending';
    if (towRuntime(truck).towAtRing) return 'handoff';
    return 'active';
}

function drawTowLink(room, truck, trailer) {
    if (!room?.visual || !truck?.pos || !trailer?.pos) return;
    if (truck.pos.roomName !== room.name || trailer.pos.roomName !== room.name) return;

    const state = towLinkVisualState(truck, trailer);
    const style = TOW_LINK_STYLE[state];
    const dashed = state !== 'active';

    room.visual.line(truck.pos.x, truck.pos.y, trailer.pos.x, trailer.pos.y, {
        color: style.line,
        opacity: dashed ? 0.55 : 0.9,
        width: dashed ? 0.09 : 0.14,
        lineStyle: dashed ? 'dashed' : undefined,
    });

    room.visual.circle(truck.pos, {
        radius: 0.28,
        fill: style.truck,
        opacity: 0.75,
        stroke: '#ffffff',
        strokeWidth: 0.06,
    });
    room.visual.circle(trailer.pos, {
        radius: 0.22,
        fill: style.trailer,
        opacity: 0.85,
        stroke: style.line,
        strokeWidth: 0.05,
    });

    const mx = (truck.pos.x + trailer.pos.x) / 2;
    const my = (truck.pos.y + trailer.pos.y) / 2 - 0.05;
    room.visual.text(style.glyph, mx, my, {
        color: '#ffffff',
        font: 'bold 0.42 Arial',
        opacity: 0.95,
        backgroundColor: style.badge,
        backgroundPadding: 0.1,
    });
}

function drawTowLinksForRoom(room) {
    if (!room?.myCreeps?.length) return;
    const drawn = new Set();

    for (const trailer of room.myCreeps) {
        const truckId = trailer.memory.towCreep;
        if (!truckId) continue;
        const truck = Game.getObjectById(truckId);
        if (!truck) continue;
        const key = towPairKey(truck.id, trailer.id);
        if (drawn.has(key)) continue;
        drawn.add(key);
        drawTowLink(room, truck, trailer);
    }
}


function assignTowForTrailer(trailer, busyTrucks) {
    const room = trailer.room;
    if (!room || !needsTow(trailer) || !trailer.memory.towDestination) return false;

    if (rangeZeroPadBlocked(trailer, getTowDestination(trailer))) {
        releasePadWait(trailer);
        return false;
    }

    if (!busyTrucks) {
        busyTrucks = new Set();
        for (const creep of room.myCreeps) {
            if (creep.memory.trailer) busyTrucks.add(creep.id);
        }
    }

    const existingId = trailer.memory.towCreep;
    const existing = existingId ? Game.getObjectById(existingId) : null;
    if (pairStillGood(existing, trailer)) return true;

    if (existing) {
        if (existing.memory.trailer === trailer.id) releaseTruckRef(existing);
        trailer.memory.towCreep = undefined;
    }

    const truck = pickTowTruck(trailer, gatherTowTruckCandidates(room, trailer, busyTrucks));
    if (!truck) return false;

    trailer.memory.towCreep = truck.id;
    truck.memory.trailer = trailer.id;
    busyTrucks.add(truck.id);
    return true;
}

function assignTowsForRoom(room) {
    sweepTowRuntime();
    if (!room?.myCreeps?.length) return;

    let needsAny = false;
    for (const creep of room.myCreeps) {
        if (needsTow(creep) && creep.memory.towDestination) {
            needsAny = true;
            break;
        }
    }
    if (!needsAny) return;

    const busyTrucks = new Set();
    for (const creep of room.myCreeps) {
        if (creep.memory.trailer) busyTrucks.add(creep.id);
    }

    for (const trailer of room.myCreeps) {
        assignTowForTrailer(trailer, busyTrucks);
    }

    if (typeof PATHING_DEBUG !== 'undefined' && PATHING_DEBUG) drawTowLinksForRoom(room);
}

function boosterWaitingOffLab(trailer) {
    const boosts = trailer && trailer.memory && trailer.memory.boosts;
    if (!boosts || !boosts.labs) return false;
    for (const key in boosts.labs) {
        const lab = Game.getObjectById(boosts.labs[key]);
        if (lab && trailer.pos.getRangeTo(lab) > 1) return true;
    }
    return false;
}

function dropTruck(truck, trailer) {
    releaseTruckRef(truck);
    if (trailer && trailer.memory.towCreep === truck.id) trailer.memory.towCreep = undefined;
}

function runTowTruck(truck) {
    if (!truck.memory.trailer) return false;
    const trailer = Game.getObjectById(truck.memory.trailer);
    if (!trailer) {
        endTow(truck, null);
        return false;
    }

    if (trailer.pos.roomName !== truck.pos.roomName) {
        dropTruck(truck, trailer);
        return false;
    }

    if (!pairStillGood(truck, trailer)) {
        dropTruck(truck, trailer);
        return false;
    }

    // labTech filling the booster's lab beats towing them back onto the pad.
    if (truck.memory.role === 'labTech' && boosterWaitingOffLab(trailer)) {
        endTow(truck, trailer);
        return false;
    }

    const towDestination = getTowDestination(trailer);
    if (!towDestination) {
        endTow(truck, trailer);
        return false;
    }

    if (rangeZeroPadBlocked(trailer, towDestination)) {
        dropTruck(truck, trailer);
        return false;
    }

    const rt = towRuntime(truck);
    if (!rt.towStart) {
        rt.towStart = Game.time;
        rt.lastTowProgress = Game.time;
    }

    // Fatigue is the wait between steps. Counting it as a stall ended the
    // haul on the tick the truck could move again.
    if (truck.fatigue) {
        rt.lastTowProgress = Game.time;
        return true;
    }

    const currentDist = towSeparation(trailer.pos, towDestination);
    const posKey = trailer.pos.x + ',' + trailer.pos.y + ',' + trailer.pos.roomName;
    if (rt.lastTowDist === undefined || currentDist < rt.lastTowDist) {
        rt.lastTowDist = currentDist;
        rt.lastTowProgress = Game.time;
    } else if (towDestination.roomName !== trailer.pos.roomName
        && rt.lastPosKey && rt.lastPosKey !== posKey) {
        // A detour can walk away from the exit without being stuck.
        rt.lastTowProgress = Game.time;
    }
    rt.lastPosKey = posKey;

    if (shouldEndTow(truck, trailer, towDestination)) {
        endTow(truck, trailer);
        return false;
    }

    const pullResult = truck.pull(trailer);
    if (pullResult === ERR_NOT_IN_RANGE) {
        adjustMovement(truck, trailer);
        truck.shibMove(trailer, {range: 1});
        return true;
    }

    if (pullResult === OK) {
        trailer.move(truck);
        moveToTowDestination(truck, trailer, towDestination);
        return true;
    }

    // NOT_IN_RANGE is the only retry. Other results (unsupported pull, tired
    // trailer) used to skip the truck's role for 3 ticks, then re-pair forever.
    endTow(truck, trailer);
    return false;
}

module.exports = {
    needsTow,
    requestTow,
    assignTowsForRoom,
    runTowTruck,
};