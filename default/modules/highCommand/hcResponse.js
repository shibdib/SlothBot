/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Idle military responder dispatch.

 */


const {getMilitaryCreeps} = require('hcUtils');

const MAX_RESPONSE_DISTANCE = 5;

const TRAVEL_TICKS_PER_ROOM = 50;

const RESPONSE_DISPATCH_TTL = 200;

const ROUTE_CACHE_TTL = 50;
const routeDistCache = Object.create(null);

function responseRouteDistance(from, to) {
    if (from === to) return 0;
    if (Game.map.getRoomLinearDistance(from, to) > MAX_RESPONSE_DISTANCE) return Infinity;
    const key = from + '_' + to;
    const hit = routeDistCache[key];
    if (hit && hit.tick + ROUTE_CACHE_TTL > Game.time) return hit.d;
    const route = Game.map.findRoute(from, to);
    const d = typeof route === 'number' ? Infinity : route.length;
    routeDistCache[key] = {d, tick: Game.time};
    return d;
}

function manageResponseForces() {
    const pool = getMilitaryCreeps();
    const idleResponders = [];
    const activeResponders = [];
    const patrols = [];
    for (let i = 0; i < pool.length; i++) {
        const c = pool[i];
        if (!c.memory) continue;
        if (c.memory.awaitingOrders && (!c.memory.partner || c.memory.leader)) idleResponders.push(c);
        else if (!c.memory.awaitingOrders) activeResponders.push(c);
        if (c.memory.destination && c.memory.operation === 'borderPatrol') patrols.push(c);
    }
    if (!idleResponders.length) return;

    const target = getPriorityTarget();

    trackPower(patrols);

    function getPriorityTarget() {
        const potential = [];

        // Use indexes to avoid full INTEL scan for response priorities
        const idx = global.getIntelIndexes ? global.getIntelIndexes(Game.time) : {};
        const ct = Game.time;
        const responseStaleCheck = (r) => !r.responseDispatched || r.responseDispatched + RESPONSE_DISPATCH_TTL < ct;
        for (const rName of (idx.requestingSupport || [])) {
            const r = INTEL[rName];
            if (!r) continue;
            let prio = 10;
            if (r.owner === MY_USERNAME) prio += 5;
            potential.push({type: 'ownedRoomAttack', room: rName, priority: prio});
        }
        for (const rName of (idx.threats || [])) {
            const r = INTEL[rName];
            if (!r) continue;
            const responseStale = responseStaleCheck(r);
            if (r.threatLevel > 1 && (r.activeRemote || 0) + CREEP_LIFE_TIME > ct &&
                (responseStale || r.friendlyPower < r.hostilePower)) {
                const dist = findClosestOwnedRoom(rName, true);
                if (dist <= 2) potential.push({type: 'remoteRoomAttack', room: rName, priority: 9 - dist});
            }
        }
        for (const rName of (idx.invaderCores || [])) {
            const r = INTEL[rName];
            if (!r) continue;
            if (r.invaderCore && (r.activeRemote || 0) + CREEP_LIFE_TIME > ct && responseStaleCheck(r)) {
                potential.push({type: 'invaderCore', room: rName, priority: 8});
            }
            if (r.threatLevel === 1 && (r.activeRemote || 0) + CREEP_LIFE_TIME > ct && responseStaleCheck(r)) {
                potential.push({type: 'unarmedVisitors', room: rName, priority: 7});
            }
        }

        return _.max(potential, 'priority');
    }

    function assignRespondersToTarget(targetRoom, logMessage, requiredPower) {
        let responsePower = 0;
        for (const creep of activeResponders.filter(c => c.memory.destination === targetRoom)) {
            responsePower += creep.combatPower;
        }

        const candidates = [];
        for (const creep of idleResponders) {
            const distance = responseRouteDistance(creep.pos.roomName, targetRoom);
            if (distance > MAX_RESPONSE_DISTANCE) continue;

            const ttl = creep.ticksToLive === undefined ? CREEP_LIFE_TIME : creep.ticksToLive;
            if (ttl < distance * TRAVEL_TICKS_PER_ROOM + 50) continue;

            candidates.push({creep, distance});
        }

        candidates.sort((a, b) => a.distance - b.distance);

        let assigned = 0;
        for (const {creep} of candidates) {
            if (assigned > 0 && responsePower >= requiredPower) break;

            responsePower += creep.combatPower;
            creep.memory.destination = targetRoom;
            creep.memory.awaitingOrders = undefined;
            if (creep.clearShibMove) creep.clearShibMove();
            else delete creep.memory._shibMove;
            creep.idle = 0;
            assigned++;

            if (creep.room.name !== targetRoom) {
                log.a(`${creep.name} ${logMessage} ${roomLink(targetRoom)} from ${roomLink(creep.room.name)}`);
            }
        }
        return assigned > 0;
    }

    if (target) {
        let dispatched = false;

        switch (target.type) {
            case 'ownedRoomAttack':
                dispatched = assignRespondersToTarget(target.room, 'reassigned to assist in the defense of', INTEL[target.room].hostilePower || 0);
                break;
            case 'remoteRoomAttack':
                dispatched = assignRespondersToTarget(target.room, 'reassigned to re-secure', INTEL[target.room].hostilePower || 0);
                break;
            case 'invaderCore':
                dispatched = assignRespondersToTarget(target.room, 'reassigned to deal with invader core in', 50);
                break;
            case 'unarmedVisitors':
                dispatched = assignRespondersToTarget(target.room, 'investigating for possible trespassers at', 0);
                break;
            case 'guard':
                dispatched = assignRespondersToTarget(target.room, 'reassigned to help guard', 0);
                break;
        }

        if (dispatched && INTEL[target.room]) {
            INTEL[target.room].responseDispatched = Game.time;
        }
    }

    function trackPower(patrols) {
        if (!patrols || !patrols.length) return;
        const incoming = {};

        for (const patrol of patrols) {
            const dest = patrol.memory.destination;
            if (!incoming[dest]) incoming[dest] = {power: 0, room: dest};

            const ap = abilityPower(patrol.body);
            incoming[dest].power += ap.attack + ap.effectiveHeal + (ap.defense / 100);
        }

        for (const key in incoming) {
            if (!INTEL[key]) {
                INTEL[key] = {};
                if (global.updateIntelIndex) global.updateIntelIndex(key, null, INTEL[key]);
            }
            const existing = INTEL[key].friendlyPower || 0;
            INTEL[key].friendlyPower = Math.max(existing, incoming[key].power);
        }
    }
}

module.exports = {

    manageResponseForces,

};