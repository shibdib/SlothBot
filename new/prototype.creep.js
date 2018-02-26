/**
 * Set the unit to idle-mode until recall tick
 *
 * @type {int}
 */
Object.defineProperty(Creep.prototype, "idle", {
    configurable: true,
    get: function () {
        if (this.memory.idle === undefined) return 0;
        if (this.memory.idle <= Game.time) {
            this.idle = undefined;
            return 0;
        }
        return this.memory.idle;
    },
    set: function (val) {
        if (!val && this.memory.idle) {
            delete(this.memory.idle);
        }
        else {
            this.memory.idle = val;
        }
    }
});

/**
 * Set the unit to idle-mode for ticks given
 *
 * @type {int}
 */
Creep.prototype.idleFor = function (ticks = 0) {
    if (ticks > 0) {
        this.idle = Game.time + ticks;
    }
    else {
        this.idle = undefined;
    }
};


Creep.prototype.renewalCheck = function (level = 8) {
    let renewers = _.filter(Game.creeps, (c) => c.memory.renewing && c.memory.overlord === this.memory.overlord);
    if (Game.rooms[this.memory.overlord].controller && ((this.memory.renewing && Game.rooms[this.memory.overlord].energyAvailable >= 300) || (Game.rooms[this.memory.overlord].controller.level >= level && Game.rooms[this.memory.overlord].energyAvailable >= 300 && this.ticksToLive < 100 && renewers.length < 2))) {
        if (this.ticksToLive >= 1000) {
            this.memory.boostAttempt = undefined;
            this.memory.boosted = undefined;
            return this.memory.renewing = undefined;
        }
        let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
            if (spawn.pos.getRangeTo(this) === 1) {
                if (!spawn.spawning) spawn.renewCreep(this);
                if (this.carry[RESOURCE_ENERGY] > 0 && !spawn.spawning) this.transfer(spawn, RESOURCE_ENERGY);
                return true;
            }
            this.say(ICONS.tired);
            this.memory.renewing = true;
            return true;
        }
    }
    this.memory.renewing = undefined;
    return false;
};

Creep.prototype.getSafe = function () {
    if (this.room.memory.responseNeeded) {
        let hub = new RoomPosition(this.room.memory.extensionHub.x, this.room.memory.extensionHub.y, this.room.name);
        if (this.pos.getRangeTo(hub) > 5) {
            this.say(ICONS.withdraw);
            this.shibMove(hub, {range: 4, forceRepath: true});
            return true;
        }
        return undefined;
    }
    return undefined;
};

Creep.prototype.tryToBoost = function (boosts) {
    if (!Game.getObjectById(_.pluck(_.filter(this.room.memory.structureCache, 'type', 'lab'), 'id')[0])) return this.memory.boostAttempt = true;
    if (!this.memory.requestedBoosts) {
        this.memory.requestedBoosts = {};
        let boostObject = {
            'attack': [RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_UTRIUM_ACID, RESOURCE_UTRIUM_HYDRIDE],
            'upgrade': [RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_ACID],
            'tough': [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_GHODIUM_ALKALIDE, RESOURCE_GHODIUM_OXIDE],
            'ranged': [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_KEANIUM_OXIDE],
            'heal': [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_OXIDE],
            'dismantle': [RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_HYDRIDE]
        };
        boostType:
            for (let key in boosts) {
                let boostType = boostObject[key];
                for (let key2 in boostType) {
                    let boostInRoom = _.sum(this.room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
                        if (s['structure'] && s['structure'].store) {
                            return s['structure'].store[boostType[key2]] || 0;
                        } else {
                            return 0;
                        }
                    });
                    if (boostInRoom > 500) {
                        this.memory.requestedBoosts.boostType = boostType[key2];
                        continue boostType;
                    }
                }
            }
    } else if (!this.memory.boostAttempt) {
        if (this.memory.requestedBoosts.length === 0) {
            this.memory.requestedBoosts = undefined;
            return this.memory.boostAttempt = true;
        }
        for (let key in this.memory.requestedBoosts) {
            let lab = this.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.store[this.memory.requestedBoosts[key]] >= 500})[0];
            if (lab) {
                switch (lab.boostCreep(this)) {
                    case OK:
                        delete this.memory.requestedBoosts[key];
                        break;
                    case ERR_NOT_IN_RANGE:
                        this.shibMove(lab);
                }
            }
            let boostInRoom = _.sum(this.room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
                if (s['structure'] && s['structure'].store) {
                    return s['structure'].store[this.memory.requestedBoosts[key]] || 0;
                } else {
                    return 0;
                }
            });
            if (boostInRoom > 500) {
                delete this.memory.requestedBoosts[key];
            }
        }
    }
};

Object.defineProperty(Creep.prototype, 'isFull', {
    get: function () {
        if (!this._isFull) {
            this._isFull = _.sum(this.carry) > this.carryCapacity * 0.8;
        }
        return this._isFull;
    },
    enumerable: false,
    configurable: true
});