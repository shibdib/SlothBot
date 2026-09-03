/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Towing for immobile creeps (0 active MOVE). Truck pulls; trailer follows.
 */

const {
    getCreepMoveWeight,
    needsTow,
    canActAsTowTruck,
    endTow,
    releaseTruckRef,
    clearTrailerTowState,
    clearShibMove,
} = require('pathUtils');

const STALL_LIMIT = 30;
const PULL_FAIL_LIMIT = 3;

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

function shouldEndTow(truck, trailer, towDestination) {
    const lastProgress = truck.memory.lastTowProgress || truck.memory.towStart || Game.time;
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

function refreshTowDestination(trailer, heading, options) {
    trailer.memory.towDestination = heading.id || heading;
    trailer.memory.towOptions = options;
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
        if (!isPairedTow(truck, trailer)) {
            if (truck && truck.memory.trailer === trailer.id) releaseTruckRef(truck);
            trailer.memory.towCreep = undefined;
        }
    }

    const range = options.range ?? 1;
    if (trailer.pos.getRangeTo(heading) <= range) {
        clearTrailerTowState(trailer);
        return false;
    }

    refreshTowDestination(trailer, heading, options);
    assignTowForTrailer(trailer);
    return true;
}

function isPairedTow(truck, trailer) {
    return truck && trailer
        && truck.memory.trailer === trailer.id
        && trailer.memory.towCreep === truck.id
        && truck.pos.roomName === trailer.pos.roomName;
}

function gatherTowTruckCandidates(room, trailer, busyTrucks) {
    if (!room) return [];
    const candidates = room.myCreeps.filter(c =>
        canActAsTowTruck(c, trailer) && !busyTrucks.has(c.id)
    );
    candidates.sort((a, b) => {
        const aTow = a.memory.canTow ? 0 : 1;
        const bTow = b.memory.canTow ? 0 : 1;
        if (aTow !== bTow) return aTow - bTow;
        const aLoad = a.store.getUsedCapacity() ? 1 : 0;
        const bLoad = b.store.getUsedCapacity() ? 1 : 0;
        if (aLoad !== bLoad) return aLoad - bLoad;
        return trailer.pos.getRangeTo(a) - trailer.pos.getRangeTo(b);
    });
    return candidates;
}

function pickTowTruck(trailer, candidates) {
    if (!candidates.length) return null;

    const trailerWeight = getCreepMoveWeight(trailer);
    let best = null;
    let bestScore = -Infinity;

    for (const truck of candidates) {
        const move = truck.getActiveBodyparts(MOVE);
        const margin = move - getCreepMoveWeight(truck) - trailerWeight;
        const capable = margin >= 0;
        // Prefer trucks that can pull at full speed; otherwise take the least underpowered nearby mover.
        const score = (capable ? 10000 : 0) + margin * 100 - trailer.pos.getRangeTo(truck);
        if (score > bestScore) {
            bestScore = score;
            best = truck;
        }
    }
    return best;
}

function adjustMovement(truck, trailer) {
    const range = trailer.pos.getRangeTo(truck);
    if (truck.memory.lastRangeToTrailer
        && truck.memory.lastRangeToTrailer < 5
        && truck.memory.lastRangeToTrailer < range) {
        clearShibMove(truck);
    }
    truck.memory.lastRangeToTrailer = range;
}

function relaxRangeZeroOccupant(trailer, towDestination) {
    if (trailer.memory.towOptions?.range !== 0) return;
    if (!trailer.pos.isNearTo(towDestination)) return;
    const occupant = towDestination.checkForCreep();
    if (!occupant || occupant.id === trailer.id) return;
    // The tow truck must stand on the tile during a range-0 handoff — not a blocker.
    if (trailer.memory.towCreep && occupant.id === trailer.memory.towCreep) return;
    trailer.memory.towOptions.range = 1;
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

    if (!truck.memory.towAtRing) {
        truck.memory.towAtRing = true;
        truck.memory.lastTowProgress = Game.time;
        return true;
    }

    truck.memory.towAtRing = undefined;
    const dir = truck.pos.getDirectionTo(trailer);
    if (dir) truck.move(dir);
    return true;
}

function moveToTowDestination(truck, trailer, towDestination) {
    const opts = trailer.memory.towOptions || {range: 1};
    const targetRange = opts.range ?? 1;
    const trailerDist = trailer.pos.getRangeTo(towDestination);

    if (trailerDist <= targetRange) {
        truck.memory.towAtRing = undefined;
        if (truck.pos.isNearTo(trailer)) {
            const dir = truck.pos.getDirectionTo(trailer);
            if (dir) truck.move(dir);
        }
        return;
    }

    if (tryTowHandoff(truck, trailer, towDestination, targetRange)) return;

    truck.memory.towAtRing = undefined;
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
    if (truck.memory.towAtRing) return 'handoff';
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

    if (!busyTrucks) {
        busyTrucks = new Set();
        for (const creep of room.myCreeps) {
            if (creep.memory.trailer) busyTrucks.add(creep.id);
        }
    }

    const existingId = trailer.memory.towCreep;
    const existing = existingId ? Game.getObjectById(existingId) : null;
    if (isPairedTow(existing, trailer)) return true;

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

    drawTowLinksForRoom(room);
}

function runTowTruck(truck) {
    if (!truck.memory.trailer) return false;
    const trailer = Game.getObjectById(truck.memory.trailer);
    if (!trailer) {
        endTow(truck, null);
        return false;
    }

    if (trailer.pos.roomName !== truck.pos.roomName) {
        releaseTruckRef(truck);
        return false;
    }

    if (!isPairedTow(truck, trailer)) {
        releaseTruckRef(truck);
        if (trailer.memory.towCreep === truck.id) trailer.memory.towCreep = undefined;
        return false;
    }

    if (truck.store.getUsedCapacity()) {
        releaseTruckRef(truck);
        if (trailer.memory.towCreep === truck.id) trailer.memory.towCreep = undefined;
        return false;
    }

    if (!truck.memory.towStart) {
        truck.memory.towStart = Game.time;
        truck.memory.lastTowProgress = Game.time;
        truck.memory.lastTowDist = undefined;
    }
    if (truck.fatigue) return true;

    const towDestination = getTowDestination(trailer);
    if (!towDestination) {
        endTow(truck, trailer);
        return false;
    }

    const currentDist = trailer.pos.getRangeTo(towDestination);
    if (truck.memory.lastTowDist === undefined || currentDist < truck.memory.lastTowDist) {
        truck.memory.lastTowDist = currentDist;
        truck.memory.lastTowProgress = Game.time;
    }

    relaxRangeZeroOccupant(trailer, towDestination);

    if (shouldEndTow(truck, trailer, towDestination)) {
        endTow(truck, trailer);
        return false;
    }

    const pullResult = truck.pull(trailer);
    if (pullResult === ERR_NOT_IN_RANGE) {
        truck.memory.pullFailStreak = 0;
        adjustMovement(truck, trailer);
        truck.shibMove(trailer, {range: 1});
        return true;
    }

    if (pullResult === OK) {
        truck.memory.pullFailStreak = 0;
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