/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
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

/**
 * Go to room hub
 * @param destination
 * @returns {*|boolean|boolean|void|string}
 */
PowerCreep.prototype.hasActiveBodyparts = function () {
    return false;
};

PowerCreep.prototype.getActiveBodyparts = function () {
    return 0;
};

PowerCreep.prototype.goToHub = function (destination) {
    let hub = new RoomPosition(25, 25, destination);
    if (this.pos.getRangeTo(hub) <= 15) return this.idleFor(10);
    return this.shibMove(hub, {range: 15})
};

/**
 * Idle for x ticks
 * @param ticks
 */
PowerCreep.prototype.idleFor = function (ticks = 0) {
    if (ticks > 0) {
        this.idle = Game.time + ticks;
    } else {
        delete this.idle;
    }
};

/**
 * Move randomly
 */
PowerCreep.prototype.moveRandom = function () {
    let start = Math.ceil(Math.random() * 8);
    let direction = 0;
    for (let i = start; i < start + 8; i++) {
        direction = ((i - 1) % 8) + 1;
        let pos = this.pos.getAdjacentPosition(direction);
        if (!pos || pos.isExit() || pos.checkForWall() || pos.checkForObstacleStructure() || pos.checkForCreep()) {
            continue;
        }
        break;
    }
    this.move(direction);
};

/**
 * Handle border checks
 * @returns {*|boolean}
 */
PowerCreep.prototype.borderCheck = function () {
    const {x, y} = this.pos;
    if (x !== 0 && y !== 0 && x !== 49 && y !== 49) {
        this.memory.borderCountDown = undefined;
        return false;
    }
    if (this.memory.borderCountDown) this.memory.borderCountDown++; else this.memory.borderCountDown = 1;
    if (this.memory.borderCountDown < 5 && this.memory._shibMove) return false;

    this.memory._shibMove = undefined;
    this.memory.moveBlocked = Game.time;

    if (x === 0 && y === 0) this.move(BOTTOM_RIGHT);
    else if (x === 0 && y === 49) this.move(TOP_RIGHT);
    else if (x === 49 && y === 0) this.move(BOTTOM_LEFT);
    else if (x === 49 && y === 49) this.move(TOP_LEFT);
    else {
        let options;
        if (x === 49) options = [LEFT, TOP_LEFT, BOTTOM_LEFT];
        else if (x === 0) options = [RIGHT, TOP_RIGHT, BOTTOM_RIGHT];
        else if (y === 0) options = [BOTTOM, BOTTOM_LEFT, BOTTOM_RIGHT];
        else options = [TOP, TOP_LEFT, TOP_RIGHT];
        this.move(_.sample(options));
    }
    return true;
};

/**
 * Handle nuke fleeing
 * @returns {boolean}
 */
PowerCreep.prototype.fleeNukeRoom = function () {
    this.say('NUKE!', true);
    if (this.memory.fleeNukeTime <= Game.time) {
        this.memory.fleeNukeTime = undefined;
        this.memory.fleeNukeRoom = undefined;
        return false;
    }
    if (this.memory.fleeTo && this.room.name !== this.memory.fleeTo) this.shibMove(new RoomPosition(25, 25, this.memory.fleeTo), {range: 23}); else if (this.room.name !== this.memory.fleeTo) this.idleFor(this.memory.fleeNukeTime - Game.time);
    if (!this.memory.fleeTo) this.memory.fleeTo = _.sample(_.filter(MY_ROOMS, (r) => !r.nukes.length)).name;
};