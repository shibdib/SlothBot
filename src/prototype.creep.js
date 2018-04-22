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
            delete this.idle;
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
        delete this.idle;
    }
};

Creep.prototype.borderCheck = function () {
    if (this.pos.x === 0 || this.pos.y === 0 || this.pos.x === 49 || this.pos.y === 49) {
        if (this.pos.x === 0 && this.pos.y === 0) {
            this.move(BOTTOM_RIGHT);
        }
        else if (this.pos.x === 0 && this.pos.y === 49) {
            this.move(TOP_RIGHT);
        }
        else if (this.pos.x === 49 && this.pos.y === 0) {
            this.move(BOTTOM_LEFT);
        }
        else if (this.pos.x === 49 && this.pos.y === 49) {
            this.move(TOP_LEFT);
        }
        else if (this.pos.x === 49) {
            if (Math.random() < .33) {
                this.move(LEFT)
            } else if (Math.random() < .33) {
                this.move(TOP_LEFT)
            } else {
                this.move(BOTTOM_LEFT)
            }
        }
        else if (this.pos.x === 0) {
            if (Math.random() < .33) {
                this.move(RIGHT)
            } else if (Math.random() < .33) {
                this.move(TOP_RIGHT)
            } else {
                this.move(BOTTOM_RIGHT)
            }
        }
        else if (this.pos.y === 0) {
            if (Math.random() < .33) {
                this.move(BOTTOM)
            } else if (Math.random() < .33) {
                this.move(BOTTOM_RIGHT)
            } else {
                this.move(BOTTOM_LEFT)
            }
        }
        else if (this.pos.y === 49) {
            if (Math.random() < .33) {
                this.move(TOP)
            } else if (Math.random() < .33) {
                this.move(TOP_RIGHT)
            } else {
                this.move(TOP_LEFT)
            }
        }
        return true;
    }
};

Creep.prototype.renewalCheck = function (level = 8, cutoff = 100, target = 1000, force = false) {
    if (Game.rooms[this.memory.overlord].controller.level >= level && (this.ticksToLive < cutoff || this.memory.renewing) && Game.rooms[this.memory.overlord].energyAvailable >= Game.rooms[this.memory.overlord].energyCapacity * 0.5) {
        if (this.ticksToLive >= target) {
            delete this.memory.boostAttempt;
            delete this.memory.renewingTarget;
            return delete this.memory.renewing;
        }
        let spawn = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_SPAWN && (!s.spawning || force) && (!_.filter(this.room.creeps, (c) => c.memory && c.memory.renewingTarget === s.id && c.id !== this.id)[0] || force))[0];
        if (spawn) {
            switch (spawn.renewCreep(this)) {
                case OK:
                    if (this.carry[RESOURCE_ENERGY] > 0 && !spawn.spawning) this.transfer(spawn, RESOURCE_ENERGY);
                    this.say(ICONS.renew);
                    this.memory.renewingTarget = spawn.id;
                    this.memory.renewing = true;
                    return true;
                case ERR_NOT_IN_RANGE:
                    this.memory.renewingTarget = spawn.id;
                    this.memory.renewing = true;
                    this.shibMove(spawn);
                    return true;
            }
        }
    }
    delete this.memory.renewing;
    return false;
};

Creep.prototype.tryToBoost = function (boosts) {
    let labs = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_LAB && !s.memory.active);
    if ((!labs[0] || this.memory.boostAttempt) && !this.memory.boostLab) return this.memory.boostAttempt = true;
    if (!this.memory.requestedBoosts) {
        let available = [];
        let boostNeeded;
        for (let key in boosts) {
            let boostInRoom;
            switch (boosts[key]) {
                case 'attack':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_UTRIUM_ACID);
                    boostNeeded = this.getActiveBodyparts(ATTACK) * 30;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_UTRIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_UTRIUM_ACID) >= boostNeeded) {
                        available.push(RESOURCE_UTRIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_UTRIUM_HYDRIDE) >= boostNeeded) {
                        available.push(RESOURCE_UTRIUM_HYDRIDE);
                    }
                    continue;
                case 'upgrade':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_GHODIUM_ACID);
                    boostNeeded = this.getActiveBodyparts(WORK) * 30;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_GHODIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_GHODIUM_ACID) >= boostNeeded) {
                        available.push(RESOURCE_GHODIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_GHODIUM_HYDRIDE) >= boostNeeded) {
                        available.push(RESOURCE_GHODIUM_HYDRIDE);
                    }
                    continue;
                case 'tough':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_GHODIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(TOUGH) * 30;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_GHODIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_GHODIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_GHODIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_GHODIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_GHODIUM_OXIDE);
                    }
                    continue;
                case 'ranged':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_KEANIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(RANGED_ATTACK) * 30;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_KEANIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_KEANIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_KEANIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_KEANIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_KEANIUM_OXIDE);
                    }
                    continue;
                case 'heal':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(HEAL) * 30;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_LEMERGIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_LEMERGIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_LEMERGIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_LEMERGIUM_OXIDE);
                    }
                    continue;
                case 'build':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_LEMERGIUM_ACID);
                    boostNeeded = this.getActiveBodyparts(WORK) * 30;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_LEMERGIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_LEMERGIUM_ACID) >= boostNeeded) {
                        available.push(RESOURCE_LEMERGIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_LEMERGIUM_HYDRIDE) >= boostNeeded) {
                        available.push(RESOURCE_LEMERGIUM_HYDRIDE);
                    }
                    continue;
                case 'move':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(MOVE) * 30;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_ZYNTHIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_ZYNTHIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_ZYNTHIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_ZYNTHIUM_OXIDE);
                    }
                    continue;
                case 'dismantle':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_ZYNTHIUM_ACID);
                    boostNeeded = this.getActiveBodyparts(WORK) * 30;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_ZYNTHIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_ZYNTHIUM_ACID) >= boostNeeded) {
                        available.push(RESOURCE_ZYNTHIUM_ACID);
                    } else if (getBoostAmount(this.room, RESOURCE_ZYNTHIUM_HYDRIDE) >= boostNeeded) {
                        available.push(RESOURCE_ZYNTHIUM_HYDRIDE);
                    }
            }
        }
        this.memory.requestedBoosts = available;
    } else {
        if (this.memory.requestedBoosts.length === 0 || !this.memory.requestedBoosts.length || this.ticksToLive < 750) {
            this.memory.requestedBoosts = undefined;
            this.memory.boostLab = undefined;
            this.memory.boostNeeded = undefined;
            let lab = Game.getObjectById(this.memory.boostLab);
            if (lab) {
                lab.memory = undefined;
            }
            return this.memory.boostAttempt = true;
        }
        for (let key in this.memory.requestedBoosts) {
            let boostInRoom = getBoostAmount(this.room, this.memory.requestedBoosts[key]);
            if (boostInRoom < this.memory.boostNeeded) {
                this.memory.requestedBoosts.shift();
                let lab = Game.getObjectById(this.memory.boostLab);
                if (lab) {
                    lab.memory = undefined;
                }
                this.memory.boostLab = undefined;
                this.memory.boostNeeded = undefined;
                continue;
            }
            if (!this.memory.boostLab) {
                let filledLab = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.mineralType === this.memory.requestedBoosts[key] && s.energy > 0)[0];
                if (filledLab) {
                    this.memory.boostLab = filledLab.id;
                    filledLab.memory.neededBoost = this.memory.requestedBoosts[key];
                    filledLab.memory.active = true;
                    filledLab.memory.requested = Game.time;
                } else {
                    let availableLab = shuffle(_.filter(this.room.structures, (s) => s.structureType === STRUCTURE_LAB && !s.memory.active && s.energy > 0))[0];
                    if (availableLab) {
                        this.memory.boostLab = availableLab.id;
                        availableLab.memory.neededBoost = this.memory.requestedBoosts[key];
                        availableLab.memory.active = true;
                        availableLab.memory.requested = Game.time;
                    } else {
                        this.memory.requestedBoosts = undefined;
                        this.memory.boostLab = undefined;
                        this.memory.boostNeeded = undefined;
                        let lab = Game.getObjectById(this.memory.boostLab);
                        if (lab) {
                            lab.memory = undefined;
                        }
                        return this.memory.boostAttempt = true;
                    }
                }
            }
            let lab = Game.getObjectById(this.memory.boostLab);
            if (!lab.memory || !lab.memory.neededBoost) {
                this.memory.requestedBoosts.shift();
                lab.memory = undefined;
                this.memory.boostLab = undefined;
                this.memory.boostNeeded = undefined;
                return;
            }
            if (lab && lab.mineralType === lab.memory.neededBoost && lab.energy > 0 && lab.mineralAmount >= 0) {
                switch (lab.boostCreep(this)) {
                    case OK:
                        lab.memory = undefined;
                        this.memory.requestedBoosts.shift();
                        if (this.memory.requestedBoosts.length) {
                            this.memory.boostNeeded = this.memory.requestedBoosts[0];
                            lab.memory.neededBoost = this.memory.requestedBoosts[0];
                            lab.memory.active = true;
                            lab.memory.requested = Game.time;
                        }
                        this.say(ICONS.greenCheck);
                        return this.shibMove(lab);
                    case ERR_NOT_IN_RANGE:
                        this.say(ICONS.boost);
                        return this.shibMove(lab);
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.say(ICONS.boost);
                        return this.shibMove(lab);
                }
            } else {
                return this.shibMove(lab);
            }
        }
    }
};

function getBoostAmount(room, boost) {
    let boostInRoomStructures = _.sum(room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
        if (s['structure'] && s['structure'].store) {
            return s['structure'].store[boost] || 0;
        } else if (s['structure'] && s['structure'].mineralType === boost) {
            return s['structure'].mineralAmount || 0;
        } else {
            return 0;
        }
    });
    let boostInRoomCreeps = _.sum(room.lookForAtArea(LOOK_CREEPS, 0, 0, 49, 49, true), (s) => {
        if (s['creep'] && s['creep'].carry) {
            return s['creep'].carry[boost] || 0;
        } else {
            return 0;
        }
    });
    return boostInRoomCreeps + boostInRoomStructures;
}

Creep.prototype.repairRoad = function () {
    if (this.carry[RESOURCE_ENERGY] < 10 || this.getActiveBodyparts(WORK) === 0) return;
    let road = _.filter(this.pos.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.70)[0];
    if (road) return this.repair(road);
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

Creep.prototype.reportDamage = function () {
    if (!this.memory._lastHits) {
        return this.memory._lastHits = this.hits;
    }
    if (this.hits < this.memory._lastHits) {
        if (this.room.controller && ((this.room.controller.owner && this.room.controller.owner.username !== USERNAME) || (this.room.controller.reservation && this.room.controller.reservation.username !== USERNAME)) && this.memory.targetRoom !== this.room.name) return false;
        let nearbyCreeps = _.uniq(_.pluck(_.filter(this.room.creeps, (c) => c.pos.getRangeTo(this) <= 3 && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper' && c.owner.username !== USERNAME), 'owner.username'));
        if (nearbyCreeps.length) {
            for (let key in nearbyCreeps) {
                let user = nearbyCreeps[key];
                let cache = Memory._badBoyList || {};
                let threatRating;
                if (cache[user]) {
                    if (cache[user].lastAction + 10 > Game.time) return true;
                    log.e(this.name + ' has taken damage in ' + this.room.name + '. Adjusting threat rating for ' + user);
                    if (_.includes(FRIENDLIES, user)) {
                        threatRating = cache[user]['threatRating'] + 0.1;
                    } else {
                        threatRating = cache[user]['threatRating'] + 0.5;
                    }
                } else {
                    if (_.includes(FRIENDLIES, user)) {
                        threatRating = 2.5;
                    } else {
                        threatRating = 50;
                    }
                }
                cache[user] = {
                    threatRating: threatRating,
                    lastAction: Game.time,
                };
                Memory._badBoyList = cache;
            }
        }
    }
    if (this.memory.military && ((this.memory.targetRoom && this.memory.targetRoom === this.room.name) || (this.memory.responseTarget && this.memory.responseTarget === this.room.name))) {
        let friendlyTombstones = _.pluck(_.filter(this.room.tombstones, (s) => _.includes(FRIENDLIES, s.creep.owner.username)), '.creep.name');
        let enemyTombstones = _.pluck(_.filter(this.room.tombstones, (s) => !_.includes(FRIENDLIES, s.creep.owner.username)), '.creep.name');
        let enemyDead = this.room.memory.enemyDead || [];
        this.room.memory.enemyDead = _.union(enemyDead, enemyTombstones);
        let friendlyDead = this.room.memory.friendlyDead || [];
        this.room.memory.friendlyDead = _.union(friendlyDead, friendlyTombstones);
    }
};