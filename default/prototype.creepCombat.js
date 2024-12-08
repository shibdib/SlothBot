/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/////////////////////////////////////////////
/// COMBAT STUFF/////////////////////////////
/////////////////////////////////////////////

/**
 * Handle military creep
 * @param barrier
 * @param rampart
 * @param ignoreBorder
 * @param guardLocation
 * @param guardRange
 * @returns {boolean|*}
 */
Creep.prototype.handleMilitaryCreep = function (barrier = false, rampart = true, ignoreBorder = false, guardLocation = undefined, guardRange = 8) {
    // Safemode check
    if (this.room.user && this.room.user !== MY_USERNAME && this.room.controller && this.room.controller.safeMode) return false;
    // Heal if possible
    this.healInRange();
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
        // Handle cleaner
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

/**
 * Get attack/heal power and account for boosts
 * @returns {{meleeAttack: number, ranged: number, attack: number, heal: number, rangedAttack: number, melee: number, rangedHeal: number}}
 */
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

/**
 * Find closest enemy
 * @param barriers
 * @param ignoreBorder
 * @param guardLocation
 * @param guardRange
 * @returns {*|undefined|Structure}
 */
Creep.prototype.findClosestEnemy = function (barriers = true, ignoreBorder = false, guardLocation = undefined, guardRange) {
    let enemy;
    let hostileStructures = _.find(this.room.impassibleStructures, (s) => (!s.owner || !FRIENDLIES.includes(s.owner.username)) && (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange));
    let hostileCreeps = _.filter(this.room.hostileCreeps, (s) => (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange) && !s.pos.checkForRampart()) || _.filter(this.room.hostileCreeps, (s) => (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange));
    if (!hostileCreeps.length && !hostileStructures) return undefined;
    // If we already have a target, keep it if it's still valid
    if (this.memory.target) {
        let oldTarget = Game.getObjectById(this.memory.target);
        if (oldTarget && oldTarget instanceof Structure && !this.room.hostileCreeps.length) {
            return oldTarget;
        } else {
            this.memory.target = undefined;
        }
    }
    let barriersPresent = _.find(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
    // Find armed creeps to kill (Outside Ramps)
    if (this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK)) {
        if (!barriersPresent) enemy = this.pos.findClosestByRange(hostileCreeps, {filter: (c) => ((c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) && (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0)) && !c.pos.checkForRampart())}); else enemy = this.pos.findClosestByPath(hostileCreeps, {filter: (c) => ((c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) && (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0)) && !c.pos.checkForRampart())});
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
        // Towers with no ramparts
        if (!barriersPresent) enemy = this.pos.findClosestByRange(this.room.impassibleStructures, {filter: (c) => c.structureType === STRUCTURE_TOWER && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()}); else enemy = this.pos.findClosestByPath(this.room.impassibleStructures, {filter: (c) => c.structureType === STRUCTURE_TOWER && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()});
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
        // Spawns with no ramparts
        if (!barriersPresent) enemy = _.find(this.room.impassibleStructures, {filter: (c) => c.structureType === STRUCTURE_SPAWN && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()}); else enemy = this.pos.findClosestByPath(this.room.impassibleStructures, {filter: (c) => c.structureType === STRUCTURE_SPAWN && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()});
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
        // Find unarmed creeps (Outside Ramps)
        if (!barriersPresent) enemy = this.pos.findClosestByRange(hostileCreeps, {filter: (c) => (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0) && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000))}); else enemy = this.pos.findClosestByPath(hostileCreeps, {filter: (c) => (ignoreBorder || (c.pos.x < 49 && c.pos.x > 0 && c.pos.y < 49 && c.pos.y > 0) && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000))});
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        }
    }
    if (enemy) {
        this.memory.target = enemy.id;
        return enemy;
    }
    return undefined;
};

/**
 * Find closest hostile structure
 * @param barriers
 * @returns {undefined|*}
 */
Creep.prototype.findClosestHostileStructure = function (barriers = true) {
    let enemy;
    let hostileStructures = _.find(this.room.impassibleStructures, (s) => (!s.owner || !FRIENDLIES.includes(s.owner.username)) || s.structureType === STRUCTURE_WALL);
    if (!hostileStructures) return undefined;
    if (this.memory.target) {
        let oldTarget = Game.getObjectById(this.memory.target);
        if (oldTarget) {
            return oldTarget;
        } else {
            this.memory.target = undefined;
        }
    }
    // Invader Cores
    enemy = _.find(this.room.impassibleStructures, (c) => c.structureType === STRUCTURE_INVADER_CORE);
    if (enemy) {
        this.memory.target = enemy.id;
        return enemy;
    }
    let hostileRoom = !_.includes(FRIENDLIES, INTEL[this.room.name].owner);
    let structures = _.filter(this.room.structures, (s) => ((s) => !s.owner || !FRIENDLIES.includes(s.owner.username)) && s.hits && ![STRUCTURE_POWER_BANK, STRUCTURE_CONTROLLER, STRUCTURE_KEEPER_LAIR, STRUCTURE_INVADER_CORE, STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_PORTAL].includes(s.structureType));
    let barriersPresent = _.find(structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
    // Kill towers then spawns
    if (hostileRoom && structures.length) {
        let nonBarriers = _.find(structures, (s) => ![STRUCTURE_WALL, STRUCTURE_RAMPART].includes(s.structureType));
        if (nonBarriers) {
            // Pathable towers
            enemy = this.pos.findClosestByPath(structures, {filter: (c) => c.structureType === STRUCTURE_TOWER && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000)});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            enemy = this.pos.findClosestByPath(structures, {filter: (c) => c.structureType === STRUCTURE_TOWER});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            // Pathable Spawn
            enemy = this.pos.findClosestByPath(structures, {filter: (c) => c.structureType === STRUCTURE_SPAWN && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000)});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            enemy = this.pos.findClosestByPath(structures, {filter: (c) => c.structureType === STRUCTURE_SPAWN});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            // Towers with no ramparts
            enemy = this.pos.findClosestByRange(structures, {filter: (c) => c.structureType === STRUCTURE_TOWER && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            // Spawns with no ramparts
            enemy = this.pos.findClosestByRange(structures, {filter: (c) => c.structureType === STRUCTURE_SPAWN && (!c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000) && c.isActive()});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            // Towers
            enemy = this.pos.findClosestByRange(structures, {filter: (c) => c.structureType === STRUCTURE_TOWER && c.isActive()});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            // Spawns
            enemy = this.pos.findClosestByRange(structures, {filter: (c) => c.structureType === STRUCTURE_SPAWN && c.isActive()});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
            // All other structures
            enemy = this.pos.findClosestByRange(structures, {filter: (c) => c.structureType !== STRUCTURE_WALL && c.structureType !== STRUCTURE_RAMPART});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
        }
        if (enemy) {
            this.memory.target = enemy.id;
            return enemy;
        } else if (barriers) {
            enemy = this.pos.findClosestByPath(structures, {filter: (c) => c.structureType === STRUCTURE_RAMPART || c.structureType === STRUCTURE_WALL});
            if (enemy) {
                this.memory.target = enemy.id;
                return enemy;
            }
        }
    }
    return undefined;
};

/**
 * Handle attacking
 * @param hostile
 * @returns {boolean}
 */
Creep.prototype.attackHostile = function (hostile) {
    if (!this.room.hostileCreeps.length) return false;
    let moveTarget = hostile;
    let inRangeRampart = this.pos.findClosestByPath(this.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && r.my && r.pos.getRangeTo(hostile) <= 1});
    if (inRangeRampart) moveTarget = inRangeRampart;
    // If we have a range part use it
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

/**
 * Handle rampart fighting
 * @param hostile
 * @returns {boolean}
 */
Creep.prototype.fightRampart = function (hostile = undefined) {
    // Set target or used preset
    let target = hostile || this.findClosestEnemy(false, true);
    // If no targets or no body parts return
    if (!target || !target.pos || (!this.hasActiveBodyparts(ATTACK) && !this.hasActiveBodyparts(RANGED_ATTACK)) || (target instanceof Creep && !target.hasActiveBodyparts(ATTACK) && !target.hasActiveBodyparts(RANGED_ATTACK))) return false;
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

/**
 * Handle ranged fighting with optimal movement and targeting
 * @param target
 * @returns {void|boolean}
 */
Creep.prototype.fightRanged = function (target) {
    if (!this.room.hostileCreeps.length) return false;

    // Ensure the creep is not too close to enemies or other obstacles
    if (!this.canIWin(5)) return this.shibKite();

    let range = this.pos.getRangeTo(target);
    let lastRange = this.memory.lastRange || range;
    this.memory.lastRange = range;

    let targets = this.pos.findInRange(this.room.hostileCreeps, 3);
    let alliesNear = this.pos.findInRange(this.room.creeps, 4, {
        filter: (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my
    }).length > 1 || this.pos.findInRange(this.room.structures, 5, {
        filter: (c) => c.owner && _.includes(FRIENDLIES, c.owner.username) && !c.my
    }).length > 1;

    // Check if there's a rampart to move towards for cover
    let inRangeRampart = this.pos.findClosestByPath(this.room.structures, {
        filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART &&
            !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() &&
            (!r.pos.checkForCreep() || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) &&
            r.pos.getRangeTo(target) <= 3
    });

    // Prioritize rampart movement if found
    if (inRangeRampart) {
        this.shibMove(inRangeRampart, {range: 0, ignoreCreeps: false});
        return true;
    }

    if (range <= 3) {
        // Handle close range combat
        if (target instanceof Creep) {
            // If there are multiple hostile creeps, perform mass attack
            if (this.pos.findInRange(this.room.hostileCreeps, 1).length > 1 || range === 1) {
                this.say('BIG PEW!', true);
                this.rangedMassAttack();
            } else {
                this.say('PEW!', true);
                this.rangedAttack(target);
            }

            // Handle movement after attack
            if (target.hasActiveBodyparts(ATTACK) && range < 3) {
                if (!this.pos.checkForRampart() && this.abilityPower().heal < target.abilityPower().attack) {
                    return this.shibKite(3);
                }
            } else {
                this.shibMove(target, {range: 1, ignoreCreeps: false});
            }
        } else {
            // Handle non-creep targets (e.g., structures or invaders)
            this.say('BURN!', true);
            if (this.rangedAttack(target) === ERR_NOT_IN_RANGE) {
                this.shibMove(target, {range: 1, ignoreCreeps: false});
            }
        }
        return true;
    } else {
        // Attack weaker targets (if they exist) within range
        let opportunity = _.min(targets, 'hits');
        if (opportunity) this.rangedAttack(opportunity);

        // If closing range, do not advance
        if (target instanceof Creep && target.hasActiveBodyparts(ATTACK) && lastRange - range > 0) return true;

        // Handle movement towards target
        let moveRange = (target instanceof Creep && !target.hasActiveBodyparts(ATTACK)) ? 1 : 3;
        if (this.pos.findInRange(FIND_CREEPS, 1).length > 0) {
            this.shibMove(target, {ignoreCreeps: false, range: moveRange});
        } else {
            this.shibMove(target, {ignoreCreeps: false, range: moveRange});
        }
        return true;
    }
};


/**
 * Handle healing of injured creeps
 * @returns {boolean}
 */
Creep.prototype.healCreeps = function () {
    // Get the most injured friendly creep (lowest health percentage)
    let injured = _.sortBy(_.filter(this.room.creeps, (c) =>
            (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax),
        (c) => (c.hits / c.hitsMax)
    )[0];

    // If an injured creep is found, heal them
    if (injured) {
        this.say(ICONS.hospital, true);
        // Move to the injured creep if not in range and heal
        this.shibMove(injured, {range: 1});
        return this.healInRange();
    }
    return false;
};

/**
 * Heal a friendly creep in range or heal self if necessary
 * @returns {boolean}
 */
Creep.prototype.healInRange = function () {
    if (!this.hasActiveBodyparts(HEAL)) return false;

    // Heal self if needed
    if (this.hits < this.hitsMax) {
        this.heal(this); // Heal self if less than max health
        return true;
    }

    // Find the closest injured friendly creep within healing range (3)
    let injured = _.find(this.room.creeps, (c) =>
        (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax
    );

    // If there's an injured creep, attempt to heal them
    if (injured) {
        // Find the creep that is within range for healing
        let healCreep = _.find(this.room.creeps, (c) =>
            (_.includes(FRIENDLIES, c.owner.username) || c.my) &&
            c.hits < c.hitsMax &&
            this.pos.getRangeTo(c) <= 3
        );

        // If in range to heal, heal them, otherwise use ranged heal
        if (healCreep) {
            if (this.pos.isNearTo(healCreep)) {
                return this.heal(healCreep);
            } else {
                return this.rangedHeal(healCreep);
            }
        }
    }

    return false;
};

/**
 * Stomp sites
 * @param creepCheck
 * @param onlyInBuild
 * @returns {boolean}
 */
Creep.prototype.moveToHostileConstructionSites = function (creepCheck = false, onlyInBuild = true) {
    // If there are no construction sites, we're in safe mode, or this is a friendly room, exit early.
    if (!this.room.constructionSites.length ||
        (this.room.controller && this.room.controller.safeMode) ||
        _.includes(FRIENDLIES, INTEL[this.room.name].user)) {
        return false;
    }

    // Try to get the last stomped site from memory or find the closest construction site
    let constructionSite = Game.getObjectById(this.memory.stompSite) || this.pos.findClosestByRange(this.room.constructionSites, {
        filter: (s) => !onlyInBuild || s.progress
    });

    // If a construction site is found, attempt to move to it
    if (constructionSite) {
        // Store the construction site's ID in memory for future reference
        this.memory.stompSite = constructionSite.id;

        // If the construction site is already at the creep's position, move randomly
        if (constructionSite.pos.isEqualTo(this.pos)) {
            return this.moveRandom();
        }

        // Move to the construction site (range 0)
        this.shibMove(constructionSite, {range: 0, ignoreCreeps: false});
        this.say("STOMP", true);
        return true;
    } else {
        // If no construction site is found, clear the memory
        this.memory.stompSite = undefined;
    }

    return false;
};

/**
 * Handle structure bashing
 * @returns {boolean}
 */
Creep.prototype.scorchedEarth = function () {
    // Check if the room is in safe mode
    if (this.room.controller && this.room.controller.safeMode) return false;

    // Find the closest hostile structure
    let hostile = this.findClosestHostileStructure(true);

    // If a hostile structure is found
    if (hostile) {
        this.memory.target = hostile.id;

        // Say a random "SCORCHED EARTH" phrase
        let sentence = [ICONS.respond, 'SCORCHED', 'EARTH'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);

        // Determine action based on available body parts
        if (this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK) || this.hasActiveBodyparts(WORK)) {
            let actionTaken = false;

            // Try to attack, ranged attack, or dismantle
            if (this.hasActiveBodyparts(ATTACK)) {
                actionTaken = this.attack(hostile) === OK;
            } else if (this.hasActiveBodyparts(RANGED_ATTACK)) {
                actionTaken = this.rangedAttack(hostile) === OK;
            } else if (this.hasActiveBodyparts(WORK)) {
                actionTaken = this.dismantle(hostile) === OK;
            }

            // If not in range, move towards the hostile structure
            if (!actionTaken && hostile && !this.pos.isNearTo(hostile)) {
                this.shibMove(hostile, {tunnel: true});
            }
        }

        return true;
    } else {
        // If no hostile structure found, return false
        return false;
    }
};

/**
 * Attack in range
 * @returns {boolean}
 */
Creep.prototype.attackInRange = function () {
    // If no ranged attack body part or no targets, return false
    if (!this.hasActiveBodyparts(RANGED_ATTACK) || (!this.room.hostileCreeps.length && !this.room.hostileStructures.length)) {
        return false;
    }

    // If already engaged with a target in range, attack it
    let target = Game.getObjectById(this.memory.target);
    if (target && this.pos.inRangeTo(target, 3)) {
        this.rangedAttack(target);
        return true;
    }

    // Check if there is an opportunity target
    let hostile = Game.getObjectById(this.memory.opportunityAttack);
    if (!hostile || !hostile.pos.inRangeTo(this, 3) || hostile.pos.roomName !== this.room.name) {
        // Reset opportunity target if invalid or out of range
        this.memory.opportunityAttack = undefined;

        // Search for a new hostile target (creep or structure)
        hostile = this.pos.findFirstInRange(this.room.hostileCreeps.concat(this.room.hostileStructures), 3);
    }

    if (hostile) {
        // Store the new target and attack it
        this.memory.opportunityAttack = hostile.id;
        this.rangedAttack(hostile);
        return true;
    }

    return false;
};


/**
 * Move to a staging room
 * @returns {boolean|*}
 */
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

/**
 * Run back to overlord
 * @param force
 * @returns {*|boolean}
 */
Creep.prototype.fleeHome = function (force = false) {
    if (this.room.controller && this.room.controller.owner && this.room.controller.owner.username === MY_USERNAME && !this.memory.runCooldown) return false;
    if (this.hits < this.hitsMax) force = true;
    if (!force && !this.memory.runCooldown && (this.hits === this.hitsMax || (!INTEL[this.room.name].lastCombat || INTEL[this.room.name].lastCombat + 10 < Game.time))) return false;
    if (!this.memory.ranFrom) this.memory.ranFrom = this.room.name;
    let cooldown = this.memory.runCooldown || Game.time + 50;
    let closest = this.memory.fleeDestination || findClosestOwnedRoom(this.room.name, false, 3);
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

/**
 * Check if you can win the fight
 * @param range
 * @param inbound
 * @returns {boolean}
 */
Creep.prototype.canIWin = function (range = 50, inbound = undefined) {
    // Safemode check
    if (this.room.controller && this.room.controller.safeMode && this.room.controller.owner.username !== MY_USERNAME) return false;

    // Check armed hostiles and hostile towers within range
    let armedHostiles = _.filter(this.room.hostileCreeps, c => (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL)) && this.pos.getRangeTo(c) <= range);
    let hostileTowers = _.filter(this.room.impassibleStructures, s => s.structureType === STRUCTURE_TOWER && !_.includes(FRIENDLIES, s.owner.username) && s.isActive() && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST);

    // If no hostiles or towers, or we're in our Overlord room, we win
    if ((!armedHostiles.length && !hostileTowers.length) || this.room.name === this.memory.overlord) return true;

    // Check cache and refresh every 3 ticks
    if (this.memory.winCache && this.memory.winCache.room === this.room.name && this.memory.winCache.tick + 3 > Game.time) {
        return this.memory.winCache.result;
    }

    // If no intel data exists for this room, assume we win
    if (!INTEL[this.room.name]) return true;

    // Calculate hostile and friendly power
    let hostilePower = this.calculateHostilePower(armedHostiles, hostileTowers, range);
    let friendlyPower = this.calculateFriendlyPower(range, inbound);

    // Cache the calculated power values
    INTEL[this.room.name].hostilePower = hostilePower;
    INTEL[this.room.name].friendlyPower = friendlyPower;

    // Determine win condition
    let result = (this.hasActiveBodyparts(RANGED_ATTACK) && !_.find(armedHostiles, c => c.hasActiveBodyparts(RANGED_ATTACK))) || hostilePower <= friendlyPower || this.pos.checkForRampart();

    // Update cache and return result
    this.memory.winCache = {
        room: this.room.name,
        result: result,
        tick: Game.time
    };
    return result;
};

/**
 * Calculate hostile power within the given range
 * @param {Array} armedHostiles
 * @param {Array} hostileTowers
 * @param {number} range
 * @returns {number}
 */
Creep.prototype.calculateHostilePower = function (armedHostiles, hostileTowers, range) {
    let hostilePower = 0;

    // Calculate power of hostile creeps
    armedHostiles.forEach(c => {
        if (c.hasActiveBodyparts(HEAL)) {
            hostilePower += c.abilityPower().heal;
        } else if (c.hasActiveBodyparts(RANGED_ATTACK)) {
            hostilePower += c.abilityPower().rangedAttack;
        } else if (c.hasActiveBodyparts(ATTACK)) {
            hostilePower += c.abilityPower().attack;
        }
    });

    // Add power from hostile towers
    hostileTowers.forEach(tower => {
        hostilePower += TOWER_POWER_FROM_RANGE(tower.pos.getRangeTo(this), TOWER_POWER_ATTACK);
    });

    return hostilePower;
};

/**
 * Calculate friendly power within the given range
 * @param {number} range
 * @param {boolean} inbound
 * @returns {number}
 */
Creep.prototype.calculateFriendlyPower = function (range, inbound) {
    let friendlyPower = 0;

    // Get friendly creeps
    let friendlyCreeps = inbound ? _.filter(Game.creeps, c => c.my && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL)) && c.memory.destination === this.room.name) : this.room.friendlyCreeps;

    // Calculate power of friendly creeps
    friendlyCreeps.forEach(c => {
        if (c.hasActiveBodyparts(HEAL)) {
            friendlyPower += c.abilityPower().heal;
        } else if (c.hasActiveBodyparts(RANGED_ATTACK)) {
            friendlyPower += c.abilityPower().rangedAttack;
        } else if (c.hasActiveBodyparts(ATTACK)) {
            friendlyPower += c.abilityPower().attack;
        }
    });

    // Add power from friendly towers
    let friendlyTowers = _.filter(this.room.impassibleStructures, s => s.structureType === STRUCTURE_TOWER && _.includes(FRIENDLIES, s.owner.username) && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST);
    friendlyTowers.forEach(tower => {
        friendlyPower += TOWER_POWER_FROM_RANGE(tower.pos.getRangeTo(this), TOWER_POWER_ATTACK);
    });

    return friendlyPower;
};


/**
 * Find a rampart for defense
 * @param target
 * @returns {boolean}
 */
Creep.prototype.findDefensivePosition = function (target = this) {
    // If we are the target and there are hostiles, find the closest hostile creep as target
    if (this.id === target.id && this.room.hostileCreeps.length) {
        target = this.pos.findClosestByRange(this.room.hostileCreeps);
    }

    // Determine the best rampart to use
    let bestRampart;

    // Use assigned rampart if it exists and no hostiles are present, or with a 25% chance
    if (this.memory.assignedRampart && (!this.room.hostileCreeps.length || Math.random() > 0.25)) {
        bestRampart = Game.getObjectById(this.memory.assignedRampart);
    } else {
        // Find the closest rampart with specific conditions
        bestRampart = this._findBestRampart(target);
    }

    if (bestRampart) {
        // Update memory with the assigned rampart if it's different from the current one
        if (this.memory.assignedRampart !== bestRampart.id) {
            this.memory.assignedRampart = bestRampart.id;
        }

        // Move to the rampart if not already there
        if (bestRampart.pos.x !== this.pos.x || bestRampart.pos.y !== this.pos.y) {
            this.memory.other.noBump = undefined;
            this.shibMove(bestRampart, {range: 0});
        } else {
            this.memory.other.noBump = true;
        }
        return true;
    } else {
        // If no rampart is found, move to a safe position (Room center or fallback)
        this._moveToSafePosition();
    }

    return false;
};

/**
 * Helper function to find the best rampart considering obstacles and pathfinding
 * @param target
 * @returns {StructureRampart|null}
 */
Creep.prototype._findBestRampart = function (target) {
    return target.pos.findClosestByPath(this.room.structures, {
        filter: (r) => r.structureType === STRUCTURE_RAMPART &&
            !r.pos.checkForObstacleStructure() &&  // Avoid ramparts with obstacles
            (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === this.pos.x && r.pos.y === this.pos.y)) && // Avoid occupied ramparts
            (r.my || r.isPublic) &&  // Allow owned or public ramparts
            (!r.room.hostileCreeps.length || target.id === this.id || this.pos.findPathTo(r).length < this.pos.findPathTo(target).length)  // Prefer ramparts with fewer hostiles
    });
};

/**
 * Helper function to move to a fallback safe position if no rampart is found
 */
Creep.prototype._moveToSafePosition = function () {
    const fallbackPosition = new RoomPosition(25, 25, this.room.name);
    if (this.pos.getRangeTo(fallbackPosition) <= 12) {
        this.idleFor(5);
    } else {
        this.shibMove(fallbackPosition, {range: 12, avoidEnemies: true});
    }
};

// New method to scan adjacent rooms for potential threats
Creep.prototype.scanForNearbyThreats = function () {
    const adjacentRooms = Game.map.describeExits(this.room.name);
    for (let roomName of adjacentRooms) {
        let roomIntel = INTEL[roomName];
        if (roomIntel && (roomIntel.threatLevel || roomIntel.hostileStructures)) {
            // If a neighboring room has a threat, consider reacting or alerting
            log.a('Potential threat detected in ' + roomLink(roomName), 'GUARD: ');
            if (!this.memory.destination || this.memory.destination !== roomName) {
                // If this creep isn't already assigned to that room, consider re-tasking
                this.memory.destination = roomName;
                this.say('Threat Detected', true);
            }
        }
    }
};

