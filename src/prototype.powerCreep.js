/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Set the unit to idle-mode until recall tick
 *
 * @type {int}
 */
Object.defineProperty(PowerCreep.prototype, "idle", {
    configurable: true,
    get: function () {
        if (this.memory.idle === undefined) return 0;
        if (this.memory.idle <= Game.time) {
            delete this.idle;
            return 0;
        }
        this.say(_.sample([ICONS.wait23, ICONS.wait21, ICONS.wait19, ICONS.wait17, ICONS.wait13, ICONS.wait11, ICONS.wait7, ICONS.wait10, ICONS.wait3, ICONS.wait1]), true);
        if (this.pos.checkForRoad() && this.memory.role !== 'stationaryHarvester' && this.memory.role !== 'upgrader' && this.memory.role !== 'mineralHarvester' && this.memory.role !== 'remoteHarvester') {
            this.moveRandom();
        } else if (this.pos.getRangeTo(this.pos.findClosestByRange(FIND_MY_SPAWNS)) === 1) {
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

//Go to the room hub
PowerCreep.prototype.goToHub = function (destination) {
    let hub = new RoomPosition(25, 25, destination);
    if (this.pos.getRangeTo(hub) <= 15) return this.idleFor(10);
    return this.shibMove(hub, {range: 15})
};

/**
 * Set the unit to idle-mode for ticks given
 *
 * @type {int}
 */
PowerCreep.prototype.idleFor = function (ticks = 0) {
    if (ticks > 0) {
        this.idle = Game.time + ticks;
    } else {
        delete this.idle;
    }
};

PowerCreep.prototype.borderCheck = function () {
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

Object.defineProperty(PowerCreep.prototype, 'ops', {
    get: function () {
        if (!this._ops) {
            this._ops = this.store[RESOURCE_OPS];
        }
        return this._ops;
    },
    enumerable: false,
    configurable: true
});

Object.defineProperty(PowerCreep.prototype, 'isFull', {
    get: function () {
        if (!this._isFull) {
            this._isFull = _.sum(this.store) >= this.store.getCapacity() * 0.95;
        }
        return this._isFull;
    },
    enumerable: false,
    configurable: true
});

PowerCreep.prototype.reportDamage = function () {
    if (!this.memory._lastHits) return this.memory._lastHits = this.hits;
    if (this.hits < this.memory._lastHits) {
        this.memory.underAttack = true;
        if (this.room.controller && ((this.room.controller.owner && this.room.controller.owner.username !== MY_USERNAME) || (this.room.controller.reservation && this.room.controller.reservation.username !== MY_USERNAME)) && this.memory.destination !== this.room.name) return false;
        let nearbyCreeps = _.uniq(_.pluck(_.filter(this.room.creeps, (c) => c.pos.getRangeTo(this) <= 3 && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper' && c.owner.username !== MY_USERNAME), 'owner.username'));
        if (nearbyCreeps.length) {
            for (let key in nearbyCreeps) {
                let user = nearbyCreeps[key];
                if (user === MY_USERNAME) continue;
                let cache = Memory._userList || {};
                let standing;
                if (cache[user]) {
                    if (cache[user].lastAction + 10 > Game.time) return true;
                    log.e(this.name + ' has taken damage in ' + this.room.name + '. Adjusting threat rating for ' + user);
                    if (_.includes(FRIENDLIES, user)) {
                        standing = cache[user]['standing'] + 0.1;
                    } else {
                        standing = cache[user]['standing'] + 0.5;
                    }
                } else {
                    if (_.includes(FRIENDLIES, user)) {
                        standing = 2.5;
                    } else {
                        standing = 50;
                    }
                }
                cache[user] = {
                    standing: standing,
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


PowerCreep.prototype.fleeRoom = function (room) {
    if (this.room.name !== room) return this.idleFor(this.memory.fleeNukeTime);
    if (this.memory.fleeNukeTime <= Game.time) {
        this.memory.fleeNukeTime = undefined;
        this.memory.fleeNukeRoom = undefined;
    }
    let exit = this.pos.findClosestByPath(FIND_EXIT);
    this.say('NUKE! RUN!', true);
    this.shibMove(exit);
};

PowerCreep.prototype.fleeNukeRoom = function () {
    this.say('NUKE!', true);
    if (this.memory.fleeNukeTime <= Game.time) {
        this.memory.fleeNukeTime = undefined;
        this.memory.fleeNukeRoom = undefined;
        return false;
    }
    if (this.memory.fleeTo && this.room.name !== this.memory.fleeTo) this.shibMove(new RoomPosition(25, 25, this.memory.fleeTo), {range: 23}); else if (this.room.name !== this.memory.fleeTo) this.idleFor(this.memory.fleeNukeTime - Game.time);
    if (!this.memory.fleeTo) this.memory.fleeTo = _.sample(_.filter(Memory.myRooms, (r) => !r.nukes.length)).name;
};