/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Prototype wiring for shibMove, routes, and safety checks.

 */


const {routeSafetyCache} = require('pathState');

const {normalizePos} = require('pathUtils');

const {shibMove} = require('pathMove');

const {findRoute, getRoute} = require('pathRoute');

const {getMatrix} = require('pathMatrix');


require('pathSquad');

require('pathKite');

PowerCreep.prototype.shibMove = function (destination, options = {}) {
    return shibMove(this, destination, options);
};

Creep.prototype.shibMove = function (destination, options = {}) {
    if (!options.forceSolo && (options.squad || this.memory.grouped)) return this.shibSquadMovement(destination, options);
    this.memory._shibSquadMove = undefined;
    if (this.memory.grouped) options.squad = true;
    destination = normalizePos(destination);
    if (!destination) return false;
    // If the destination is in the same room as the old destination but the old path takes it out of that room it'll refresh, avoid that and use the old destination
    if (this.memory._shibMove && this.memory._shibMove.target &&
        this.memory._shibMove.target.roomName === destination.roomName && this.memory._shibMove.target.x != null) {
        destination = new RoomPosition(this.memory._shibMove.target.x, this.memory._shibMove.target.y, this.memory._shibMove.target.roomName);
    }
    return shibMove(this, destination, options);
};

RoomPosition.prototype.shibMove = function (destination, options = {}) {
    return shibMove(this, destination, options, true);
};

Room.prototype.shibRoute = function (destination, options = {}) {
    const route = getRoute(this.name, destination);
    if (route) return route;
    return findRoute(this.name, destination, options);
};

Creep.prototype.showMatrix = function (destination, tunnel) {
    const options = {tunnel, showMatrix: true};
    return shibMove(this, destination, options);
};

Room.prototype.routeSafe = function (destination = this.name, maxThreat = 2, maxHeat = 1000, range = 20) {
    const cacheKey = `${this.name}.${destination}`;
    if (routeSafetyCache[cacheKey]?.expire > Game.time) return routeSafetyCache[cacheKey].status;

    const route = findRoute(this.name, destination);
    let safe = true;
    if (route?.length > range) safe = false;
    else if (route?.length) {
        for (const r of route) {
            const intel = INTEL[r];
            if (intel && (intel.threatLevel >= maxThreat || intel.roomHeat >= maxHeat || intel.hostilePower > intel.friendlyPower)) {
                safe = false;
                break;
            }
        }
    }

    routeSafetyCache[cacheKey] = {status: safe, expire: Game.time + 50};
    return safe;
};