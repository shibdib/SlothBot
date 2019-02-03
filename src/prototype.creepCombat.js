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

Creep.prototype.findClosestUnarmedEnemy = function () {
    let enemy;
    let barriersPresent = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART).length > 0;
    if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.hostileCreeps); else enemy = this.pos.findClosestByPath(this.room.hostileCreeps);
    if (enemy) {
        if (enemy.pos.checkForRampart()) enemy = enemy.pos.checkForRampart();
        this.memory.target = enemy.id;
        return enemy;
    }
    return false;
};

Creep.prototype.findClosestEnemy = function (barriers = false, ignoreBorder = false) {
    let enemy, filter;
    let worthwhileStructures = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_KEEPER_LAIR).length > 0;
    if (!this.room.hostileCreeps.length && !worthwhileStructures) return;
    let barriersPresent = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART).length > 0;
    let hostileRoom = this.room.controller && this.room.controller.owner && !_.includes(FRIENDLIES, this.room.controller.owner.username);
    // Towers die first
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType === STRUCTURE_TOWER};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.structures, filter); else enemy = this.pos.findClosestByPath(this.room.structures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // Find armed creeps to kill
    filter = {filter: (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(HEAL) >= 1) && (ignoreBorder || (c.pos.x < 48 && c.pos.x > 1 && c.pos.y < 48 && c.pos.y > 1)) && c.owner.username !== 'Source Keeper'};
    if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.hostileCreeps, filter); else enemy = this.pos.findClosestByPath(this.room.hostileCreeps, filter);
    if (enemy) {
        if (enemy.pos.checkForRampart()) enemy = enemy.pos.checkForRampart();
        this.memory.target = enemy.id;
        return enemy;
    }
    // Kill spawns and extensions
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType === STRUCTURE_SPAWN};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.structures, filter); else enemy = this.pos.findClosestByPath(this.room.structures, filter);
        if (enemy) {
            return enemy;
        }
        filter = {filter: (c) => c.structureType === STRUCTURE_EXTENSION};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.structures, filter); else enemy = this.pos.findClosestByPath(this.room.structures, filter);
        if (enemy) {
            return enemy;
        }
    }
    // Find unarmed creeps
    filter = {filter: (c) => (!c.my && (!_.includes(FRIENDLIES, c.owner.username) || _.includes(Memory._threatList, c.owner.username) || c.owner.username === 'Invader') && (ignoreBorder || (c.pos.x < 48 && c.pos.x > 1 && c.pos.y < 48 && c.pos.y > 1)) && c.owner.username !== 'Source Keeper')};
    if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.creeps, filter); else enemy = this.pos.findClosestByPath(this.room.creeps, filter);
    if (enemy) {
        if (enemy.pos.checkForRampart()) enemy = enemy.pos.checkForRampart();
        this.memory.target = enemy.id;
        return enemy;
    }
    // If friendly room leave other structures alone
    if ((this.room.controller && this.room.controller.reservation && _.includes(FRIENDLIES, this.room.controller.reservation.username)) || (this.room.controller && this.room.controller.owner && _.includes(FRIENDLIES, this.room.controller.owner.username))) return false;
    filter = {filter: (c) => c.structureType !== STRUCTURE_CONTROLLER && c.structureType !== STRUCTURE_ROAD && c.structureType !== STRUCTURE_WALL && c.structureType !== STRUCTURE_RAMPART && c.structureType !== STRUCTURE_CONTAINER && c.structureType !== STRUCTURE_STORAGE && c.structureType !== STRUCTURE_TERMINAL && c.structureType !== STRUCTURE_POWER_BANK && c.structureType !== STRUCTURE_KEEPER_LAIR && c.structureType !== STRUCTURE_EXTRACTOR && c.structureType !== STRUCTURE_PORTAL};
    if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.structures, filter); else enemy = this.pos.findClosestByPath(this.room.structures, filter);
    if (enemy) {
        return enemy;
    } else if (barriers) {
        enemy = this.findClosestBarrier();
        if (enemy) {
            return enemy;
        }
    }
    return false;
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

Creep.prototype.findBorderBarrier = function (walls = true) {
    let barriers;
    if (walls) {
        barriers = _.filter(this.room.structures, (s) => (s.pos.x <= 2 || s.pos.y <= 2 || s.pos.x >= 47 || s.pos.y >= 47) && s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
    } else {
        barriers = _.filter(this.room.structures, (s) => (s.pos.x <= 2 || s.pos.y <= 2 || s.pos.x >= 47 || s.pos.y >= 47) && s.structureType === STRUCTURE_RAMPART);
    }
    let lowestInArea = _.sortBy(this.pos.findInRange(barriers, 6), 'hits')[0];
    if (lowestInArea && !PathFinder.search(this.pos, lowestInArea.pos).incomplete) return lowestInArea;
    return this.pos.findClosestByRange(barriers);
};

Creep.prototype.fleeFromHostile = function (hostile) {
    let direction = this.pos.getDirectionTo(hostile);
    direction = (direction + 3) % 8 + 1;
    if (!direction || !direction || this.pos.x === 0 || this.pos.x === 49 || this.pos.y === 0 || this.pos.y === 49) {
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
    delete this.memory.target;
    // If has a range part use it
    if (this.getActiveBodyparts(RANGED_ATTACK) && this.pos.getRangeTo(hostile) <= 3) this.rangedAttack(hostile);
    // Attack
    switch (this.attack(hostile)) {
        case OK:
            return true;
        case ERR_NOT_IN_RANGE:
            if (this.getActiveBodyparts(HEAL) && this.hits < this.hitsMax) this.heal(this);
            return this.shibMove(hostile, {ignoreCreeps: false});
    }
};

Creep.prototype.healMyCreeps = function () {
    let myCreeps = this.room.find(FIND_MY_CREEPS, {
        filter: function (object) {
            return object.hits < object.hitsMax;
        }
    });
    if (myCreeps.length > 0) {
        this.say(ICONS.hospital, true);
        this.shibMove(myCreeps[0]);
        if (!myCreeps[0].memory.military) myCreeps[0].shibMove(this);
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
    let allyCreeps = _.filter(this.room.creeps, (c) => _.includes(FRIENDLIES, c.owner.username) && c.hits < c.hitsMax);
    if (allyCreeps.length > 0) {
        this.say(ICONS.hospital, true);
        this.shibMove(allyCreeps[0]);
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

Creep.prototype.moveToHostileConstructionSites = function (creepCheck = false) {
    // No sites
    if (!this.room.constructionSites.length || (creepCheck && this.room.hostileCreeps.length)) return false;
    // Friendly room
    if (this.room.controller && ((this.room.controller.owner && _.includes(FRIENDLIES, this.room.controller.owner.username)) || (this.room.controller.reservation && _.includes(FRIENDLIES, this.room.controller.reservation.username)) || this.room.controller.safeMode)) return false;
    let constructionSite = this.pos.findClosestByRange(this.room.constructionSites, {filter: (s) => !s.pos.checkForRampart() && !_.includes(FRIENDLIES, s.owner.username)});
    if (constructionSite) {
        if (constructionSite.pos.x === this.pos.x && constructionSite.pos.y === this.pos.y) return this.moveRandom();
        this.shibMove(constructionSite, {range: 0, ignoreCreeps: false});
        return true;
    }
    return false;
};

Creep.prototype.handleMilitaryCreep = function (barrier = false, rampart = true, ignoreBorder = false, unArmedFirst = false, noHeals = false) {
    // Set target
    let hostile;
    if (unArmedFirst) hostile = this.findClosestUnarmedEnemy();
    if (!hostile) hostile = this.findClosestEnemy(barrier, ignoreBorder, unArmedFirst);
    // Flee home if you have no parts
    if (!this.getActiveBodyparts(HEAL) && !this.getActiveBodyparts(ATTACK) && !this.getActiveBodyparts(RANGED_ATTACK)) return this.goHomeAndHeal();
    // If target fight
    if (hostile && (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK))) {
        // Heal if needed
        if (!this.getActiveBodyparts(ATTACK) && this.getActiveBodyparts(HEAL) && this.hits < this.hitsMax) this.heal(this);
        // Fight from rampart
        if (rampart && this.fightRampart(hostile)) return true;
        // Melee attacker
        if (this.getActiveBodyparts(ATTACK)) return this.attackHostile(hostile);
        // Ranged attacker
        if (this.getActiveBodyparts(RANGED_ATTACK) && !this.getActiveBodyparts(ATTACK)) this.fightRanged(hostile);
        // Opportunistic healer
        let injured = _.min(this.pos.findInRange(_.filter(this.room.creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)), 3), 'hits');
        if (injured && !this.getActiveBodyparts(ATTACK) && this.getActiveBodyparts(HEAL) && this.hits === this.hitsMax && this.pos.getRangeTo(hostile) > 3) this.rangedHeal(injured);
        return true;
        // If no target heal
    } else if (!noHeals && _.filter(this.room.friendlyCreeps, (c) => c.hits < c.hitsMax).length && this.getActiveBodyparts(HEAL)) {
        if (this.healMyCreeps()) return true;
        if (this.healAllyCreeps()) return true;
    }
    // If no target or heals stomp sites
    if (this.moveToHostileConstructionSites()) return true;
};

Creep.prototype.handleSquadMember = function (barrier = false, rampart = true) {
    let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.squadLeader);
    let hostile = this.findClosestEnemy(barrier);
    if (hostile && (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK))) {
        if (rampart && this.fightRampart()) return true;
        if (this.getActiveBodyparts(HEAL) && this.hits < this.hitsMax) this.heal(this);
        let injured = _.min(this.pos.findInRange(_.filter(this.room.creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)), 3), 'hits');
        if (injured && this.getActiveBodyparts(HEAL) && this.hits === this.hitsMax && this.pos.getRangeTo(hostile) > 3) this.rangedHeal(injured);
        if (this.getActiveBodyparts(ATTACK)) this.attackHostile(hostile);
        if (this.getActiveBodyparts(RANGED_ATTACK) && !this.getActiveBodyparts(ATTACK)) this.fightRanged(hostile);
        return true;
    } else if (this.getActiveBodyparts(HEAL)) {
        if (this.healMyCreeps()) return true;
        if (this.healAllyCreeps()) return true;
    }
    if (this.moveToHostileConstructionSites()) return true;
    if (this.pos.getRangeTo(squadLeader) > 2) this.shibMove(squadLeader, {ignoreCreeps: false})
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

Creep.prototype.fightRampart = function (hostile = undefined) {
    // Set target or used preset
    let target = hostile || this.findClosestEnemy(false, true);
    // If no targets or no body parts return
    if (!target || !target.pos || (!this.getActiveBodyparts(ATTACK) && !this.getActiveBodyparts(RANGED_ATTACK))) return false;
    // Rampart assignment
    let position;
    if (this.memory.assignedRampart) position = Game.getObjectById(this.memory.assignedRampart);
    // Find rampart
    if (!this.memory.assignedRampart || (Game.time % 3 === 0)) {
        delete this.memory.assignedRampart;
        position = target.pos.findClosestByPath(this.room.structures,
            {filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && !_.filter(this.room.creeps, (c) => c.memory && c.memory.assignedRampart === r.id && c.id !== this.id).length && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y))});
    }
    // If no rampart or rampart too far away return
    if (!position || position.pos.getRangeTo(target) > 25) return false;
    this.memory.assignedRampart = position.id;
    if (this.getActiveBodyparts(RANGED_ATTACK) && 1 < this.pos.getRangeTo(target) <= 3) {
        let targets = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(Memory._threatList, c.owner.username) || c.owner.username === 'Invader'});
        if (targets.length > 1) {
            this.rangedMassAttack();
        } else {
            this.rangedAttack(target);
        }
    }
    if (this.pos.getRangeTo(position) > 0) {
        this.shibMove(Game.getObjectById(this.memory.assignedRampart), {range: 0, ignoreCreeps: false});
        return true;
    }
    if (this.pos.getRangeTo(target) <= 1 && this.getActiveBodyparts(ATTACK)) {
        this.attack(target)
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
    let lastRange = this.memory.lastRange || range;
    this.memory.lastRange = range;
    let targets = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => !_.includes(FRIENDLIES, c.owner.username)});
    let allies = this.pos.findInRange(this.room.creeps, 4, {filter: (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my});
    if (range <= 3) {
        if (target instanceof Creep) {
            // Handle kite
            if (target.getActiveBodyparts(ATTACK) || (target.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER) > ((this.getActiveBodyparts(HEAL) * HEAL_POWER) * 0.6)) {
                // If close kite
                if (range <= 3) this.kite();
            }
            if (targets.length > 1 && !allies.length) {
                this.rangedMassAttack();
            } else {
                if (range === 1 && !allies.length) this.rangedMassAttack();
                if (range > 1) this.rangedAttack(target);
                if (!target.getActiveBodyparts(ATTACK)) this.shibMove(target, {
                    range: 1,
                    ignoreRoads: true
                });
            }
        } else {
            if (range === 1 && !allies.length) this.rangedMassAttack();
            if (range > 1) this.rangedAttack(target);
            this.shibMove(target, {
                range: 1,
                ignoreRoads: true
            });
        }
        return true;
    } else {
        let opportunity = _.min(targets, 'hits');
        if (opportunity) this.rangedAttack(opportunity);
        if (targets.length > 1 && !allies.length) this.rangedMassAttack();
        // If closing range do not advance
        if (range === 4 && lastRange === 6) return true;
        // Otherwise move to attack
        if (this.pos.findInRange(FIND_CREEPS, 1).length > 0) {
            this.shibMove(target, {ignoreCreeps: false, range: 3, ignoreRoads: true});
        } else {
            this.shibMove(target, {range: 3, ignoreRoads: true});
        }
        return true;
    }
};

Creep.prototype.attackInRange = function () {
    let hostile = this.findClosestEnemy(false);
    let injured = _.min(this.pos.findInRange(_.filter(this.room.creeps, (c) => c.hits < c.hitsMax && _.includes(FRIENDLIES, c.owner.username)), 3), 'hits');
    if (injured && this.getActiveBodyparts(HEAL) && this.hits === this.hitsMax && this.pos.getRangeTo(hostile) > 3) this.rangedHeal(injured);
    let range = this.pos.getRangeTo(hostile);
    let targets = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(Memory._threatList, c.owner.username) || c.owner.username === 'Invader'});
    let allies = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my});
    if (range <= 3) {
        if (hostile instanceof Creep && range <= 2 && (hostile.getActiveBodyparts(ATTACK) || hostile.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER > this.getActiveBodyparts(HEAL) * HEAL_POWER) && !hostile.fatigue) {
            this.kite();
        }
        if (targets.length > 1 && !allies.length) {
            this.rangedMassAttack();
        } else {
            if (range <= 1 && !allies.length) this.rangedMassAttack();
            if (range > 1) this.rangedAttack(hostile);
        }
        return true;
    } else {
        let opportunity = _.min(_.filter(this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(Memory._threatList, c.owner.username) || c.owner.username === 'Invader'})), 'hits');
        if (opportunity) this.rangedAttack(opportunity);
        if (targets.length > 1 && !allies.length) this.rangedMassAttack();
    }
};

Creep.prototype.moveToStaging = function () {
    if (!this.memory.waitFor || this.memory.stagingComplete || this.memory.waitFor === 1 || this.ticksToLive <= 250 || !this.memory.targetRoom || !Memory.targetRooms[this.memory.targetRoom]) return false;
    if (this.memory.staging) this.memory.stagingRoom = this.memory.staging;
    if (this.memory.stagingRoom === this.room.name) {
        if (this.findClosestEnemy()) return this.handleMilitaryCreep(false, true);
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 7});
        let inPlace = _.filter(this.room.creeps, (creep) => creep.memory && creep.memory.targetRoom === this.memory.targetRoom);
        if (inPlace.length >= this.memory.waitFor || this.ticksToLive <= 250) {
            this.memory.stagingComplete = true;
            if (!Memory.targetRooms[this.memory.targetRoom].lastWave || Memory.targetRooms[this.memory.targetRoom].lastWave + 50 < Game.time) {
                let waves = Memory.targetRooms[this.memory.targetRoom].waves || 0;
                Memory.targetRooms[this.memory.targetRoom].waves = waves + 1;
                Memory.targetRooms[this.memory.targetRoom].lastWave = Game.time;
            }
            return false;
        } else {
            if (this.pos.checkForRoad()) {
                this.moveRandom();
            }
            return true;
        }
    } else if (this.memory.stagingRoom) {
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 6});
        return true;
    }
    let alreadyStaged = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === this.memory.targetRoom && creep.memory.stagingRoom)[0];
    if (alreadyStaged) {
        this.memory.stagingRoom = alreadyStaged.memory.stagingRoom;
        this.shibMove(alreadyStaged, {repathChance: 0.5});
        return true;
    } else {
        let route = this.shibRoute(this.memory.targetRoom);
        let routeLength = route.length;
        if (routeLength <= 5) {
            this.memory.stagingRoom = this.memory.overlord;
            this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 19});
            return true;
        }
        let stageHere = _.round(routeLength / 3);
        this.memory.stagingRoom = route[stageHere];
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 19});
        return true;
    }
};

Creep.prototype.siege = function () {
    let healer = Game.getObjectById(this.memory.healer);
    if (this.room.name !== this.memory.targetRoom) {
        if (!healer || (this.pos.roomName === healer.pos.roomName && this.pos.getRangeTo(healer)) > 2) return this.shibMove(Game.getObjectById(this.memory.healer), {ignoreCreeps: false});
        return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
            ignoreCreeps: true,
            range: 20
        });
    }
    this.rangedMassAttack();
    if (this.room.controller && this.room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[Game.flags[name].pos.roomName] = {
            tick: tick,
            dDay: tick + this.room.controller.safeMode,
            type: 'pending',
        };
        Memory.targetRooms = cache;
        return this.suicide();
    }
    let target;
    let alliedCreep = _.filter(this.room.creeps, (c) => !c.my && _.includes(FRIENDLIES, c.owner));
    let neighborEnemyCreep = this.pos.findInRange(_.filter(this.room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner)), 1);
    if (neighborEnemyCreep.length && !neighborEnemyCreep[0].pos.checkForRampart()) {
        target = neighborEnemyCreep[0];
    }
    if (healer && (healer.fatigue > 0 || this.pos.getRangeTo(healer) > 1) && this.pos.x !== 48 && this.pos.x !== 1 && this.pos.y !== 48 && this.pos.y !== 1) return;
    if (!this.room.controller.owner || (this.room.controller.owner && !_.includes(FRIENDLIES, this.room.controller.owner.username))) {
        let targetFlags = _.filter(Game.flags, (f) => f.pos.roomName === this.pos.roomName && _.startsWith(f.name, 't') && f.pos.checkForAllStructure(true).length);
        if (targetFlags.length) {
            let flag = this.pos.findClosestByPath(targetFlags);
            if (flag) {
                target = flag.pos.checkForAllStructure()[0];
                this.memory.siegeTarget = target.id;
            }
        }
        let sharedTarget = _.filter(Game.creeps, (c) => c.memory && c.memory.siegeTarget && c.memory.targetRoom === this.memory.targetRoom)[0];
        if (sharedTarget) target = Game.getObjectById(sharedTarget.memory.siegeTarget);
        if (!target || !target) {
            target = this.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_TOWER)});
            if (target) this.memory.siegeTarget = target.id;
        }
        if (!target || !target) {
            target = this.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_SPAWN)});
            if (target) this.memory.siegeTarget = target.id;
        }
        if (!target || !target) {
            target = this.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_EXTENSION)});
            if (target) this.memory.siegeTarget = target.id;
        }
        if (!target || !target) {
            target = this.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_LINK && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER)});
            if (target) this.memory.siegeTarget = target.id;
        }
        if (!target || !target) {
            target = this.findClosestBarrier();
        }
        if (!target) {
            if (Memory.targetRooms) delete Memory.targetRooms[this.room.name];
            let terminal = this.room.terminal;
            let storage = this.room.storage;
            if ((terminal && _.sum(terminal.store) > 0) || (storage && _.sum(storage.store) > 0)) {
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[this.pos.roomName] = {
                    tick: tick,
                    type: 'robbery',
                    level: 1
                };
                Memory.targetRooms = cache;
            } else {
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[this.pos.roomName] = {
                    tick: tick,
                    type: 'hold',
                    level: 1
                };
                Memory.targetRooms = cache;
            }
            if (!this.pos.findInRange(alliedCreep, 3)[0] && this.getActiveBodyparts(RANGED_ATTACK) > 0) this.rangedMassAttack();
            this.moveToHostileConstructionSites();
        } else {
            switch (this.attack(target)) {
                case ERR_NOT_IN_RANGE:
                    if (!this.pos.findInRange(alliedCreep, 3)[0] && this.getActiveBodyparts(RANGED_ATTACK) > 0) this.rangedMassAttack();
                    this.heal(this);
                    this.shibMove(target, {ignoreCreeps: true, ignoreStructures: false});
                    this.room.visual.text(ICONS.noEntry, target.pos.x, target.pos.y, {
                        align: 'left',
                        opacity: 1
                    });
                    break;
                case ERR_NO_BODYPART:
                    if (!this.pos.findInRange(alliedCreep, 3)[0] && this.getActiveBodyparts(RANGED_ATTACK) > 0) this.rangedMassAttack();
                    this.heal(this);
                    this.shibMove(target, {ignoreCreeps: true});
                    break;
                case OK:
                    if (!this.pos.findInRange(alliedCreep, 3)[0] && this.getActiveBodyparts(RANGED_ATTACK) > 0) this.rangedMassAttack();
                    this.room.visual.text(ICONS.greenCheck, target.pos.x, target.pos.y, {
                        align: 'left',
                        opacity: 1
                    });
                    return true;

            }
        }
    }
};

Creep.prototype.squadHeal = function () {
    let range;
    let hostileRange = this.pos.getRangeTo(this.pos.findClosestByRange(this.room.creeps, {filter: (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1)}));
    let creepToHeal = this.pos.findClosestByRange(this.room.creeps, {filter: (c) => _.includes(FRIENDLIES, c.owner.username) && c.hits < c.hitsMax * 0.75});
    if (!creepToHeal) creepToHeal = this.pos.findClosestByRange(this.room.creeps, {filter: (c) => _.includes(FRIENDLIES, c.owner.username) && c.hits < c.hitsMax});
    if (creepToHeal) {
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
                this.shibMove(creepToHeal, {ignoreCreeps: true});
            }
        }
        return true;
    }
};

Creep.prototype.siegeHeal = function () {
    if (!Game.getObjectById(this.memory.healTarget) || !this.memory.healTarget) {
        if (!Game.getObjectById(this.memory.healTarget)) delete this.memory.healTarget;
        let deconstructor = _.filter(Game.creeps, (c) => (c.memory.role === 'deconstructor' || c.memory.role === 'siegeEngine') && c.memory.targetRoom === this.memory.targetRoom && (!c.memory.healer || !Game.getObjectById(c.memory.healer)))[0];
        if (!deconstructor) deconstructor = _.filter(Game.creeps, (c) => (c.memory.role === 'deconstructor' || c.memory.role === 'siegeEngine') && c.memory.targetRoom === this.memory.targetRoom)[0];
        if (deconstructor) {
            this.memory.healTarget = deconstructor.id;
            deconstructor.memory.healer = this.id;
        }
        return this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 14});
    } else {
        let deconstructor = Game.getObjectById(this.memory.healTarget);
        let moveRange = 0;
        let ignore = true;
        if (this.pos.x === 0 || this.pos.x === 49 || this.pos.y === 0 || this.pos.y === 49) {
            moveRange = 1;
            ignore = false;
        }
        if (this.room.name !== this.memory.targetRoom) ignore = false;
        this.shibMove(deconstructor, {range: moveRange, ignoreCreeps: ignore});
        let range = this.pos.getRangeTo(deconstructor);
        if (this.hits === this.hitsMax) {
            if (range <= 1) {
                this.heal(deconstructor);
            } else if (range > 1) this.rangedHeal(deconstructor);
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

Creep.prototype.kite = function (fleeRange = 8) {
    let avoid = this.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => c.getActiveBodyparts(ATTACK) > 0});
    let avoidance = _.map(this.pos.findInRange(avoid, fleeRange + 1),
        (c) => {
            return {pos: c.pos, range: 15};
        });
    let creep = this;
    let ret = PathFinder.search(this.pos, avoidance, {
        flee: true,
        swampCost: 75,
        plainCost: 1,
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
    let damagedDrainer = _.min(_.filter(this.room.creeps, (creep) => creep.memory && creep.memory.role === 'drainer' && creep.id !== this.id && this.pos.getRangeTo(creep) <= 5 && creep.hits < creep.hitsMax), 'hits');
    if (this.hits < this.hitsMax * 0.9 && !this.getActiveBodyparts(TOUGH) && this.room.name === this.memory.targetRoom) {
        this.memory.noDrain = 0;
        let exit = this.pos.findClosestByRange(FIND_EXIT);
        return this.shibMove(exit, {ignoreCreeps: false, range: 0});
    } else if (damagedDrainer.id) {
        this.memory.noDrain = 0;
        this.heal(damagedDrainer);
        this.shibMove(damagedDrainer, {range: 1})
    } else if (this.hits === this.hitsMax && this.room.name === this.memory.targetRoom) {
        let noDrainCount = this.memory.noDrain || 0;
        this.memory.noDrain = noDrainCount + 1;
        // If room is not drainable mark as such and recycle
        if (this.memory.noDrain >= 15) {
            let cache = Memory.targetRooms || {};
            cache[this.room.name] = {
                tick: Game.time,
                type: 'attack',
                priority: 1,
            };
            Memory.targetRooms = cache;
            this.room.cacheRoomIntel(true);
            Memory.roomCache[this.room.name].noDrain = true;
            this.memory.recycle = true;
        }
        this.borderCheck();
        this.heal(this);
        this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 15})
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
            if (matrix.get(x, y) < 0x03 && Game.map.getRoomTerrain(room.name).get(x, y) !== TERRAIN_MASK_WALL) {
                matrix.set(x, y, 0x03);
            }
        }
    }
    room.find(FIND_STRUCTURES).forEach(function (struct) {
        if (struct.structureType === STRUCTURE_ROAD) {
            // Favor roads over plain tiles
            matrix.set(struct.pos.x, struct.pos.y, 1);
        }
    });
    return matrix;
}

function addCreepsToMatrix(room, matrix) {
    room.creeps.forEach((creep) => matrix.set(creep.pos.x, creep.pos.y, 0xff));
    let bad = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && c.getActiveBodyparts(ATTACK));
    if (bad.length > 0) {
        for (let c = 0; c < bad.length; c++) {
            let sites = bad[c].room.lookForAtArea(LOOK_TERRAIN, bad[c].pos.y - 2, bad[c].pos.x - 2, bad[c].pos.y + 2, bad[c].pos.x + 2, true);
            for (let key in sites) {
                let position = new RoomPosition(sites[key].x, sites[key].y, room.name);
                if (!position.checkForWall()) {
                    matrix.set(position.x, position.y, 254)
                }
            }
        }
    }
    return matrix;
}

Creep.prototype.goHomeAndHeal = function () {
    let cooldown = this.memory.runCooldown || Game.time + 100;
    if (this.room.name !== this.memory.overlord) {
        this.memory.runCooldown = Game.time + 100;
        this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 19});
    } else if (Game.time >= cooldown) {
        this.memory.runCooldown = cooldown;
        this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 19});
    } else {
        return delete this.memory.cooldown;
    }
};

Creep.prototype.fleeHome = function () {
    if (!this.memory.runCooldown && !this.room.invaderCheck()) return false;
    let cooldown = this.memory.runCooldown || Game.time + 100;
    this.memory.runCooldown = cooldown;
    if (this.room.name !== this.memory.overlord) {
        this.memory.runCooldown = Game.time + 100;
        this.goToHub(this.memory.overlord, true);
        return true;
    } else if (Game.time < cooldown) {
        this.goToHub(this.memory.overlord, true);
        return true;
    } else {
        delete this.memory.runCooldown;
        return false;
    }
};

Creep.prototype.templarCombat = function () {
    let hostile = this.findClosestEnemy();
    let templars = _.filter(Game.creeps, (c) => c.memory && c.memory.role === 'templar' && c.memory.targetRoom === this.memory.targetRoom);
    let templarLeader = _.filter(templars, (c) => c.memory.templarLeader);
    let woundedTemplar = _.min(_.filter(templars, (c) => c.hits < c.hitsMax), 'hits');
    if (!templarLeader.length) this.memory.templarLeader = true;
    if (this.memory.templarLeader) {
        let inPosition = this.pos.findInRange(templars, 1);
        if (inPosition.length >= 4) {
            if (!hostile && this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
            if (hostile) {
                switch (this.rangedAttack(hostile)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        this.shibMove(hostile, {range: 3, squadMove: templars})
                }
            }
        } else {
            if (woundedTemplar) {

            }
        }
    } else {

    }
};

Creep.prototype.canIWin = function () {
    if (!this.room.hostileCreeps.length || this.room.name === this.memory.overlord) return true;
    let hostileCombatParts = 0;
    let armedHostiles = _.filter(this.room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0) && this.pos.getRangeTo(c) <= 8);
    for (let i = 0; i < armedHostiles.length; i++) {
        hostileCombatParts += armedHostiles[i].getActiveBodyparts(ATTACK);
        hostileCombatParts += armedHostiles[i].getActiveBodyparts(RANGED_ATTACK);
    }
    let alliedCombatParts = 0;
    let armedFriendlies = _.filter(this.room.friendlyCreeps, (c) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0 && this.pos.getRangeTo(c) <= 8);
    for (let i = 0; i < armedFriendlies.length; i++) {
        alliedCombatParts += armedFriendlies[i].getActiveBodyparts(ATTACK);
        alliedCombatParts += armedFriendlies[i].getActiveBodyparts(RANGED_ATTACK);
    }
    return !hostileCombatParts || hostileCombatParts * 0.9 < alliedCombatParts;
};

function findDefensivePosition(creep, target) {
    if (target) {
        if (!creep.memory.assignedRampart) {
            let bestRampart = target.pos.findClosestByPath(creep.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y)) && r.my});
            if (bestRampart) {
                creep.memory.assignedRampart = bestRampart.id;
                if (bestRampart.pos !== creep.pos) {
                    creep.shibMove(bestRampart, {range: 0});
                }
            }
        } else {
            creep.shibMove(Game.getObjectById(creep.memory.assignedRampart), {range: 0});
        }
    }
}