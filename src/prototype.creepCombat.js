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
    let enemy = this.pos.findClosestByRange(this.room.creeps, {filter: (c) => !_.includes(FRIENDLIES, c.owner['username']) && (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1) && c.owner['username'] !== 'Source Keeper'});
    if (enemy) {
        return enemy;
    } else {
        enemy = this.pos.findClosestByRange(this.room.creeps, {filter: (c) => !_.includes(FRIENDLIES, c.owner.username) && c.owner['username'] !== 'Source Keeper'});
        if (enemy) {
            return enemy;
        } else {
            if ((this.room.controller && this.room.controller.reservation && _.includes(FRIENDLIES, this.room.controller.reservation.username)) || (this.room.controller && this.room.controller.owner && _.includes(FRIENDLIES, this.room.controller.owner.username))) return null;
            enemy = this.pos.findClosestByRange(this.room.structures, {filter: (c) => c.structureType !== STRUCTURE_CONTROLLER && c.structureType !== STRUCTURE_ROAD && c.structureType !== STRUCTURE_WALL && c.structureType !== STRUCTURE_RAMPART && c.structureType !== STRUCTURE_CONTAINER && c.structureType !== STRUCTURE_STORAGE});
            if (enemy) {
                return enemy;
            } else {
                enemy = this.findClosestBarrier();
                if (enemy) {
                    return enemy;
                }
            }
        }
    }
};

Creep.prototype.findClosestBarrier = function (walls = true) {
    let barriers;
    if (walls) {
        barriers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
    } else {
        barriers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART);
    }
    let lowestInArea = _.sortBy(this.pos.findInRange(barriers, 6), 'hits')[0];
    if (lowestInArea && !PathFinder.search(this.pos, lowestInArea.pos).incomplete) return lowestInArea;
    return this.pos.findClosestByRange(barriers);
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
    switch (this.attack(hostile)) {
        case OK:
            return this.shibMove(hostile, {range: 0, ignoreRoads: true});
        case ERR_NOT_IN_RANGE:
            if (this.hits < this.hitsMax) this.heal(this);
            return this.shibMove(hostile, {forceRepath: true, ignoreCreeps: false, ignoreRoads: true});
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
    return false;
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
        this.attackHostile(hostile);
        return true;
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
    let position = target.pos.findClosestByPath(this.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.owner === USERNAME});
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
        if (this.pos.findInRange(FIND_CREEPS, 1).length > 0) {
            this.shibMove(target, {forceRepath: true, ignoreCreeps: false, range: 3, ignoreRoads: true});
        } else {
            this.shibMove(target, {forceRepath: true, range: 3, ignoreRoads: true});
        }
    }
};

Creep.prototype.moveToStaging = function () {
    if (!this.memory.waitFor || this.memory.stagingComplete || this.memory.waitFor === 1 || this.ticksToLive <= 250 || !this.memory.targetRoom) return false;
    if (this.memory.stagingRoom === this.room.name) {
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 19});
        let inPlace = _.filter(this.room.creeps, (creep) => creep.memory && creep.memory.targetRoom === this.memory.targetRoom);
        if (inPlace.length >= this.memory.waitFor) {
            this.memory.stagingComplete = true;
            return false;
        } else {
            return true;
        }
    } else if (this.memory.stagingRoom) {
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 19});
        return true;
    }
    let alreadyStaged = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === this.memory.targetRoom && creep.memory.stagingRoom)[0];
    if (alreadyStaged) {
        this.memory.stagingRoom = alreadyStaged.memory.stagingRoom;
        this.shibMove(alreadyStaged, {repathChance: 0.5});
        return true;
    } else {
        let route = Game.map.findRoute(this.room.name, this.memory.targetRoom);
        let routeLength = route.length;
        this.memory.stagingRoom = route[routeLength - 2].room;
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 19});
        return true;
    }
};

Creep.prototype.siege = function () {
    if (this.room.name !== this.memory.targetRoom) {
        if (!this.memory.healer || this.pos.getRangeTo(Game.getObjectById(this.memory.healer)) > 2) return null;
        return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
            ignoreCreeps: true,
            range: 20
        });
    }
    if (!this.memory.healer || this.pos.getRangeTo(Game.getObjectById(this.memory.healer)) > 1 && this.pos.x !== 48 && this.pos.x !== 1 && this.pos.y !== 48 && this.pos.y !== 1) return null;
    if (!this.room.controller.owner || (this.room.controller && (!this.room.controller.owner || _.includes(FRIENDLIES, this.room.controller.owner['username'])) === false)) {
        let target;
        let sharedTarget = _.filter(Game.creeps, (c) => c.memory && c.memory.siegeTarget && c.memory.targetRoom === this.memory.targetRoom)[0];
        if (sharedTarget) target = Game.getObjectById(sharedTarget.memory.siegeTarget);
        if (!target || target === null) {
            target = this.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_TOWER)});
            if (target && PathFinder.search(this.pos, target.pos,
                    {
                        roomCallback: function (roomName) {
                            let room = Game.rooms[roomName];
                            if (!room) return;
                            let costs = new PathFinder.CostMatrix;
                            room.find(FIND_CREEPS).forEach(function (creep) {
                                costs.set(creep.pos.x, creep.pos.y, 0);
                            });
                            return costs;
                        },
                    }).incomplete) target = undefined;
            if (target) {
                this.memory.siegeTarget = target.id;
            }
        }
        if (!target || target === null) {
            target = this.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_SPAWN)});
            if (target && PathFinder.search(this.pos, target.pos,
                    {
                        roomCallback: function (roomName) {
                            let room = Game.rooms[roomName];
                            if (!room) return;
                            let costs = new PathFinder.CostMatrix;
                            room.find(FIND_CREEPS).forEach(function (creep) {
                                costs.set(creep.pos.x, creep.pos.y, 0);
                            });
                            return costs;
                        },
                    }).incomplete) target = undefined;
            if (target) {
                this.memory.siegeTarget = target.id;
            }
        }
        if (!target || target === null) {
            target = this.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_EXTENSION)});
            if (target && PathFinder.search(this.pos, target.pos,
                    {
                        roomCallback: function (roomName) {
                            let room = Game.rooms[roomName];
                            if (!room) return;
                            let costs = new PathFinder.CostMatrix;
                            room.find(FIND_CREEPS).forEach(function (creep) {
                                costs.set(creep.pos.x, creep.pos.y, 0);
                            });
                            return costs;
                        },
                    }).incomplete) target = undefined;
            if (target) {
                this.memory.siegeTarget = target.id;
            }
        }
        if (!target || target === null) {
            target = this.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType.owner !== STRUCTURE_ROAD && s.structureType.owner !== STRUCTURE_STORAGE && s.structureType.owner !== STRUCTURE_TERMINAL)});
            if (target && PathFinder.search(this.pos, target.pos,
                    {
                        roomCallback: function (roomName) {
                            let room = Game.rooms[roomName];
                            if (!room) return;
                            let costs = new PathFinder.CostMatrix;
                            room.find(FIND_CREEPS).forEach(function (creep) {
                                costs.set(creep.pos.x, creep.pos.y, 0);
                            });
                            return costs;
                        },
                    }).incomplete) target = undefined;
            if (target) {
                this.memory.siegeTarget = target.id;
            }
        }
        if (!target || target === null) {
            target = this.findClosestBarrier();
            if (target) {
                this.memory.siegeTarget = target.id;
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
            delete Memory.targetRooms[this.room.name];
            let terminal = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
            let storage = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
            if ((terminal && _.sum(terminal.store) > 0) || (storage && _.sum(storage.store) > 0)) {
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[this.pos.roomName] = {
                    tick: tick,
                    type: 'robbery',
                    level: 1
                };
                Memory.targetRooms = cache;
            }
            return this.memory.role = 'worker';
        } else {
            this.room.visual.text(
                ICONS.noEntry,
                target.pos.x,
                target.pos.y,
                {align: 'left', opacity: 1}
            );
            switch (this.dismantle(target)) {
                case ERR_NOT_IN_RANGE:
                    this.heal(this);
                    if (!this.memory.healer || this.pos.getRangeTo(Game.getObjectById(this.memory.healer)) > 1) return null;
                    this.shibMove(target, {ignoreCreeps: true});
                    this.memory.siegeTarget = undefined;
                    break;
                case ERR_NO_BODYPART:
                    this.heal(this);
                    if (this.getActiveBodyparts(ATTACK) > 0) this.attack(target);
                    this.shibMove(target, {ignoreCreeps: true});
                    break;
                case OK:
                    return true;

            }
        }
    }
};

Creep.prototype.squadHeal = function () {
    let range;
    let hostileRange = this.pos.getRangeTo(this.pos.findClosestByRange(this.room.creeps, {filter: (c) => !_.includes(FRIENDLIES, c.owner['username']) && (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1)}));
    let creepToHeal = this.pos.findClosestByRange(this.room.creeps, {filter: (c) => _.includes(FRIENDLIES, c.owner['username']) && c.hits < c.hitsMax * 0.7});
    if (creepToHeal !== null) {
        range = this.pos.getRangeTo(creepToHeal);
        if (range <= 1 && hostileRange >= 2) {
            this.heal(creepToHeal);
            this.shibMove(creepToHeal, {movingTarget: true, ignoreCreeps: true});
        } else {
            if (hostileRange < 2) {
                this.rangedHeal(creepToHeal);
                this.kite();
            } else {
                this.rangedHeal(creepToHeal);
                this.shibMove(creepToHeal, {forceRepath: true, ignoreCreeps: true});
            }
        }
        return true;
    }
    creepToHeal = this.pos.findClosestByRange(this.room.creeps, {filter: (c) => _.includes(FRIENDLIES, c.owner['username']) && c.hits < c.hitsMax});
    if (creepToHeal !== null) {
        range = this.pos.getRangeTo(creepToHeal);
        if (range <= 1 && hostileRange >= 2) {
            this.heal(creepToHeal);
            this.shibMove(creepToHeal, {movingTarget: true, ignoreCreeps: true});
        } else {
            if (hostileRange < 2) {
                this.rangedHeal(creepToHeal);
                this.kite();
            } else {
                this.rangedHeal(creepToHeal);
                this.shibMove(creepToHeal, {forceRepath: true, ignoreCreeps: true});
            }
        }
        return true;
    }
    if (this.memory.operation === 'siege') {
        let ally = this.pos.findClosestByRange(Game.creeps, {filter: (c) => _.includes(FRIENDLIES, c.owner['username']) && c.memory.role === 'deconstructor' && c.memory.targetRoom === this.memory.targetRoom});
        this.shibMove(ally, {forceRepath: true, ignoreCreeps: true, range: 0});
    } else {
        let ally = this.pos.findClosestByRange(this.room.creeps, {filter: (c) => _.includes(FRIENDLIES, c.owner['username']) && (c.memory.role === 'attacker' || c.memory.role === 'longbow')});
        this.shibMove(ally, {forceRepath: true, ignoreCreeps: true, range: 0});
    }
};

Creep.prototype.siegeHeal = function () {
    if (!Game.getObjectById(this.memory.healTarget) || !this.memory.healTarget) {
        if (!Game.getObjectById(this.memory.healTarget)) this.memory.healTarget = undefined;
        let deconstructor = _.filter(Game.creeps, (c) => (c.memory.role === 'deconstructor' || c.memory.role === 'siegeEngine') && c.memory.targetRoom === this.memory.targetRoom && (!c.memory.healer || !Game.getObjectById(c.memory.healer)))[0];
        if (!deconstructor) deconstructor = _.filter(Game.creeps, (c) => (c.memory.role === 'deconstructor' || c.memory.role === 'siegeEngine') && c.memory.targetRoom === this.memory.targetRoom)[0];
        if (!deconstructor) return false;
        this.memory.healTarget = deconstructor.id;
        if (!deconstructor.memory.healer || !Game.getObjectById(deconstructor.memory.healer)) deconstructor.memory.healer = this.id;
        return this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 14});
    } else {
        let deconstructor = Game.getObjectById(this.memory.healTarget);
        this.shibMove(deconstructor, {range: 0, ignoreCreeps: true});
        let range = this.pos.getRangeTo(deconstructor);
        if (this.hits === this.hitsMax) {
            if (range <= 1) {
                this.heal(deconstructor);
            } else if (1 < range <= 4) this.rangedHeal(deconstructor);
        } else {
            this.heal(this);
        }
    }
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
Creep.prototype.kite = function (fleeRange = 4) {
    let avoid = this.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0});

    let avoidance = _.map(this.pos.findInRange(avoid, fleeRange + 1),
        (c) => {
            return {pos: c.pos, range: 15};
        });
    let creep = this;
    let ret = PathFinder.search(this.pos, avoidance, {
        flee: true,
        swampCost: 75,
        maxRooms: 1,

        roomCallback: function (roomName) {
            let costs = new PathFinder.CostMatrix;
            addBorderToMatrix(creep.room, costs);
            addCreepsToMatrix(creep.room, costs);
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

Creep.prototype.borderHump = function () {
    if (this.hits < this.hitsMax * 0.8 && this.room.name === this.memory.targetRoom) {
        let exit = this.pos.findClosestByRange(FIND_EXIT);
        return this.shibMove(exit, {ignoreCreeps: false});
    } else if (this.hits < this.hitsMax && this.room.name !== this.memory.targetRoom) {
        this.borderCheck();
        this.heal(this);
    } else if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
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