/////////////////////////////////////////////
/// COMBAT STUFF/////////////////////////////
/////////////////////////////////////////////

// Get attack/heal power and account for boosts
Creep.prototype.abilityPower = function () {
    let meleePower = 0;
    let rangedPower = 0;
    let healPower = 0;
    let rangedHealPower = 0;
    for (let part of this.body) {
        if (!part.hits) continue;
        if (part.boost) {
            if (part.type === ATTACK) {
                meleePower += ATTACK_POWER * BOOSTS[part.type][part.boost]['attack'];
            } else if (part.type === RANGED_ATTACK) {
                rangedPower += RANGED_ATTACK_POWER * BOOSTS[part.type][part.boost]['rangedAttack'];
            } else if (part.type === HEAL) {
                healPower += HEAL_POWER * BOOSTS[part.type][part.boost]['heal'];
                rangedHealPower += RANGED_HEAL_POWER * BOOSTS[part.type][part.boost]['heal'];
            } else if (part.type === TOUGH) {
                healPower += HEAL_POWER * (1 - BOOSTS[part.type][part.boost]['damage']);
            }
        } else {
            if (part.type === ATTACK) {
                meleePower += ATTACK_POWER;
            } else if (part.type === RANGED_ATTACK) {
                rangedPower += RANGED_ATTACK_POWER;
            } else if (part.type === HEAL) {
                healPower += HEAL_POWER;
            }
        }
    }
    return {
        attack: meleePower + rangedPower,
        meleeAttack: meleePower,
        rangedAttack: rangedPower,
        heal: healPower,
        rangedHeal: rangedHealPower,
        melee: meleePower,
        ranged: rangedPower
    };
};

Creep.prototype.findClosestEnemy = function (barriers = true, ignoreBorder = false, guardLocation = undefined, guardRange) {
    let enemy, filter;
    let hostileStructures = _.find(this.room.hostileStructures, (s) => (!s.owner || !FRIENDLIES.includes(s.owner.username)) && s.structureType !== STRUCTURE_RAMPART && (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange));
    let hostileCreeps = _.filter(this.room.hostileCreeps, (s) => (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange) && !s.pos.checkForRampart()) || _.filter(this.room.hostileCreeps, (s) => (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange));
    if (!hostileCreeps.length && !hostileStructures) return undefined;
    if (this.memory.target) {
        let oldTarget = Game.getObjectById(this.memory.target);
        if (oldTarget && oldTarget instanceof Structure) {
            if (oldTarget instanceof Structure && !this.room.hostileCreeps.length) return oldTarget;
            else this.memory.target = undefined;
        } else {
            this.memory.target = undefined;
        }
    }
    let barriersPresent = _.find(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
    // Find armed creeps to kill (Outside Ramps)
    if (this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK)) {
        filter = {
            filter: (c) => ((c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) &&
                (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0)) && !c.pos.checkForRampart())
        };
        if (!barriersPresent) enemy = this.pos.findClosestByRange(hostileCreeps, filter); else enemy = this.pos.findClosestByPath(hostileCreeps, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // Invader Cores
    enemy = _.find(this.room.structures, (c) => c.structureType === STRUCTURE_INVADER_CORE);
    if (enemy) {
        this.memory.target = enemy.id;
        return enemy;
    }
    let hostileRoom = INTEL[this.room.name].user && !_.includes(FRIENDLIES, INTEL[this.room.name].user);
    if (this.room.controller && (this.room.controller.owner || this.room.controller.reservation)) {
        let owner;
        if (this.room.controller.owner) owner = this.room.controller.owner.username; else owner = this.room.controller.reservation.username;
        hostileRoom = !FRIENDLIES.includes(owner);
    }
    let structures = _.filter(this.room.structures, (s) => (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange) && ![STRUCTURE_POWER_BANK, STRUCTURE_CONTROLLER, STRUCTURE_KEEPER_LAIR, STRUCTURE_INVADER_CORE].includes(s.structureType));
    // Kill towers then spawns
    if (hostileRoom && structures.length) {
        let nonBarriers = _.find(structures, (s) => ![STRUCTURE_WALL, STRUCTURE_RAMPART].includes(s.structureType));
        if (nonBarriers) {
            filter = {filter: (c) => c.structureType === STRUCTURE_TOWER && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()};
            if (!barriersPresent) enemy = this.pos.findClosestByRange(structures, filter); else enemy = this.pos.findClosestByPath(structures, filter);
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            filter = {filter: (c) => c.structureType === STRUCTURE_SPAWN && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()};
            if (!barriersPresent) enemy = _.find(structures, (c) => c.structureType === STRUCTURE_SPAWN && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()); else enemy = this.pos.findClosestByPath(structures, filter);
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            filter = {filter: (c) => c.structureType === STRUCTURE_TOWER && c.isActive()};
            if (!barriersPresent) enemy = this.pos.findClosestByRange(structures, filter); else enemy = this.pos.findClosestByPath(structures, filter);
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            filter = {filter: (c) => c.structureType === STRUCTURE_SPAWN && c.isActive()};
            if (!barriersPresent) enemy = _.find(structures, (c) => c.structureType === STRUCTURE_SPAWN && c.isActive()); else enemy = this.pos.findClosestByPath(structures, filter);
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            filter = {filter: (c) => c.structureType !== STRUCTURE_CONTROLLER && c.structureType !== STRUCTURE_ROAD && c.structureType !== STRUCTURE_WALL && c.structureType !== STRUCTURE_RAMPART && c.structureType !== STRUCTURE_CONTAINER && c.structureType !== STRUCTURE_POWER_BANK && c.structureType !== STRUCTURE_KEEPER_LAIR && c.structureType !== STRUCTURE_PORTAL};
            if (!barriersPresent) enemy = _.find(structures, filter); else enemy = this.pos.findClosestByPath(structures, filter);
        }
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        } else if (barriers) {
            enemy = this.findClosestBarrier();
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
        }
    }
    // Find unarmed creeps (Outside Ramps)
    if (this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK)) {
        filter = {
            filter: (c) => (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0) && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000))
        };
        if (!barriersPresent) enemy = this.pos.findClosestByRange(hostileCreeps, filter); else enemy = this.pos.findClosestByPath(hostileCreeps, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    return false;
};

Creep.prototype.findClosestBarrier = function (walls = true) {
    let barriers;
    if (walls) {
        barriers = _.filter(this.room.structures, (s) => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && (s.pos.isNearTo(this) || this.shibMove(s, {
            ignoreCreeps: false,
            confirmPath: true
        })));
    } else {
        barriers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && (s.pos.isNearTo(this) || this.shibMove(s, {
            ignoreCreeps: false,
            confirmPath: true
        })));
    }
    let sorted = barriers.sort(function (a, b) {
        return a.hits - b.hits;
    })[0]
    if (sorted) return sorted;
};

Creep.prototype.handleMilitaryCreep = function (barrier = false, rampart = true, ignoreBorder = false, unArmedFirst = false, guardLocation = undefined, guardRange = 8) {
    // Safemode check
    if (this.room.user && this.room.user !== MY_USERNAME && this.room.controller && this.room.controller.safeMode) return false;
    // Flee home if you have no parts
    if ((!this.hasActiveBodyparts(HEAL) || this.getActiveBodyparts(HEAL) === 1) && !this.hasActiveBodyparts(ATTACK) && !this.hasActiveBodyparts(RANGED_ATTACK)) return this.fleeHome(true);
    // Set target
    let hostile = this.findClosestEnemy(barrier, ignoreBorder, guardLocation, guardRange);
    // No target return false
    if (!hostile) return false;
    if (hostile && hostile.pos.checkForRampart()) {
        hostile = hostile.pos.checkForRampart();
        this.memory.target = hostile.id;
    }
    // Pair up DISABLED FOR DEBUGGING
    if (2 < 1 && hostile && this.room.friendlyCreeps.length > 1 && this.memory.role === 'longbow') {
        let friend = Game.getObjectById(this.memory.friendPair) || _.filter(this.room.myCreeps, (c) => c.id !== this.id && c.memory.role === 'longbow' && !c.memory.friendPair)[0];
        if (friend && friend.room.name === this.room.name) {
            this.memory.friendPair = friend.id;
            friend.memory.friendPair = this.id;
            if (this.memory.friendPairAlpha) return;
            friend.memory.friendPairAlpha = true;
        }
        if (!friend || friend.room.name !== this.room.name || (friend && !this.pairFighting(friend))) {
            this.memory.friendPair = undefined;
            this.memory.friendPairAlpha = undefined;
            if (friend) {
                friend.memory.friendPair = undefined;
                friend.memory.friendPairAlpha = undefined;
            }
        }
    }
    // If target fight
    if (hostile) {
        // Handle deconstructor
        if (this.hasActiveBodyparts(WORK) && this.scorchedEarth()) return true;
        // Fight from rampart
        if (rampart && this.fightRampart(hostile)) return true;
        // Melee attacker
        if (this.hasActiveBodyparts(ATTACK) && this.attackHostile(hostile)) return true;
        // Ranged attacker
        if (this.hasActiveBodyparts(RANGED_ATTACK) && this.fightRanged(hostile)) return true;
    } else
        // If no target or heals stomp sites
        return this.moveToHostileConstructionSites();
};

Creep.prototype.attackHostile = function (hostile) {
    delete this.memory.target;
    let moveTarget = hostile;
    let inRangeRampart = this.pos.findClosestByPath(this.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.my && r.pos.getRangeTo(hostile) <= 1});
    if (inRangeRampart) moveTarget = inRangeRampart;
    // Heal if possible
    this.healInRange();
    // If has a range part use it
    if (this.hasActiveBodyparts(RANGED_ATTACK) && this.pos.inRangeTo(hostile, 3)) this.rangedAttack(hostile);
    // Attack
    if (this.hasActiveBodyparts(ATTACK)) {
        switch (this.attack(hostile)) {
            case OK:
                this.memory.lastRange = undefined;
                this.memory.kiteCount = undefined;
                this.shibMove(moveTarget, {ignoreCreeps: false, range: 0});
                return true;
            case ERR_NOT_IN_RANGE:
                if (this.hasActiveBodyparts(HEAL) && this.hits < this.hitsMax) this.heal(this);
                let range = this.pos.getRangeTo(hostile);
                let lastRange = this.memory.lastRange || range;
                this.memory.lastRange = range;
                if (hostile instanceof Creep && Math.random() > 0.3 && range >= lastRange && range <= 4 && hostile.hasActiveBodyparts(RANGED_ATTACK) && this.hits < this.hitsMax * 0.95) {
                    this.memory.kiteCount = this.memory.kiteCount || 1;
                    if (this.memory.kiteCount > 5 || this.hits < this.hitsMax * 0.5) {
                        this.fleeHome(true);
                    } else {
                        this.shibKite(6);
                    }
                } else {
                    this.shibMove(moveTarget, {ignoreCreeps: false, range: 0});
                }
                return true;
        }
    }
    if (this.hasActiveBodyparts(WORK) && target instanceof Structure) {
        switch (this.dismantle(hostile)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                this.shibMove(moveTarget, {ignoreCreeps: false, range: 1});
                return true;
        }
    }
};

Creep.prototype.fightRampart = function (hostile = undefined) {
    // Set target or used preset
    let target = hostile || this.findClosestEnemy(false, true);
    // If no targets or no body parts return
    if (!target || !target.pos || (!this.hasActiveBodyparts(ATTACK) && !this.hasActiveBodyparts(RANGED_ATTACK))) return false;
    // Rampart assignment
    let position;
    if (this.memory.assignedRampart) position = Game.getObjectById(this.memory.assignedRampart);
    // Find rampart
    if (!this.memory.assignedRampart || (Game.time % 3 === 0)) {
        delete this.memory.assignedRampart;
        let range = 1;
        if (this.hasActiveBodyparts(RANGED_ATTACK)) range = 3;
        position = target.pos.findInRange(this.room.structures, range,
            {filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !_.filter(this.room.creeps, (c) => c.memory && c.memory.assignedRampart === r.id && c.id !== this.id).length && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y))})[0];
        if (!position) {
            position = target.pos.findClosestByPath(this.room.structures,
                {filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !_.filter(this.room.creeps, (c) => c.memory && c.memory.assignedRampart === r.id && c.id !== this.id).length && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y))});
        }
    }
    // If no rampart or rampart too far away return
    if (!position || position.pos.getRangeTo(target) > 25) return false;
    this.memory.assignedRampart = position.id;
    if (this.hasActiveBodyparts(RANGED_ATTACK) && 1 < this.pos.getRangeTo(target) <= 3) {
        let allies = this.pos.findInRange(this.room.creeps, 5, {filter: (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my}).length > 1 || this.pos.findInRange(this.room.structures, 5, {filter: (c) => c.owner && _.includes(FRIENDLIES, c.owner.username) && !c.my}).length > 1;
        let targets = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(Memory._threats, c.owner.username) || c.owner.username === 'Invader'});
        if (!allies && targets.length > 1) {
            this.rangedMassAttack();
        } else {
            this.rangedAttack(target);
        }
    }
    if (this.pos.getRangeTo(position) > 0) {
        this.shibMove(Game.getObjectById(this.memory.assignedRampart), {range: 0});
    }
    if (this.pos.getRangeTo(target) <= 1 && this.hasActiveBodyparts(ATTACK)) {
        this.attack(target)
    }
    return true;
};

Creep.prototype.pairFighting = function (partner, target = this.findClosestEnemy()) {
    if (!target || !partner) return false;
    let range = this.pos.getRangeTo(target);
    let partnerRange = partner.pos.getRangeTo(target);
    let lastRange = this.memory.lastRange || range;
    this.memory.lastRange = range;
    let allies = this.pos.findInRange(this.room.creeps, 5, {filter: (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my}).length > 1 || this.pos.findInRange(this.room.structures, 5, {filter: (c) => c.owner && _.includes(FRIENDLIES, c.owner.username) && !c.my}).length > 1;
    // Handle healing
    if (this.hits < this.hitsMax || partner.hits < partner.hitsMax) {
        if (this.hits === this.hitsMax && partner.hits < partner.hitsMax) this.heal(partner);
        else if (partner.hits === partner.hitsMax && this.hits < this.hitsMax) partner.heal(this);
        else if (this.hits < partner.hits) {
            this.heal(this);
            partner.heal(this);
        } else if (partner.hits < this.hits) {
            this.heal(partner);
            partner.heal(partner);
        }
    }
    if (range <= 3) {
        let moveRange = 0;
        if (target instanceof Creep) {
            let rmaTargets = this.pos.findInRange(this.room.hostileCreeps, 2);
            if ((rmaTargets.length > 1 || range === 1) && !allies) {
                this.say('BIG PEW!', true);
                partner.say('BIG PEW!', true);
                this.rangedMassAttack();
                partner.rangedMassAttack();
            } else {
                this.say('PEW!', true);
                partner.say('PEW!', true);
                this.rangedAttack(target);
                partner.rangedAttack(target);
            }
            // Handle melee attackers
            if (target.hasActiveBodyparts(ATTACK)) {
                moveRange = 3;
                if (range <= 3 && this.abilityPower().heal < target.abilityPower().attack) {
                    this.shibKite(3);
                    if (partner.pos.positionAtDirection(this.memory.lastKite) && !partner.pos.positionAtDirection(this.memory.lastKite).checkForImpassible()) return partner.move(this.memory.lastKite); else return partner.shibMove(this, {range: 0});
                }
            }
            this.shibMove(target, {range: moveRange, ignoreCreeps: false});
            let partnerSpot = this.pos.getAdjacentPositionAtRange(target, range) || this.pos;
            partner.shibMove(partnerSpot, {range: 0});
        } else {
            if (range <= 3) {
                this.say('PEW!', true);
                partner.say('PEW!', true);
                this.rangedAttack(target);
                partner.rangedAttack(target);
            }
            this.shibMove(target, {range: 1, ignoreCreeps: false});
            if (range !== partnerRange) {
                let partnerSpot = this.pos.getAdjacentPositionAtRange(target, range) || this.pos;
                partner.shibMove(partnerSpot, {range: 0});
            }
        }
        return true;
    } else {
        // If closing range do not advance
        if (target instanceof Creep && target.hasActiveBodyparts(ATTACK) && range === 4 && lastRange === 6) {
            if (range !== partnerRange) {
                let partnerSpot = this.pos.getAdjacentPositionAtRange(target, range) || this.pos;
                partner.shibMove(partnerSpot, {range: 0});
            }
            return true;
        }
        // Otherwise move to attack
        let moveRange = 2;
        if (target instanceof Creep && !target.hasActiveBodyparts(ATTACK)) moveRange = 3; else if (range >= lastRange) moveRange = 1;
        this.shibMove(target, {range: moveRange, ignoreCreeps: false});
        partner.shibMove(this, {range: 0});
        return true;
    }
};

Creep.prototype.fightRanged = function (target) {
    if (!this.canIWin(5)) return this.shibKite();
    let range = this.pos.getRangeTo(target);
    let lastRange = this.memory.lastRange || range;
    this.memory.lastRange = range;
    let targets = this.pos.findInRange(this.room.hostileCreeps, 3);
    let allies = this.pos.findInRange(this.room.creeps, 4, {filter: (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my}).length > 1 || this.pos.findInRange(this.room.structures, 5, {filter: (c) => c.owner && _.includes(FRIENDLIES, c.owner.username) && !c.my}).length > 1;
    let moveTarget = target;
    let inRangeRampart = this.pos.findClosestByPath(this.room.structures, {filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.my && r.pos.getRangeTo(target) <= 3});
    if (inRangeRampart) moveTarget = inRangeRampart;
    if (range <= 3) {
        let moveRange = 1;
        if (target instanceof Creep) {
            let rmaTargets = this.pos.findInRange(this.room.hostileCreeps, 1);
            if ((rmaTargets.length > 1 || range === 1) && !allies) {
                this.say('BIG PEW!', true);
                this.rangedMassAttack();
            } else {
                this.say('PEW!', true);
                this.rangedAttack(target);
            }
            if (inRangeRampart) {
                return this.shibMove(inRangeRampart, {range: 0, ignoreCreeps: false});
            } else if (target.hasActiveBodyparts(ATTACK) && range < 3) {
                if (!this.pos.checkForRampart() && this.abilityPower().heal < target.abilityPower().attack) {
                    return this.shibKite(3);
                }
            } else {
                this.shibMove(target, {range: moveRange, ignoreCreeps: false});
            }
        } else {
            this.say('BURN!', true);
            if (this.rangedAttack(target) === ERR_NOT_IN_RANGE) this.shibMove(moveTarget, {
                range: 1,
                ignoreCreeps: false
            });
        }
        return true;
    } else {
        let opportunity = _.min(targets, 'hits');
        if (opportunity) this.rangedAttack(opportunity);
        // If closing range do not advance
        if (target instanceof Creep && target.hasActiveBodyparts(ATTACK) && lastRange - range > 0) return true;
        // Otherwise move to attack
        let moveRange = 3;
        if (target instanceof Creep && !target.hasActiveBodyparts(ATTACK)) moveRange = 1;
        if (inRangeRampart) moveRange = 0;
        if (this.pos.findInRange(FIND_CREEPS, 1).length > 0) {
            this.shibMove(moveTarget, {ignoreCreeps: false, range: moveRange});
        } else {
            this.shibMove(moveTarget, {ignoreCreeps: false, range: moveRange});
        }
        return true;
    }
};

Creep.prototype.healCreeps = function () {
    let injured = _.sortBy(_.filter(this.room.creeps, (c) => (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax), function (c) {
        return (c.hits / c.hitsMax);
    })[0];
    if (injured) {
        this.say(ICONS.hospital, true);
        this.shibMove(injured, {range: 0});
        this.healInRange();
        return true;
    }
    return false;
};

Creep.prototype.healInRange = function () {
    if (!this.hasActiveBodyparts(HEAL)) return false;
    if (this.hits < this.hitsMax) return this.heal(this);
    let injured = _.find(this.room.creeps, (c) => (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax);
    if (injured) {
        let healCreep = _.find(this.room.creeps, (c) => (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax && this.pos.getRangeTo(c) <= 3);
        if (healCreep) {
            if (this.pos.isNearTo(healCreep)) return this.heal(healCreep); else return this.rangedHeal(healCreep);
        }
    }
    return false;
};

Creep.prototype.moveToHostileConstructionSites = function (creepCheck = false, onlyInBuild = true) {
    // No sites
    if (!this.room.constructionSites.length || (this.room.controller && this.room.controller.safeMode) || _.includes(FRIENDLIES, INTEL[this.room.name].user)) return false;
    // Friendly room
    let constructionSite = Game.getObjectById(this.memory.stompSite) || this.pos.findClosestByRange(this.room.constructionSites, {filter: (s) => !onlyInBuild || s.progress});
    if (constructionSite) {
        this.memory.stompSite = constructionSite.id;
        if (constructionSite.pos.x === this.pos.x && constructionSite.pos.y === this.pos.y) return this.moveRandom();
        this.shibMove(constructionSite, {range: 0, ignoreCreeps: false});
        this.say("STOMP", true);
        return true;
    } else this.memory.stompSite = undefined;
    return false;
};

Creep.prototype.scorchedEarth = function () {
    // Safemode check
    if (this.room.controller && this.room.controller.safeMode) return false;
    // Set target
    let hostile = Game.getObjectById(this.memory.target) || this.findClosestEnemy(true);
    // If target fight
    if (hostile) {
        this.memory.target = hostile.id;
        let sentence = [ICONS.respond, 'SCORCHED', 'EARTH'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        if (this.hasActiveBodyparts(ATTACK)) {
            switch (this.attack(hostile)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    if (this.hasActiveBodyparts(RANGED_ATTACK)) this.rangedAttack(hostile);
                    this.shibMove(hostile);
            }
        } else if (this.hasActiveBodyparts(RANGED_ATTACK)) {
            switch (this.rangedAttack(hostile)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    this.shibMove(hostile);
            }
        } else if (this.hasActiveBodyparts(WORK)) {
            switch (this.dismantle(hostile)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    this.shibMove(hostile);
            }
        }
        return true;
    } else {
        return false;
    }
};

Creep.prototype.attackInRange = function () {
    // If no ranged attack return
    if (!this.hasActiveBodyparts(RANGED_ATTACK)) return false;
    // If no targets return
    if (!this.room.hostileCreeps.length && !this.room.hostileStructures.length) return false;
    // If already engaged return
    if (Game.getObjectById(this.memory.target) && this.pos.inRangeTo(Game.getObjectById(this.memory.target), 3)) return this.rangedAttack(Game.getObjectById(this.memory.target));
    // Check for targets in range
    let hostile = Game.getObjectById(this.memory.opportunityAttack);
    if (!hostile || !hostile.pos.inRangeTo(this, 3) || hostile.pos.roomName !== this.room.name) {
        this.memory.opportunityAttack = undefined;
        if (this.room.hostileCreeps.length) hostile = this.pos.findFirstInRange(this.room.hostileCreeps, 3);
        if (!hostile && this.room.hostileStructures.length) hostile = this.pos.findFirstInRange(this.room.hostileStructures, 3);
    }
    if (!hostile) return false;
    this.memory.opportunityAttack = hostile.id;
    this.rangedAttack(hostile);
    return true;
};

Creep.prototype.moveToStaging = function () {
    if (!this.memory.other || !this.memory.other.waitFor || this.memory.stagingComplete || this.memory.other.waitFor === 1 || this.ticksToLive <= 250 || !this.memory.destination) return false;
    // Recycle if operation canceled
    if (!Memory.targetRooms[this.memory.destination]) return this.suicide();
    if (this.memory.stagingRoom === this.room.name) {
        if (this.findClosestEnemy()) return this.handleMilitaryCreep(false, true);
        this.shibMove(new RoomPosition(25, 25, this.memory.stagingRoom), {range: 7});
        let inPlace = _.filter(this.room.creeps, (creep) => creep.memory && creep.memory.destination === this.memory.destination);
        if (inPlace.length >= this.memory.other.waitFor || this.ticksToLive <= 250) {
            this.memory.stagingComplete = true;
            if (!Memory.targetRooms[this.memory.destination].lastWave || Memory.targetRooms[this.memory.destination].lastWave + 50 < Game.time) {
                let waves = Memory.targetRooms[this.memory.destination].waves || 0;
                Memory.targetRooms[this.memory.destination].waves = waves + 1;
                Memory.targetRooms[this.memory.destination].lastWave = Game.time;
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
    let alreadyStaged = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.destination && creep.memory.stagingRoom)[0];
    if (alreadyStaged) {
        this.memory.stagingRoom = alreadyStaged.memory.stagingRoom;
        this.shibMove(alreadyStaged);
        return true;
    } else {
        let route = this.shibRoute(this.memory.destination);
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

Creep.prototype.fleeHome = function (force = false) {
    if (this.room.controller && this.room.controller.owner && this.room.controller.owner.username === MY_USERNAME && !this.memory.runCooldown) return false;
    if (this.hits < this.hitsMax) force = true;
    if (!force && !this.memory.runCooldown && (this.hits === this.hitsMax || (!INTEL[this.room.name].lastCombat || INTEL[this.room.name].lastCombat + 10 < Game.time))) return false;
    if (!this.memory.ranFrom) this.memory.ranFrom = this.room.name;
    let cooldown = this.memory.runCooldown || Game.time + 50;
    let closest = this.memory.fleeDestination || this.room.findClosestOwnedRoom(false, 3);
    this.memory.fleeDestination = closest;
    if (this.room.name !== closest) {
        this.say('RUN!', true);
        let hostile = _.max(_.filter(this.room.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)), 'ticksToLive');
        if (hostile.id && !this.memory.military) {
            if (hostile.ticksToLive > this.ticksToLive) return this.suicide();
            this.memory.runCooldown = Game.time + hostile.ticksToLive;
        } else this.memory.runCooldown = Game.time + 50;
        this.shibMove(new RoomPosition(25, 25, closest), {range: 23});
    } else if (Game.time <= cooldown) {
        this.idleFor((cooldown - Game.time) / 2);
    } else {
        delete this.memory.ranFrom;
        delete this.memory.fleeDestination;
        delete this.memory.runCooldown;
    }
    return true;
};

Creep.prototype.canIWin = function (range = 50, inbound = undefined) {
    if ((!this.room.hostileCreeps.length && (!INTEL[this.room.name] || !INTEL[this.room.name].towers)) || this.room.name === this.memory.overlord) return true;
    // Check cache and refresh every 3 ticks
    if (this.memory.winCache && this.memory.winCache.room === this.room.name && this.memory.winCache.tick + 3 > Game.time) return this.memory.winCache.result;
    let hostilePower = 0;
    let healPower = 0;
    let meleeOnly = _.filter(this.room.hostileCreeps, (c) => c.hasActiveBodyparts(RANGED_ATTACK) && this.pos.getRangeTo(c) <= range).length === 0;
    let armedHostiles = _.filter(this.room.hostileCreeps, (c) => (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL)) && this.pos.getRangeTo(c) <= range);
    for (let i = 0; i < armedHostiles.length; i++) {
        if (armedHostiles[i].hasActiveBodyparts(HEAL)) {
            healPower += armedHostiles[i].abilityPower().heal;
        }
        if (!this.hasActiveBodyparts(RANGED_ATTACK)) hostilePower += armedHostiles[i].abilityPower().attack; else if (armedHostiles[i].hasActiveBodyparts(RANGED_ATTACK)) hostilePower += armedHostiles[i].abilityPower().rangedAttack;
    }
    let alliedPower = 0;
    let armedFriendlies = _.filter(this.room.friendlyCreeps, (c) => (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL)) && this.pos.getRangeTo(c) <= range);
    if (inbound) armedFriendlies = _.filter(Game.creeps, (c) => c.my && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL)) && (c.memory.destination && c.memory.destination === this.room.name));
    for (let i = 0; i < armedFriendlies.length; i++) {
        alliedPower += armedFriendlies[i].abilityPower().attack;
    }
    let hostileTowers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && !_.includes(FRIENDLIES, s.owner.username));
    for (let i = 0; i < hostileTowers.length; i++) {
        hostilePower += TOWER_POWER_FROM_RANGE(hostileTowers[i].pos.getRangeTo(this), TOWER_POWER_ATTACK);
    }
    let friendlyTowers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && _.includes(FRIENDLIES, s.owner.username));
    for (let i = 0; i < friendlyTowers.length; i++) {
        alliedPower += TOWER_POWER_FROM_RANGE(friendlyTowers[i].pos.getRangeTo(this), TOWER_POWER_ATTACK);
    }
    if (!INTEL[this.room.name]) this.room.cacheRoomIntel(true);
    INTEL[this.room.name].hostilePower = hostilePower;
    INTEL[this.room.name].friendlyPower = alliedPower;
    if (this.hasActiveBodyparts(RANGED_ATTACK) && meleeOnly && alliedPower > healPower) {
        this.memory.winCache = {};
        this.memory.winCache.room = this.room.name;
        this.memory.winCache.result = true;
        this.memory.winCache.tick = Game.time;
        return true;
    }
    if (armedHostiles.length && armedHostiles[0].owner.username === 'Invader') hostilePower *= 0.7;
    if (!hostilePower || hostilePower <= alliedPower || this.pos.checkForRampart()) {
        this.memory.winCache = {};
        this.memory.winCache.room = this.room.name;
        this.memory.winCache.result = true;
        this.memory.winCache.tick = Game.time;
        return true;
    } else {
        this.memory.winCache = {};
        this.memory.winCache.room = this.room.name;
        this.memory.winCache.result = false;
        this.memory.winCache.tick = Game.time;
        return false;
    }
};

Creep.prototype.findDefensivePosition = function (target = this) {
    if (this.id === target.id && this.room.hostileCreeps.length) target = this.pos.findClosestByRange(this.room.hostileCreeps);
    let bestRampart;
    // If a rampart is assigned probably use it, else find it
    if (this.memory.assignedRampart && (!this.room.hostileCreeps.length || Math.random() > 0.25)) bestRampart = Game.getObjectById(this.memory.assignedRampart); else {
        bestRampart = target.pos.findClosestByPath(this.room.structures, {
            filter: (r) => r.structureType === STRUCTURE_RAMPART &&
                !r.pos.checkForObstacleStructure() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) &&
                (r.my || r.isPublic) && (!r.room.hostileCreeps.length || target.id === this.id || this.pos.findPathTo(r).length < this.pos.findPathTo(target).length)
        });
    }
    if (bestRampart) {
        if (this.memory.assignedRampart !== bestRampart.id) {
            this.memory.assignedRampart = bestRampart.id;
        }
        let assigned = Game.getObjectById(this.memory.assignedRampart);
        if (assigned.pos.x !== this.pos.x || assigned.pos.y !== this.pos.y) {
            this.shibMove(assigned, {range: 0});
        }
        return true;
    } else {
        if (this.pos.getRangeTo(new RoomPosition(25, 25, this.room.name)) <= 12) this.idleFor(5); else this.shibMove(new RoomPosition(25, 25, this.room.name), {
            range: 12,
            avoidEnemies: true
        })
    }
    return false;
};

