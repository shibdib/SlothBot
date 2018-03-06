/**
 * Created by Bob on 7/3/2017.
 */
'use strict';

Creep.prototype.findClosestSourceKeeper = function () {
    return this.pos.findClosestByRange(this.room.creeps, {
        filter: function (object) {
            return object.owner.username === 'Source Keeper';
        }
    });
};

Creep.prototype.findClosestEnemy = function () {
    return this.pos.findClosestByRange(this.room.creeps, {filter: (c) => !_.includes(FRIENDLIES, c.owner.username)});
};

Creep.prototype.fleeFromHostile = function (hostile) {
    let direction = this.pos.getDirectionTo(hostile);
    direction = (direction + 3) % 8 + 1;
    if (!direction || direction === null || this.pos.x === 0 || this.pos.x === 49 || this.pos.y === 0 || this.pos.y === 49) {
        this.moveTo(25, 25);
        return true;
    }
    for (let offset = 0, dir, pos; offset < 8; offset++) {
        let dir = (direction + offset) % 8 + 1;
        let pos = this.pos.getAdjacentPosition(dir);
        if (pos.lookFor(LOOK_TERRAIN)[0] !== STRUCTURE_WALL && pos.lookFor(LOOK_CREEPS).length === 0) {
            direction = direction + offset;
            break;
        }
    }
    this.rangedAttack(hostile);
    this.move(direction);
};

Creep.prototype.attackHostile = function (hostile) {
    this.memory.target = undefined;
    if (this.pos.getRangeTo(hostile) <= 3) this.rangedAttack(hostile);
    let ally = this.pos.findClosestByRange(this.room.creeps, {filter: (c) => c.my || _.includes(FRIENDLIES, c.owner.username)});
    if (this.pos.getRangeTo(ally) <= 3) {
        let alliesHostile = Game.getObjectById(ally.memory.target);
        if (alliesHostile) this.memory.target = hostile.id;
    }
    if (_.filter(this.room.find(this.room.creeps), (c) => c.memory.target && c.my))
    if (this.attack(hostile) === ERR_NOT_IN_RANGE) {
        if (this.hits < this.hitsMax) this.heal(this);
        this.shibMove(hostile, {forceRepath: true, ignoreCreeps: false, ignoreRoads: true});
    }
};

Creep.prototype.healMyCreeps = function () {
    let myCreeps = this.room.find(FIND_MY_CREEPS, {
        filter: function (object) {
            return object.hits < object.hitsMax;
        }
    });
    if (myCreeps.length > 0) {
        this.say('Medic Here', true);
        this.moveTo(myCreeps[0]);
        if (this.pos.getRangeTo(myCreeps[0]) <= 1) {
            this.heal(myCreeps[0]);
        } else {
            this.rangedHeal(myCreeps[0]);
        }
        return true;
    }
    return false;
};

Creep.prototype.healAllyCreeps = function () {
    let allyCreeps = this.room.find(this.room.creeps, {
        filter: function (object) {
            if (object.hits === object.hitsMax) {
                return false;
            }
            return _.includes(FRIENDLIES, object.owner.username) === true;
        }
    });
    if (allyCreeps.length > 0) {
        this.say('heal ally', true);
        this.moveTo(allyCreeps[0]);
        let range = this.pos.getRangeTo(allyCreeps[0]);
        if (range <= 1) {
            this.heal(allyCreeps[0]);
        } else {
            this.rangedHeal(allyCreeps[0]);
        }
        return true;
    }
};

Creep.prototype.moveToHostileConstructionSites = function () {
    let constructionSite = this.pos.findClosestByRange(this.room.constructionSites);
    if (constructionSite && !_.includes(FRIENDLIES, constructionSite.owner['username'])) {
        this.say('KCS!!');
        let returnCode = this.shibMove(constructionSite, {range:0});
        return true;
    }
    return false;
};

Creep.prototype.handleDefender = function () {
    let hostile = this.findClosestEnemy();
    if (this.fightRampart(hostile)) {
        return true;
    }
    if (hostile) {
        return this.attackHostile(hostile);
    }
    if (this.healMyCreeps()) {
        return true;
    }
    if (this.healAllyCreeps()) {
        return true;
    }
    return this.moveToHostileConstructionSites();

};

Creep.prototype.waitRampart = function () {
    this.say('waitRampart');
    let creep = this;
    let structure = this.pos.findClosestByPath(this.room.structures, {
        filter: function (object) {
            if (object.structureType !== STRUCTURE_RAMPART || object.pos.lookFor(LOOK_CREEPS).length !== 0) {
                return false;
            }
            return creep.pos.getRangeTo(object) > 0;
        }
    });
    if (!structure) {
        this.moveRandom();
        return true;
    }
    let returnCode = this.shibMove(structure);
    return true;
};

Creep.prototype.fightRampart = function (target) {
    if (!target) {
        return false;
    }
    let position = target.pos.findClosestByPath(this.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === this.pos.x && r.pos.y === this.pos.y))});
    if (position === null) {
        return false;
    }
    this.memory.assignedRampart = position.id;
    let returnCode;
    if (this.pos.getRangeTo(position) > 0) {
        this.say(ICONS.attack, true);
        returnCode = this.shibMove(position, {forceRepath: true, range: 0});
        if (returnCode === OK) {
            return true;
        }
        if (returnCode === ERR_TIRED) {
            return true;
        }
    }
    let targets = this.pos.findInRange(FIND_HOSTILE_CREEPS, 3, {
        filter: this.room.findAttackCreeps
    });
    if (targets.length > 1) {
        this.rangedMassAttack();
    } else {
        this.rangedAttack(target);
    }
    let closeTargets = this.pos.findInRange(FIND_HOSTILE_CREEPS, 1, {
        filter: this.room.findAttackCreeps
    });
    if (closeTargets.length > 0) {
        this.attack(closeTargets[0]);
    }
    return true;
};

Creep.prototype.flee = function (target) {
    let direction = this.pos.getDirectionTo(target);
    direction = (direction + 3) % 8 + 1;
    let pos = this.pos.getAdjacentPosition(direction);
    let terrain = pos.lookFor(LOOK_TERRAIN)[0];
    if (terrain === 'wall') {
        direction = (Math.random() * 8) + 1;
    }
    this.move(direction);
    return true;
};

Creep.prototype.fightRanged = function (target) {
    let range = this.pos.getRangeTo(target);
    if (range <= 2) {
        this.rangedAttack(target);
        return this.kite();
    } else if (range <= 3) {
        this.rangedAttack(target);
        return true;
    } else {
        let opportunity = _.min(_.filter(this.pos.findInRange(FIND_CREEPS, 3), (c) => _.includes(FRIENDLIES, c.owner['username']) === false), 'hits');
        if (opportunity) this.rangedAttack(opportunity);
        this.shibMove(target, {forceRepath: true, ignoreCreeps: false, range: 3});
    }
};

Creep.prototype.siege = function () {
    this.memory.hitsLast = this.hits;
    let healPower = this.getActiveBodyparts(HEAL) * HEAL_POWER;
    if (this.hits - this.memory.hitsLost < this.hits * 0.70 || this.hits < this.hitsMax * 0.70 || this.memory.hitsLost >= 140 || this.memory.healing === true || (!this.memory.hitsLost && this.hitsMax - this.hits >= 100)) {
        this.memory.siegeComplete = undefined;
        this.memory.healing = true;
        let healers = this.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.role === 'healer'), 45);
        if (healers.length > 0) {
            this.shibMove(healers[0], {forceRepath: true, ignoreCreeps: false});
        } else {
            this.shibMove(new RoomPosition(25, 25, this.memory.fallBackRoom), {range: 23, forceRepath: true, ignoreCreeps: false});
        }
        return true;
    }
    this.memory.hitsLost = this.memory.hitsLast - this.hits;
    let target;
    if (this.memory.attackType === 'clean') {
        target = this.pos.findClosestByPath(this.room.structures);
    }
    if (Game.getObjectById(this.memory.siegeTarget)) {
        let lowHit = _.min(this.pos.findInRange(this.room.structures, 1, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && (!s.room.controller.owner || (s.room.controller && _.includes(FRIENDLIES, s.room.controller.owner['username']) === false))}), 'hits');
        if (lowHit) {
            target = lowHit;
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = undefined;
        } else {
            target = Game.getObjectById(this.memory.siegeTarget);
        }
    }
    if (!target || target === null) {
        this.memory.siegeComplete = true;
    }
    if (!target || target === null) {
        target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => (s.structureType === STRUCTURE_TOWER) && (!s.room.controller.owner || (s.room.controller && _.includes(FRIENDLIES, s.room.controller.owner['username']) === false))});
        if (target) {
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = true;
        }
    }
    if (!target || target === null) {
        target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => (s.structureType === STRUCTURE_STORAGE) && (!s.room.controller.owner || (s.room.controller && _.includes(FRIENDLIES, s.room.controller.owner['username']) === false))});
        if (target) {
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = true;
        }
    }
    if (!target || target === null) {
        target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => (s.structureType === STRUCTURE_TERMINAL) && (!s.room.controller.owner || (s.room.controller && _.includes(FRIENDLIES, s.room.controller.owner['username']) === false))});
        if (target) {
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = true;
        }
    }
    if (!target || target === null) {
        target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => (s.structureType === STRUCTURE_SPAWN) && (!s.room.controller.owner || (s.room.controller && _.includes(FRIENDLIES, s.room.controller.owner['username']) === false))});
        if (target) {
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = true;
        }
    }
    if (!target || target === null) {
        target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => (s.structureType === STRUCTURE_EXTENSION) && (!s.room.controller.owner || (s.room.controller && _.includes(FRIENDLIES, s.room.controller.owner['username']) === false))});
        if (target) {
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = true;
        }
    }
    if (!target || target === null) {
        target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType.owner !== STRUCTURE_ROAD) && (!s.room.controller || (s.room.controller && _.includes(FRIENDLIES, s.room.controller.owner['username']) === false))});
        if (target) {
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = true;
        }
    }
    if (!target || target === null) {
        target = this.pos.findClosestByPath(this.room.constructionSites, {filter: (s) => (!s.room.controller || (s.room.controller && _.includes(FRIENDLIES, s.room.controller.owner['username']) === false))});
        if (target) {
            return this.shibMove(target, {range: 0});
        }
    }
    if (!target || target === null) {
        target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && (!s.room.controller.owner || (s.room.controller && _.includes(FRIENDLIES, s.room.controller.owner['username']) === false))});
        if (target) {
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = undefined;
        }
    }
    /**if (!target || target.pos.lookFor(LOOK_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART})) {
        if (!this.memory.siegeTarget || !Game.getObjectById(this.memory.siegeTarget)) {
            target = _.min(this.pos.findInRange(FIND_STRUCTURES, 4, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && (!s.room.controller.owner || _.includes(FRIENDLIES, s.room.controller.owner['username']) === false)}), 'hits');
        } else if (this.memory.siegeTarget) {
            target = Game.getObjectById(this.memory.siegeTarget);
        } else {
            target = this.pos.findClosestByPath(hostileStructures, {filter: (s) => (s.structureType === STRUCTURE_RAMPART && s.structureType === STRUCTURE_WALL)});
        }
        if (target) {
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = undefined;
        }
    }**/
    if (Game.getObjectById(this.memory.siegeTarget)) {
        target = Game.getObjectById(this.memory.siegeTarget);
    }
    if (!target) {
        this.shibMove(new RoomPosition(25, 25, this.memory.siegePoint), {range: 23});
    } else {
        switch (this.dismantle(target)) {
            case ERR_NOT_IN_RANGE:
                this.heal(this);
                this.shibMove(target, {ignoreCreeps: false, repathChance: 0.5});
                this.memory.siegeTarget = undefined;
                break;
            case ERR_NO_BODYPART:
                if (this.getActiveBodyparts(ATTACK) > 0) this.attack(target);
                this.shibMove(target, {ignoreCreeps: false, repathChance: 0.5});
                break;
            case OK:
                return true;

        }
    }
};

Creep.prototype.squadHeal = function () {
    let range;
    let creepToHeal = this.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: function (object) {
            return object.hits < object.hitsMax / 1.5;
        }
    });

    if (creepToHeal !== null) {
        range = this.pos.getRangeTo(creepToHeal);
        if (range <= 1) {
            this.heal(creepToHeal);
        } else {
            this.rangedHeal(creepToHeal);
            this.moveTo(creepToHeal);
        }
        return true;
    }

    creepToHeal = this.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: function (object) {
            return object.hits < object.hitsMax;
        }
    });

    if (creepToHeal !== null) {
        range = this.pos.getRangeTo(creepToHeal);
        if (range > 1) {
            this.rangedHeal(creepToHeal);
        } else {
            this.heal(creepToHeal);
        }
        if (creepToHeal.id === this.id) {
            this.say('exit');
            let exit = this.pos.findClosestByRange(FIND_EXIT);
            this.moveTo(exit);
        } else {
            this.say(JSON.stringify(creepToHeal));
            this.moveTo(creepToHeal);
        }
        return true;
    }

    let attacker = this.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: function (object) {
            return object.memory.role === 'squadsiege';
        }
    });

    if (this.pos.x === 0 ||
        this.pos.x === 49 ||
        this.pos.y === 0 ||
        this.pos.y === 49
    ) {
        this.moveTo(25, 25);
        return true;
    }
    if (attacker === null) {
        const cs = this.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
        this.moveTo(cs);
        return false;
    }
    this.moveTo(attacker);
    return false;
};

Creep.prototype.moveRandom = function (onPath) {
    let start = Math.ceil(Math.random() * 8);
    let direction = 0;
    for (let i = start; i < start + 8; i++) {
        direction = ((i - 1) % 8) + 1;
        let pos = this.pos.getAdjacentPosition(direction);
        if (pos.isExit()) {
            continue;
        }
        if (onPath && !pos.inPath()) {
            continue;
        }
        if (pos.checkForWall()) {
            continue;
        }
        if (pos.checkForObstacleStructure()) {
            continue;
        }
        break;
    }
    this.move(direction);
};

Room.prototype.findAttackCreeps = function (object) {
    if (object.owner.username === 'Source Keeper') {
        return false;
    }

    for (let item in object.body) {
        const part = object.body[item];
        if (part.energy === 0) {
            continue;
        }
        if (part.type === 'attack') {
            return true;
        }
        if (part.type === 'ranged_attack') {
            return true;
        }
        if (part.type === 'heal') {
            return true;
        }
        if (part.type === 'work') {
            return true;
        }
        if (part.type === 'claim') {
            return true;
        }
    }
    return true;
    // TODO defender stop in rooms with (non attacking) enemies
    //    return false;
};
Creep.prototype.kite = function (fleeRange = 3) {
    let avoid = this.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0});

    let avoidance = _.map(this.pos.findInRange(avoid, fleeRange + 1),
        (c) => {
            return {pos: c.pos, range: 15};
        });
    let creep = this;
    let ret = PathFinder.search(this.pos, avoidance, {
        flee: true,
        swampCost: 50,
        maxRooms: 1,

        roomCallback: function (roomName) {
            let costs = new PathFinder.CostMatrix;
            addBorderToMatrix(creep.room, costs);
            return costs;
        }

    });

    if (ret.path.length > 0) {
        if (this.memory.squadLeader === true) {
            this.memory.squadKite = this.pos.getDirectionTo(ret.path[0]);
        }
        return this.move(this.pos.getDirectionTo(ret.path[0]));
    } else {
        return OK;
    }
};

Creep.prototype.retreat = function (fleeRange = 7) {
    let avoid = this.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0});
    let avoidance = _.map(this.pos.findInRange(avoid, fleeRange + 1),
        (c) => {
            return {pos: c.pos, range: 20};
        });
    let creep = this;
    let ret = PathFinder.search(this.pos, avoidance, {
        flee: true,
        swampCost: 50,
        maxRooms: 1,

        roomCallback: function (roomName) {
            let costs = new PathFinder.CostMatrix;
            addBorderToMatrix(creep.room, costs);
            addCreepsToMatrix(creep.room, costs);
            return costs;
        }
    });
    if (ret.path.length > 0) {
        return this.move(this.pos.getDirectionTo(ret.path[0]));
    } else {
        return OK;
    }
};

function addBorderToMatrix(room, matrix) {
    let exits = Game.map.describeExits(room.name);
    if (exits === undefined) {
        return matrix;
    }
    let top = ((_.get(exits, TOP, undefined) === undefined) ? 1 : 0);
    let right = ((_.get(exits, RIGHT, undefined) === undefined) ? 48 : 49);
    let bottom = ((_.get(exits, BOTTOM, undefined) === undefined) ? 48 : 49);
    let left = ((_.get(exits, LEFT, undefined) === undefined) ? 1 : 0);
    for (let y = top; y <= bottom; ++y) {
        for (let x = left; x <= right; x += ((y % 49 === 0) ? 1 : 49)) {
            if (matrix.get(x, y) < 0x03 && Game.map.getTerrainAt(x, y, room.name) !== "wall") {
                matrix.set(x, y, 0x03);
            }
        }
    }
    return matrix;
}

function addCreepsToMatrix(room, matrix) {
    room.find(FIND_CREEPS).forEach((creep) => matrix.set(creep.pos.x, creep.pos.y, 0xff));
    return matrix;
}

Creep.prototype.goHomeAndHeal = function () {
    if (Game.map.getRoomLinearDistance(this.room.name, this.memory.overlord) > 1) return;
    this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 20});
};