/////////////////////////////////////////////
/// COMBAT STUFF/////////////////////////////
/////////////////////////////////////////////

// Get attack/heal power and account for boosts
Creep.prototype.abilityPower = function () {
    let meleePower = 0;
    let rangedPower = 0;
    let healPower = 0;
    for (let part of this.body) {
        if (!part.hits) continue;
        if (part.boost) {
            if (part.type === ATTACK) {
                meleePower += ATTACK_POWER * BOOSTS[part.type][part.boost]['attack'];
            } else if (part.type === RANGED_ATTACK) {
                rangedPower += RANGED_ATTACK_POWER * BOOSTS[part.type][part.boost]['rangedAttack'];
            } else if (part.type === HEAL) {
                healPower += HEAL_POWER * BOOSTS[part.type][part.boost]['heal'];
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
        defense: healPower,
        melee: meleePower,
        ranged: rangedPower
    };
};

Creep.prototype.findClosestEnemy = function (barriers = true, ignoreBorder = false, guardLocation = undefined, guardRange) {
    let enemy, filter;
    let hostileStructures = _.filter(this.room.hostileStructures, (s) => (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange) && s.structureType !== STRUCTURE_POWER_BANK);
    let structures = _.filter(this.room.structures, (s) => (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange) && s.structureType !== STRUCTURE_POWER_BANK);
    let hostileCreeps = _.filter(this.room.hostileCreeps, (s) => (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange));
    if (this.memory.target) {
        let oldTarget = Game.getObjectById(this.memory.target);
        if (oldTarget) {
            if (oldTarget instanceof Structure && !this.pos.findInRange(_.filter(hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK))), 5).length) return oldTarget;
            else if (oldTarget instanceof Creep && Math.random() > 0.3 && ((!guardLocation || oldTarget.pos.getRangeTo(guardLocation) < guardRange))) return oldTarget;
            else this.memory.target = undefined;
        } else {
            this.memory.target = undefined;
        }
    }
    let worthwhileStructures = hostileStructures.length > 0;
    if (!hostileCreeps.length && !worthwhileStructures) return undefined;
    if (this.memory.target && Game.getObjectById(this.memory.target) && Math.random() > 0.10 && !this.getActiveBodyparts(ATTACK) && !this.getActiveBodyparts(RANGED_ATTACK)) return Game.getObjectById(this.memory.target);
    let barriersPresent = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART).length;
    let hostileRoom = Memory.roomCache[this.room.name].user && !_.includes(FRIENDLIES, Memory.roomCache[this.room.name].user);
    // Towers die first (No ramps)
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType === STRUCTURE_TOWER && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(structures, filter); else enemy = this.pos.findClosestByPath(structures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // Find armed creeps to kill (Outside Ramps)
    if (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK)) {
        filter = {
            filter: (c) => ((c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(HEAL) >= 1) &&
                (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0)) && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000))
        };
        if (!barriersPresent) enemy = this.pos.findClosestByRange(hostileCreeps, filter); else enemy = this.pos.findClosestByPath(hostileCreeps, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // Kill spawns (No ramps)
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType === STRUCTURE_SPAWN && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(hostileStructures, filter); else enemy = this.pos.findClosestByPath(hostileStructures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // Cores
    filter = {filter: (c) => c.structureType === STRUCTURE_INVADER_CORE};
    enemy = this.pos.findClosestByRange(this.room.structures, filter);
    if (enemy) {
        this.memory.target = enemy.id;
        return enemy;
    }
    // Find unarmed creeps (Outside Ramps)
    if (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK)) {
        filter = {
            filter: (c) => (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0) && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000))
        };
        if (!barriersPresent) enemy = this.pos.findClosestByRange(hostileCreeps, filter); else enemy = this.pos.findClosestByPath(hostileCreeps, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // Towers/spawns die first (Ramps)
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType === STRUCTURE_TOWER && c.isActive()};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(structures, filter); else enemy = this.pos.findClosestByPath(structures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
        filter = {filter: (c) => c.structureType === STRUCTURE_SPAWN && c.isActive()};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(hostileStructures, filter); else enemy = this.pos.findClosestByPath(hostileStructures, filter);
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    // If friendly room leave other structures alone
    if (hostileRoom) {
        filter = {filter: (c) => c.structureType !== STRUCTURE_CONTROLLER && c.structureType !== STRUCTURE_ROAD && c.structureType !== STRUCTURE_WALL && c.structureType !== STRUCTURE_RAMPART && c.structureType !== STRUCTURE_CONTAINER && c.structureType !== STRUCTURE_POWER_BANK && c.structureType !== STRUCTURE_KEEPER_LAIR && c.structureType !== STRUCTURE_EXTRACTOR && c.structureType !== STRUCTURE_PORTAL};
        if (!barriersPresent) enemy = this.pos.findClosestByRange(structures, filter); else enemy = this.pos.findClosestByPath(structures, filter);
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
    // If you just need to kill barriers do that
    if (barriers) {
        enemy = this.findClosestBarrier();
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
    // Set target
    let hostile = this.findClosestEnemy(barrier, ignoreBorder, guardLocation, guardRange);
    if (hostile && hostile.pos.checkForRampart()) {
        hostile = hostile.pos.checkForRampart();
        this.memory.target = hostile.id;
    }
    // Pair up
    if (2 < 1 && hostile && this.room.friendlyCreeps.length > 1 && this.memory.role === 'longbow') {
        let friend = Game.getObjectById(this.memory.friendPair) || _.filter(this.room.friendlyCreeps, (c) => c.my && c.id !== this.id && c.memory.role === 'longbow' && !c.memory.friendPair)[0];
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
    // Flee home if you have no parts
    if ((!this.getActiveBodyparts(HEAL) || this.getActiveBodyparts(HEAL) === 1) && !this.getActiveBodyparts(ATTACK) && !this.getActiveBodyparts(RANGED_ATTACK)) return this.fleeHome(true);
    // If target fight
    if (hostile && hostile.pos.roomName === this.pos.roomName && (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK))) {
        // Heal if needed
        if (!this.getActiveBodyparts(ATTACK) && this.getActiveBodyparts(HEAL) && this.hits < this.hitsMax) this.heal(this);
        // Handle deconstructor
        if (this.getActiveBodyparts(WORK) && this.attackHostile(hostile)) return true;
        // Fight from rampart
        if (rampart && this.fightRampart(hostile)) return true;
        // Melee attacker
        if (this.getActiveBodyparts(ATTACK) && this.attackHostile(hostile)) return true;
        // Ranged attacker
        return !!(this.getActiveBodyparts(RANGED_ATTACK) && this.fightRanged(hostile));
    } else if (_.filter(this.room.friendlyCreeps, (c) => c.hits < c.hitsMax).length && this.getActiveBodyparts(HEAL)) {
        if (this.healCreeps()) return true;
    }
    // If no target or heals stomp sites
    return this.moveToHostileConstructionSites();
};

Creep.prototype.attackHostile = function (hostile) {
    delete this.memory.target;
    let moveTarget = hostile;
    let inRangeRampart = this.pos.findClosestByPath(this.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.my && r.pos.getRangeTo(hostile) <= 1});
    if (inRangeRampart) moveTarget = inRangeRampart;
    // If has a range part use it
    if (this.getActiveBodyparts(RANGED_ATTACK) && this.pos.getRangeTo(hostile) <= 3) this.rangedAttack(hostile);
    // Attack
    if (this.getActiveBodyparts(ATTACK)) {
        switch (this.attack(hostile)) {
            case OK:
                this.memory.lastRange = undefined;
                this.memory.kiteCount = undefined;
                this.shibMove(moveTarget, {ignoreCreeps: false, range: 0});
                return true;
            case ERR_NOT_IN_RANGE:
                if (this.getActiveBodyparts(HEAL) && this.hits < this.hitsMax) this.heal(this);
                let range = this.pos.getRangeTo(hostile);
                let lastRange = this.memory.lastRange || range;
                this.memory.lastRange = range;
                if (hostile instanceof Creep && Math.random() > 0.3 && range >= lastRange && range <= 4 && hostile.getActiveBodyparts(RANGED_ATTACK) && this.hits < this.hitsMax * 0.95) {
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
    if (this.getActiveBodyparts(WORK) && target instanceof Structure) {
        switch (this.dismantle(hostile)) {
            case OK:
                return true;
            case ERR_NOT_IN_RANGE:
                this.shibMove(moveTarget, {ignoreCreeps: false, range: 1});
                return true;
        }
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
    if (this.hits < this.hitsMax) return this.heal(this);
    let healCreeps = _.sortBy(_.filter(this.room.creeps, (c) => (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax && this.pos.getRangeTo(c) <= 3), function (c) {
        return (c.hits / c.hitsMax);
    });
    if (healCreeps.length > 0) {
        if (this.pos.isNearTo(healCreeps[0])) return this.heal(healCreeps[0]); else return this.rangedHeal(healCreeps[0]);
    }
    return false;
};

Creep.prototype.moveToHostileConstructionSites = function (creepCheck = false, onlyInBuild = true) {
    // No sites
    if (!this.room.constructionSites.length || (creepCheck && this.room.hostileCreeps.length) || _.includes(FRIENDLIES, Memory.roomCache[this.room.name].user)) return false;
    // Friendly room
    let constructionSite = Game.getObjectById(this.memory.stompSite) || this.pos.findClosestByRange(this.room.constructionSites, {filter: (s) => !_.includes(FRIENDLIES, s.owner.username) && (!onlyInBuild || s.progress)});
    if (constructionSite) {
        this.memory.stompSite = constructionSite.id;
        if (constructionSite.pos.x === this.pos.x && constructionSite.pos.y === this.pos.y) return this.moveRandom();
        this.shibMove(constructionSite, {range: 0, ignoreCreeps: false});
        return true;
    }
    return false;
};

Creep.prototype.scorchedEarth = function () {
    // Safemode check
    if (this.room.user && this.room.user !== MY_USERNAME && this.room.controller && this.room.controller.safeMode) return false;
    // Friendly check
    if (this.room.user && _.includes(FRIENDLIES, this.room.user)) return false;
    // Set target
    let hostile = this.findClosestEnemy(true);
    // If target fight
    if (hostile && hostile.pos.roomName === this.pos.roomName && (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK) || this.getActiveBodyparts(WORK))) {
        let sentence = [ICONS.respond, 'SCORCHED', 'EARTH'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        if (this.getActiveBodyparts(ATTACK)) {
            switch (this.attack(hostile)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    if (this.getActiveBodyparts(RANGED_ATTACK)) this.rangedMassAttack();
                    this.shibMove(hostile);
            }
        }
        if (this.getActiveBodyparts(RANGED_ATTACK)) {
            let range = 0;
            if (hostile.pos.checkForImpassible()) range = 1;
            if (hostile.structureType !== STRUCTURE_ROAD && hostile.structureType !== STRUCTURE_WALL && hostile.structureType !== STRUCTURE_CONTAINER) this.rangedMassAttack(); else {
                range = 3;
                this.rangedAttack(hostile);
            }
            this.shibMove(hostile, {range: range});
        }
        if (this.getActiveBodyparts(WORK)) {
            switch (this.dismantle(hostile)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    this.shibMove(hostile);
            }
        }
        return true;
    } else {
        this.memory.scorchedTarget = undefined;
        return false;
    }
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
        let range = 1;
        if (this.getActiveBodyparts(RANGED_ATTACK)) range = 3;
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
    if (this.getActiveBodyparts(RANGED_ATTACK) && 1 < this.pos.getRangeTo(target) <= 3) {
        let targets = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(Memory._threatList, c.owner.username) || c.owner.username === 'Invader'});
        if (targets.length > 1) {
            this.rangedMassAttack();
        } else {
            this.rangedAttack(target);
        }
    }
    if (this.pos.getRangeTo(position) > 0) {
        this.shibMove(Game.getObjectById(this.memory.assignedRampart), {range: 0});
    }
    if (this.pos.getRangeTo(target) <= 1 && this.getActiveBodyparts(ATTACK)) {
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
    let allies = this.pos.findInRange(this.room.friendlyCreeps, 4, {filter: (c) => !c.my});
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
            if ((rmaTargets.length > 1 || range === 1) && !allies.length) {
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
            if (target.getActiveBodyparts(ATTACK)) {
                moveRange = 3;
                if (range <= 3 && this.abilityPower().defense < target.abilityPower().attack) {
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
        if (target instanceof Creep && target.getActiveBodyparts(ATTACK) && range === 4 && lastRange === 6) {
            if (range !== partnerRange) {
                let partnerSpot = this.pos.getAdjacentPositionAtRange(target, range) || this.pos;
                partner.shibMove(partnerSpot, {range: 0});
            }
            return true;
        }
        // Otherwise move to attack
        let moveRange = 2;
        if (target instanceof Creep && !target.getActiveBodyparts(ATTACK)) moveRange = 3; else if (range >= lastRange) moveRange = 1;
        this.shibMove(target, {range: moveRange, ignoreCreeps: false});
        partner.shibMove(this, {range: 0});
        return true;
    }
};

Creep.prototype.fightRanged = function (target) {
    let range = this.pos.getRangeTo(target);
    let lastRange = this.memory.lastRange || range;
    this.memory.lastRange = range;
    let targets = this.pos.findInRange(this.room.hostileCreeps, 3);
    let allies = this.pos.findInRange(this.room.friendlyCreeps, 4, {filter: (c) => !c.my});
    let moveTarget = target;
    let inRangeRampart = this.pos.findClosestByPath(this.room.structures, {filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.my && r.pos.getRangeTo(target) <= 3});
    if (inRangeRampart) moveTarget = inRangeRampart;
    if (range <= 3) {
        let moveRange = 0;
        if (target instanceof Creep) {
            let rmaTargets = this.pos.findInRange(this.room.hostileCreeps, 3);
            if ((rmaTargets.length > 1 || range === 1) && !allies.length) {
                this.say('BIG PEW!', true);
                this.rangedMassAttack();
            } else {
                this.say('PEW!', true);
                this.rangedAttack(target);
            }
            // Handle melee attackers
            if (target.getActiveBodyparts(ATTACK)) {
                moveRange = 3;
                if (range < 3 && !this.pos.checkForRampart() && this.abilityPower().defense < target.abilityPower().attack) {
                    this.say('PEW!', true);
                    this.rangedAttack(target);
                    return this.shibKite(3);
                }
            }
            if (inRangeRampart) {
                this.shibMove(inRangeRampart, {range: 0, ignoreCreeps: false});
            } else {
                this.shibMove(target, {range: moveRange, ignoreCreeps: false});
            }
        } else {
            this.say('PEW!', true);
            if (range > 1 && range <= 3) this.rangedAttack(target);
            this.shibMove(moveTarget, {
                range: 0,
                ignoreCreeps: false
            });
        }
        return true;
    } else {
        let opportunity = _.min(targets, 'hits');
        if (opportunity) this.rangedAttack(opportunity);
        if (targets.length > 1 && !allies.length) this.rangedMassAttack();
        // If closing range do not advance
        if (target instanceof Creep && target.getActiveBodyparts(ATTACK) && range === 4 && lastRange === 6) return true;
        // Otherwise move to attack
        let moveRange = 3;
        if (target instanceof Creep && !target.getActiveBodyparts(ATTACK)) moveRange = 1; else if (range >= lastRange) moveRange = 1;
        if (inRangeRampart) moveRange = 0;
        if (this.pos.findInRange(FIND_CREEPS, 1).length > 0) {
            this.shibMove(moveTarget, {ignoreCreeps: false, range: moveRange});
        } else {
            this.shibMove(moveTarget, {ignoreCreeps: false, range: moveRange});
        }
        return true;
    }
};

Creep.prototype.attackInRange = function () {
    // If no targets return
    let hostileStructures = _.filter(this.room.hostileStructures, (s) => s.structureType !== STRUCTURE_POWER_BANK && s.structureType !== STRUCTURE_CONTROLLER);
    if (!this.room.hostileCreeps.length && !hostileStructures.length) return false;
    // Check for targets in range
    let hostile;
    if (this.getActiveBodyparts(RANGED_ATTACK)) hostile = this.pos.findInRange(this.room.hostileCreeps, 3)[0] || this.pos.findInRange(this.room.hostileStructures, 3)[0];
    else if (this.getActiveBodyparts(ATTACK)) hostile = this.pos.findInRange(this.room.hostileCreeps, 1)[0] || this.pos.findInRange(this.room.hostileStructures, 1)[0];
    else if (this.getActiveBodyparts(WORK)) hostile = this.pos.findInRange(this.room.hostileStructures, 1)[0];
    if (!hostile) return false;
    if (this.getActiveBodyparts(RANGED_ATTACK)) {
        let leader = Game.getObjectById(this.memory.squadLeader);
        if (leader && leader.memory.target && this.pos.getRangeTo(Game.getObjectById(leader.memory.target)) <= 3) hostile = Game.getObjectById(leader.memory.target);
        let targets = _.union(this.pos.findInRange(this.room.creeps, 3, {filter: (c) => (!_.includes(FRIENDLIES, c.owner.username)) || c.owner.username === 'Invader' || c.owner.username === 'Source Keeper'}), this.pos.findInRange(this.room.hostileStructures, 3));
        let allies = this.pos.findInRange(this.room.creeps, 3, {filter: (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my});
        let range = this.pos.getRangeTo(hostile);
        if (targets.length > 1 && !allies.length) {
            this.rangedMassAttack();
        } else {
            if (range <= 1 && !allies.length) this.rangedMassAttack();
            if (range > 1) this.rangedAttack(hostile);
        }
    } else if (this.getActiveBodyparts(ATTACK)) {
        let leader = Game.getObjectById(this.memory.squadLeader);
        if (leader && leader.memory.target && this.pos.isNearTo(Game.getObjectById(leader.memory.target))) hostile = Game.getObjectById(leader.memory.target);
        this.attack(hostile);
    } else {
        this.dismantle(hostile);
    }
    return true;
};

Creep.prototype.moveToStaging = function () {
    if (!this.memory.other || !this.memory.other.waitFor || this.memory.stagingComplete || this.memory.other.waitFor === 1 || this.ticksToLive <= 250 || !this.memory.destination) return false;
    // Recycle if operation canceled
    if (!Memory.targetRooms[this.memory.destination]) return this.memory.recycle = true;
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
    if (!force && !this.memory.runCooldown && (this.hits === this.hitsMax || (!Memory.roomCache[this.room.name].lastCombat || Memory.roomCache[this.room.name].lastCombat + 10 < Game.time))) return false;
    if (!this.memory.ranFrom) this.memory.ranFrom = this.room.name;
    let cooldown = this.memory.runCooldown || Game.time + 50;
    let closest = this.memory.fleeDestination || this.room.findClosestOwnedRoom(false, 3);
    this.memory.fleeDestination = closest;
    if (this.room.name !== closest) {
        this.say('RUN!', true);
        let hostile = _.max(_.filter(this.room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)), 'ticksToLive');
        if (hostile.id && !this.memory.military) {
            if (hostile.ticksToLive > this.ticksToLive) return this.memory.recycle = true;
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
    if (!this.room.hostileCreeps.length || this.room.name === this.memory.overlord) return true;
    let hostilePower = 0;
    let healPower = 0;
    let meleeOnly = _.filter(this.room.hostileCreeps, (c) => c.getActiveBodyparts(RANGED_ATTACK) && this.pos.getRangeTo(c) <= range).length === 0;
    let armedHostiles = _.filter(this.room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(HEAL)) && this.pos.getRangeTo(c) <= range);
    for (let i = 0; i < armedHostiles.length; i++) {
        if (armedHostiles[i].getActiveBodyparts(HEAL)) {
            hostilePower += armedHostiles[i].abilityPower().defense;
            healPower += armedHostiles[i].abilityPower().defense;
        }
        if (!this.getActiveBodyparts(RANGED_ATTACK)) hostilePower += armedHostiles[i].abilityPower().attack; else if (armedHostiles[i].getActiveBodyparts(RANGED_ATTACK)) hostilePower += armedHostiles[i].abilityPower().rangedAttack;
    }
    let alliedPower = 0;
    let armedFriendlies = _.filter(this.room.friendlyCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(HEAL)) && this.pos.getRangeTo(c) <= range);
    if (inbound) armedFriendlies = _.filter(Game.creeps, (c) => c.my && (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(HEAL)) && ((c.memory.destination && c.memory.destination === this.room.name) || (c.memory.other && c.memory.other.responseTarget === this.room.name)));
    for (let i = 0; i < armedFriendlies.length; i++) {
        if (armedFriendlies[i].getActiveBodyparts(HEAL)) alliedPower += armedFriendlies[i].abilityPower().defense;
        alliedPower += armedFriendlies[i].abilityPower().attack;
    }
    let hostileTowers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && !_.includes(FRIENDLIES, s.owner.username));
    for (let i = 0; i < hostileTowers.length; i++) {
        hostilePower += 150;
    }
    let friendlyTowers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && _.includes(FRIENDLIES, s.owner.username));
    for (let i = 0; i < friendlyTowers.length; i++) {
        alliedPower += 150;
    }
    if (!Memory.roomCache[this.room.name]) this.room.cacheRoomIntel(true);
    Memory.roomCache[this.room.name].hostilePower = hostilePower;
    Memory.roomCache[this.room.name].friendlyPower = alliedPower;
    if (this.getActiveBodyparts(RANGED_ATTACK) && meleeOnly && alliedPower > healPower) return true;
    if (armedHostiles.length && armedHostiles[0].owner.username === 'Invader') hostilePower *= 0.7;
    return !hostilePower || hostilePower <= alliedPower || this.pos.checkForRampart();
};

Creep.prototype.findDefensivePosition = function (target = this) {
    if (this.id === target.id && this.room.hostileCreeps.length) target = this.pos.findClosestByRange(this.room.hostileCreeps);
    if (target) {
        if (!this.memory.assignedRampart) {
            let bestRampart = target.pos.findClosestByPath(this.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && (target !== this || !r.pos.checkForRoad()) && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.my});
            if (bestRampart) {
                this.memory.assignedRampart = bestRampart.id;
                if (bestRampart.pos !== this.pos) {
                    this.shibMove(bestRampart, {range: 0});
                    return true;
                }
            }
        } else {
            if (this.pos.getRangeTo(Game.getObjectById(this.memory.assignedRampart))) {
                this.shibMove(Game.getObjectById(this.memory.assignedRampart), {range: 0});
            } else {
                let idleFor = this.pos.getRangeTo(this.pos.findClosestByRange(FIND_EXIT)) - 4;
                if (idleFor <= 5) idleFor = 5;
                this.idleFor(idleFor);
            }
            return true;
        }
    }
    return false;
};