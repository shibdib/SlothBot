/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Guerrilla remote raiding — roam threat remotes, provoke a response, then rotate.
 */

const highCommand = require('module.highCommand');
const {collectThreatRemotes} = require('harassUtils');

const RESPONSE_ENGAGE_TICKS = 50;
const LOW_TTL = 150;

function isPlayerHostile(creep) {
    return creep.owner && creep.owner.username !== 'Invader';
}

function hasArmedHostile(room) {
    return room.hostileCreeps.some(c =>
        isPlayerHostile(c) && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK))
    );
}

function remoteHasRaidTargets(room) {
    if (room.hostileCreeps.some(isPlayerHostile)) return true;
    return room.hostileStructures.some(s =>
        s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
    );
}

function shouldRotateRemote(creep, room) {
    const other = creep.memory.other || {};
    const armed = hasArmedHostile(room);

    if (armed) {
        if (!other.responseTick) {
            creep.memory.other.responseTick = Game.time;
            if (!creep.canIWin(25) || creep.hits < creep.hitsMax) return true;
            return false;
        }
        if (!creep.canIWin(25) || creep.hits < creep.hitsMax) return true;
        if (Game.time - other.responseTick >= RESPONSE_ENGAGE_TICKS) return true;
        return false;
    }

    delete creep.memory.other.responseTick;
    return !remoteHasRaidTargets(room);
}

function pickNextRemote(creep) {
    if (!creep.memory.other) creep.memory.other = {};
    let visited = creep.memory.other.visited || [];
    let candidates = collectThreatRemotes(visited);

    if (!candidates.length && visited.length) {
        visited = [];
        creep.memory.other.visited = visited;
        candidates = collectThreatRemotes(visited);
    }
    if (!candidates.length) return null;

    const current = creep.memory.targetRoom;
    if (current) visited.push(current);

    const pick = _.sample(candidates);
    creep.memory.other.visited = visited;
    creep.memory.targetRoom = pick;
    creep.memory.destination = undefined;
    delete creep.memory.other.responseTick;
    return pick;
}

Creep.prototype.harass = function () {
    if (!this.memory.other) this.memory.other = {};
    if (!this.memory.targetRoom && this.memory.destination) this.memory.destination = undefined;

    if (this.canIWin(25) && this.handleMilitaryCreep()) return;
    this.attackInRange();

    if (this.ticksToLive <= LOW_TTL && !collectThreatRemotes().length) {
        return this.fleeHome(true);
    }

    const targetRoom = this.memory.targetRoom;

    if (!targetRoom || this.room.name !== targetRoom) {
        if (!targetRoom && !pickNextRemote(this)) return this.fleeHome(true);
        return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
    }

    highCommand.generateThreat(this);

    if (shouldRotateRemote(this, this.room)) {
        const next = pickNextRemote(this);
        if (!next) return this.fleeHome(true);
        this.say('ROTATE', true);
        log.a(`Harasser ${this.name} rotating ${roomLink(this.room.name)} → ${roomLink(next)}`, 'HARASS: ');
        return this.shibMove(new RoomPosition(25, 25, next), {range: 22});
    }
};