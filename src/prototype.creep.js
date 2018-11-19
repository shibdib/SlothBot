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
        this.say(_.sample([ICONS.wait23, ICONS.wait21, ICONS.wait19, ICONS.wait17, ICONS.wait13, ICONS.wait11, ICONS.wait7, ICONS.wait10, ICONS.wait3, ICONS.wait1]), true);
        if (this.pos.checkForRoad() && this.memory.role !== 'stationaryHarvester') {
            this.moveRandom();
        } else {
            return this.memory.idle;
        }
    },
    set: function (val) {
        if (!val && this.memory.idle) {
            delete(this.memory.idle);
        } else {
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
    } else {
        delete this.idle;
    }
};

Creep.prototype.borderCheck = function () {
    let thisPos = this.pos;
    let x = thisPos.x;
    let y = thisPos.y;
    if (x === 0 || y === 0 || x === 49 || y === 49) {
        if (x === 0 && y === 0) {
            return this.move(BOTTOM_RIGHT);
        }
        else if (x === 0 && y === 49) {
            return this.move(TOP_RIGHT);
        }
        else if (x === 49 && y === 0) {
            return this.move(BOTTOM_LEFT);
        }
        else if (x === 49 && y === 49) {
            return this.move(TOP_LEFT);
        }
        let pos;
        if (x === 49) {
            pos = positionAtDirection(thisPos, LEFT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(LEFT)
            }
            pos = positionAtDirection(thisPos, TOP_LEFT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(TOP_LEFT)
            }
            return this.move(BOTTOM_LEFT)
        }
        else if (x === 0) {
            pos = positionAtDirection(thisPos, RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(RIGHT)
            }
            pos = positionAtDirection(thisPos, TOP_RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(TOP_RIGHT)
            }
            return this.move(BOTTOM_RIGHT)
        }
        else if (y === 0) {
            pos = positionAtDirection(thisPos, BOTTOM);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(BOTTOM)
            }
            pos = positionAtDirection(thisPos, BOTTOM_RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(BOTTOM_RIGHT)
            }
            return this.move(BOTTOM_LEFT)
        }
        else if (y === 49) {
            pos = positionAtDirection(thisPos, TOP);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(TOP)
            }
            pos = positionAtDirection(thisPos, TOP_RIGHT);
            if (!pos.checkForWall() && !pos.checkForCreep() && !pos.checkForObstacleStructure()) {
                return this.move(TOP_RIGHT)
            }
            return this.move(TOP_LEFT)
        }
        return true;
    }
    return false;
};

function positionAtDirection(origin, direction) {
    let offsetX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
    let offsetY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
    let x = origin.x + offsetX[direction];
    let y = origin.y + offsetY[direction];
    if (x > 49 || x < 0 || y > 49 || y < 0 || !x || !y) {
        return;
    }
    return new RoomPosition(x, y, origin.roomName);
}

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
    if (this.memory.boostAttempt) return false;
    if (!this.room.memory.boostLab) return this.memory.boostAttempt = true;
    // Unboosting
    /**if (labs[0] && this.memory.boostAttempt && !this.memory.unboosted && this.ticksToLive <= 75) {
        switch (labs[0].unboostCreep(this)) {
            case OK:
                this.memory.unboosted = true;
                break;
            case ERR_NOT_IN_RANGE:
                this.say('Un-boosting');
                break;
            case ERR_NOT_FOUND:
                this.memory.unboosted = true;
        }
        this.shibMove(labs[0]);
        return true;
    }**/
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
                case 'harvest':
                    boostInRoom = getBoostAmount(this.room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
                    boostNeeded = this.getActiveBodyparts(MOVE) * 30;
                    this.memory.boostNeeded = boostNeeded;
                    if (boostInRoom >= boostNeeded) {
                        available.push(RESOURCE_CATALYZED_UTRIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_UTRIUM_ALKALIDE) >= boostNeeded) {
                        available.push(RESOURCE_UTRIUM_ALKALIDE);
                    } else if (getBoostAmount(this.room, RESOURCE_UTRIUM_OXIDE) >= boostNeeded) {
                        available.push(RESOURCE_UTRIUM_OXIDE);
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
        if (!this.memory.requestedBoosts.length || this.ticksToLive < 750) {
            let lab = Game.getObjectById(this.memory.boostLab);
            if (lab) {
                lab.memory = undefined;
            }
            this.memory.requestedBoosts = undefined;
            this.memory.boostLab = undefined;
            this.memory.boostNeeded = undefined;
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
                let innerLab = Game.getObjectById(this.room.memory.boostLab);
                if (filledLab) {
                    if (filledLab.memory.neededBoost && filledLab.memory.neededBoost !== this.memory.requestedBoosts[key]) return;
                    this.memory.boostLab = filledLab.id;
                    filledLab.memory.neededBoost = this.memory.requestedBoosts[key];
                    filledLab.memory.active = true;
                    filledLab.memory.requested = Game.time;
                } else if (innerLab) {
                    if (innerLab.memory.neededBoost && innerLab.memory.neededBoost !== this.memory.requestedBoosts[key]) return;
                    this.memory.boostLab = innerLab.id;
                    innerLab.memory.neededBoost = this.memory.requestedBoosts[key];
                    innerLab.memory.active = true;
                    innerLab.memory.requested = Game.time;
                } else {
                    return this.memory.boostAttempt = true;
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
                        this.shibMove(lab);
                        return true;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.say(ICONS.boost);
                        this.shibMove(lab);
                        return true;
                }
            } else {
                this.shibMove(lab);
            }
        }
        return true;
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
    let road = this.pos.lookFor(LOOK_STRUCTURES);
    if (road.length > 0 && road[0].hits < road[0].hitsMax) this.repair(road[0]);
};

//Find spawn and recycle
Creep.prototype.recycleCreep = function () {
    if (this.borderCheck()) return;
    if (this.room.name !== this.memory.overlord) return this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 22});
    let spawn = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.my);
    if (!spawn.length) return;
    switch (spawn[0].recycleCreep(this)) {
        case OK:
            break;
        case ERR_NOT_IN_RANGE:
            return this.shibMove(spawn[0]);
    }
};

Object.defineProperty(Creep.prototype, 'isFull', {
    get: function () {
        if (!this._isFull) {
            this._isFull = _.sum(this.carry) >= this.carryCapacity * 0.75;
        }
        return this._isFull;
    },
    enumerable: false,
    configurable: true
});

Creep.prototype.reportDamage = function () {
    if (this.hits === this.hitsMax) {
        this.memory.healsPlease = undefined;
        this.memory.healsInbound = undefined;
    } else if (!this.getActiveBodyparts(HEAL)) {
        this.memory.healsPlease = true;
    } else {
        this.heal(this);
    }
    if (this.memory.healsInbound && !Game.getObjectById(this.memory.healsInbound)) this.memory.healsInbound = undefined;
    if (!this.memory._lastHits) return this.memory._lastHits = this.hits;
    if (this.hits < this.memory._lastHits) {
        this.memory.underAttack = true;
        if (this.room.controller && ((this.room.controller.owner && this.room.controller.owner.username !== USERNAME) || (this.room.controller.reservation && this.room.controller.reservation.username !== USERNAME)) && this.memory.targetRoom !== this.room.name) return false;
        let nearbyCreeps = _.uniq(_.pluck(_.filter(this.room.creeps, (c) => c.pos.getRangeTo(this) <= 3 && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper' && c.owner.username !== USERNAME), 'owner.username'));
        if (nearbyCreeps.length) {
            for (let key in nearbyCreeps) {
                let user = nearbyCreeps[key];
                if (user === MY_USERNAME) continue;
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
    } else {
        this.memory.underAttack = undefined;
    }
    this.memory._lastHits = this.hits;
};


Creep.prototype.fleeRoom = function (room) {
    if (this.room.name !== room && !this.borderCheck()) return this.idleFor(this.memory.fleeNukeTime);
    if (this.memory.fleeNukeTime <= Game.time) {
        this.memory.fleeNukeTime = undefined;
        this.memory.fleeNukeRoom = undefined;
    }
    let exit = this.pos.findClosestByPath(FIND_EXIT);
    this.say('NUKE! RUN!', true);
    this.shibMove(exit);
};