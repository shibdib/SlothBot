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
    let x = this.pos.x;
    let y = this.pos.y;
    if (x === 0 || y === 0 || x === 49 || y === 49) {
        // Handle stuck creeps
        if (this.memory.borderCountDown) this.memory.borderCountDown++; else this.memory.borderCountDown = 1;
        // Handle path following
        if (this.memory.borderCountDown < 5 && this.memory._shibMove && this.memory._shibMove.path && this.memory._shibMove.path.length) {
            let pathInfo = this.memory._shibMove;
            let origin = normalizePos(this);
            pathInfo.path = pathInfo.path.slice(1);
            let nextDirection = parseInt(pathInfo.path[0], 10);
            pathInfo.newPos = positionAtDirection(origin, nextDirection);
            switch (this.move(nextDirection)) {
                case OK:
                    pathInfo.pathPosTime = 0;
                    pathInfo.lastMoveTick = Game.time;
                    this.memory._shibMove = pathInfo;
                    return false;
            }
            // Handle corners
        } else if (x === 0 && y === 0) {
            this.move(BOTTOM_RIGHT);
        } else if (x === 0 && y === 49) {
            this.move(TOP_RIGHT);
        } else if (x === 49 && y === 0) {
            this.move(BOTTOM_LEFT);
        } else if (x === 49 && y === 49) {
            this.move(TOP_LEFT);
        }
        // Handle border movement
        let options;
        let road = _.find(this.room.structures, (s) => s.structureType === STRUCTURE_ROAD && s.pos.isNearTo(this));
        if (road) {
            this.move(this.pos.getDirectionTo(road));
        } else if (x === 49) {
            options = [LEFT, TOP_LEFT, BOTTOM_LEFT];
            this.move(_.sample(options));
        } else if (x === 0) {
            options = [RIGHT, TOP_RIGHT, BOTTOM_RIGHT];
            this.move(_.sample(options));
        } else if (y === 0) {
            options = [BOTTOM, BOTTOM_LEFT, BOTTOM_RIGHT];
            this.move(_.sample(options));
        } else if (y === 49) {
            options = [TOP, TOP_LEFT, TOP_RIGHT];
            this.move(_.sample(options));
        }
        return true;
    }
    this.memory.borderCountDown = undefined;
    return false;
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