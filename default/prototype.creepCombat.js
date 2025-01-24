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
    if (this.room.controller && this.room.controller.safeMode && this.room.user !== MY_USERNAME) {
        return false;
    }

    // Heal if needed
    if (this.hasActiveBodyparts(HEAL)) {
        this.healInRange();
    }

    // Check if can engage in combat
    if (!canEngageCombat(this)) {
        return this.fleeHome(true);
    }

    let hostile = this.findClosestEnemy(barrier, ignoreBorder, guardLocation, guardRange);

    if (!hostile) {
        return this.moveToHostileConstructionSites();
    }

    // Handle enemy on rampart
    if (hostile.pos.checkForRampart()) {
        hostile = hostile.pos.checkForRampart();
        this.memory.target = hostile.id;
    }

    // Combat strategy
    if (combatAction(this, hostile, rampart)) {
        return true;
    }

    // Healing as priority if healing body parts available
    if (this.hasActiveBodyparts(HEAL) && this.healInRange()) {
        return true;
    }

    // Fallback to scorched earth
    if (this.scorchedEarth()) {
        return true;
    }

    return this.moveToHostileConstructionSites();

    function canEngageCombat(creep) {
        return creep.hasActiveBodyparts(HEAL) && creep.getActiveBodyparts(HEAL) > 1 ||
            creep.hasActiveBodyparts(ATTACK) ||
            creep.hasActiveBodyparts(RANGED_ATTACK);
    }

    function combatAction(creep, hostile, rampart) {
        if (rampart && creep.hasActiveBodyparts(RANGED_ATTACK) && creep.fightRampart(hostile)) return true;
        if (creep.hasActiveBodyparts(ATTACK) && creep.attackHostile(hostile)) return true;
        return !!(creep.hasActiveBodyparts(RANGED_ATTACK) && creep.fightRanged(hostile));

    }
};

/**
 * Get attack/heal power and account for boosts
 * @returns {{meleeAttack: number, rangedAttack: number, attack: number, heal: number, rangedHeal: number}}
 */
Creep.prototype.abilityPower = function () {
    let meleePower = 0;
    let rangedPower = 0;
    let healPower = 0;
    let rangedHealPower = 0;

    for (let part of this.body) {
        if (!part.hits) continue;

        const partType = part.type;
        const boost = part.boost;

        // Calculate based on part type
        switch (partType) {
            case ATTACK:
                meleePower += boost
                    ? ATTACK_POWER * BOOSTS[partType][boost].attack
                    : ATTACK_POWER;
                break;
            case RANGED_ATTACK:
                rangedPower += boost
                    ? RANGED_ATTACK_POWER * BOOSTS[partType][boost].rangedAttack
                    : RANGED_ATTACK_POWER;
                break;
            case HEAL:
                healPower += boost
                    ? HEAL_POWER * BOOSTS[partType][boost].heal
                    : HEAL_POWER;
                rangedHealPower += boost
                    ? RANGED_HEAL_POWER * BOOSTS[partType][boost].heal
                    : RANGED_HEAL_POWER;
                break;
            case TOUGH:
                if (boost) {
                    healPower += HEAL_POWER * (1 - BOOSTS[partType][boost].damage);
                }
                break;
            default:
                // In case of an unexpected part type, you can add a logging mechanism
                break;
        }
    }

    return {
        attack: meleePower + rangedPower,
        meleeAttack: meleePower,
        rangedAttack: rangedPower,
        heal: healPower,
        rangedHeal: rangedHealPower
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
Creep.prototype.findClosestEnemy = function (barriers = true, ignoreBorder = false, guardLocation = undefined, guardRange, includeRampart = false) {
    // Cache the required data upfront
    const hostileStructures = _.filter(this.room.impassibleStructures, (s) =>
        (!s.owner || !FRIENDLIES.includes(s.owner.username)) &&
        (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange)
        && ![STRUCTURE_KEEPER_LAIR, STRUCTURE_CONTROLLER, STRUCTURE_POWER_BANK].includes(s.structureType)
    );

    const hostileCreeps = _.filter(this.room.hostileCreeps, (s) =>
        (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange) && !s.pos.checkForRampart()
    );

    const barriersPresent = _.some(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);

    if (!hostileCreeps.length && !hostileStructures.length) return undefined;

    if (this.memory.target) {
        let oldTarget = Game.getObjectById(this.memory.target);
        if (oldTarget && (oldTarget instanceof Structure || oldTarget instanceof Creep)) {
            return oldTarget;
        } else {
            this.memory.target = undefined;
        }
    }

    const isArmedCreep = (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK);
    const inGuardRange = (c) => !guardLocation || c.pos.getRangeTo(guardLocation) < guardRange;
    const isRampartChecked = (c) => !c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000;

    const findClosest = (creeps, filter) => barriersPresent
        ? this.pos.findClosestByPath(creeps, {filter})
        : this.pos.findClosestByRange(creeps, {filter});

    let enemy = findClosest(hostileCreeps, (c) =>
        isArmedCreep(c) &&
        (ignoreBorder || (c.pos.x > 0 && c.pos.x < 49 && c.pos.y > 0 && c.pos.y < 49)) &&
        inGuardRange(c) &&
        !c.pos.checkForRampart() // Avoid ramparts
    );
    if (enemy) return updateTargetAndReturn(this, enemy);

    enemy = findClosest(hostileStructures, (s) =>
        s.structureType === STRUCTURE_TOWER &&
        isRampartChecked(s) &&
        s.isActive()
    );
    if (enemy) return updateTargetAndReturn(this, enemy);

    enemy = findClosest(hostileStructures, (s) =>
        s.structureType === STRUCTURE_SPAWN &&
        isRampartChecked(s) &&
        s.isActive()
    );
    if (enemy) return updateTargetAndReturn(this, enemy);

    enemy = findClosest(hostileCreeps, (c) =>
        !isArmedCreep(c) &&
        (ignoreBorder || (c.pos.x > 0 && c.pos.x < 49 && c.pos.y > 0 && c.pos.y < 49)) &&
        inGuardRange(c) &&
        !c.pos.checkForRampart()
    );
    if (enemy) return updateTargetAndReturn(this, enemy);

    enemy = findClosest(hostileStructures, (s) =>
        isRampartChecked(s) &&
        s.isActive()
    );
    if (enemy) return updateTargetAndReturn(this, enemy);

    // --- Default fallback (if no specific target found) ---
    return undefined;

    // Helper function to update memory and return the target
    function updateTargetAndReturn(creep, target) {
        if (includeRampart && target.pos.checkForRampart()) {
            target = target.pos.checkForRampart(); // Resolve rampart as the actual target
        }
        creep.memory.target = target.id;
        return target;
    }
};


/**
 * Find closest hostile structure
 * @param barriers
 * @returns {undefined|*}
 */
Creep.prototype.findClosestHostileStructure = function (barriers = true) {
    // Cache hostile structures and filter out friendly ones
    const hostileStructures = _.filter(this.room.impassibleStructures, (s) =>
        ((!s.owner || !FRIENDLIES.includes(s.owner.username)) || s.structureType === STRUCTURE_WALL) &&
        ![STRUCTURE_KEEPER_LAIR, STRUCTURE_CONTROLLER, STRUCTURE_POWER_BANK].includes(s.structureType)
    );

    // Return undefined if no hostile structures
    if (!hostileStructures.length) return undefined;

    // If we already have a valid target, return it
    if (this.memory.target) {
        const oldTarget = Game.getObjectById(this.memory.target);
        if (oldTarget) return oldTarget;
        this.memory.target = undefined;  // Reset if invalid target
    }

    // Check for Invader Core first, as it's always a high-priority target
    const invaderCore = _.find(hostileStructures, (s) => s.structureType === STRUCTURE_INVADER_CORE);
    if (invaderCore) {
        this.memory.target = invaderCore.id;
        return invaderCore;
    }

    // Pre-filter all structures for later use (eliminating unnecessary checks)
    const structures = _.filter(this.room.structures, (s) =>
        !s.owner || !FRIENDLIES.includes(s.owner.username) &&
        s.hits && ![STRUCTURE_POWER_BANK, STRUCTURE_CONTROLLER, STRUCTURE_KEEPER_LAIR, STRUCTURE_INVADER_CORE,
            STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_PORTAL].includes(s.structureType)
    );

    // Check for barriers like walls and ramparts
    const barriersPresent = _.some(structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);

    let target;

    // Check for active towers/spawns with no ramparts or low rampart hits, prioritize those
    target = _.find(structures, (s) => {
        return (s.structureType === STRUCTURE_TOWER || s.structureType === STRUCTURE_SPAWN) &&
            (!s.pos.checkForRampart() || s.pos.checkForRampart().hits < 50000) &&
            s.isActive();
    });

    if (target) {
        this.memory.target = target.id;
        return target;
    }

    // If no towers/spawns found, prioritize any other active hostile structures
    target = _.find(structures, (s) => s.isActive() && ![STRUCTURE_WALL, STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER].includes(s.structureType));

    if (target) {
        this.memory.target = target.id;
        return target;
    }

    // If no immediate target found, check for towers/spawns that still have ramparts but are weak
    if (barriers && barriersPresent) {
        target = _.find(structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
            (!s.pos.checkForRampart() || s.pos.checkForRampart().hits < 50000));

        if (target) {
            this.memory.target = target.id;
            return target;
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
    let range = this.pos.getRangeTo(hostile);
    let lastRange = this.memory.lastRange || range;
    this.memory.lastRange = range;

    let moveTarget = hostile;

    // Check for a nearby rampart to use as cover
    let rampartCover = this.pos.findClosestByPath(this.room.structures, {
        filter: (r) => r.structureType === STRUCTURE_RAMPART &&
            r.my &&
            !r.pos.checkForObstacleStructure() &&
            !r.pos.checkForConstructionSites() &&
            (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos)) &&
            r.pos.getRangeTo(hostile) <= 1
    });

    if (rampartCover) moveTarget = rampartCover;

    // Handle ranged attack
    if (this.hasActiveBodyparts(RANGED_ATTACK) && range <= 3) {
        if (range === 1 && this.pos.findInRange(this.room.hostileCreeps, 1).length > 1) {
            this.say('BIG PEW!', true);
            this.rangedMassAttack();
        } else {
            this.say('PEW!', true);
            this.rangedAttack(hostile);
        }
    }

    // Handle melee attack
    if (this.hasActiveBodyparts(ATTACK)) {
        if (range === 1) {
            this.attack(hostile);
            if (hostile instanceof Creep) this.move(this.pos.getDirectionTo(hostile));
            return true;
        }

        if (range > 1) {
            if (hostile instanceof Creep && range >= lastRange &&
                hostile.hasActiveBodyparts(RANGED_ATTACK) && this.hits < this.hitsMax * 0.8) {
                this.memory.kiteCount = this.memory.kiteCount || 1;

                if (this.memory.kiteCount > 5 || this.hits < this.hitsMax * 0.5) {
                    // Flee only if not inside a rampart
                    if (!this.pos.checkForRampart()) {
                        this.fleeHome(true);
                    }
                } else {
                    this.shibKite(6); // Execute a kiting maneuver
                }
                return true;
            }
            this.shibMove(moveTarget, {ignoreCreeps: false, range: 1});
            return true;
        }
    }

    // Handle dismantling structures if WORK parts are available
    if (this.hasActiveBodyparts(WORK) && hostile instanceof Structure) {
        if (this.dismantle(hostile) === ERR_NOT_IN_RANGE) {
            this.shibMove(moveTarget, {ignoreCreeps: false, range: 1});
        }
        return true;
    }

    return false; // No action taken
};

/**
 * Handle rampart fighting
 * @param hostile
 * @returns {boolean}
 */
Creep.prototype.fightRampart = function (hostile = undefined) {
    let target = hostile || this.findClosestEnemy(false, true);

    // Quick checks to avoid unnecessary processing
    if (!target || !target.pos ||
        !(this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK)) ||
        (target instanceof Creep && !(target.hasActiveBodyparts(ATTACK) || target.hasActiveBodyparts(RANGED_ATTACK)))) {
        return false;
    }

    // Manage rampart assignment
    let position = getAssignedRampart(this, target);
    if (!position) return false; // No suitable rampart found or too far

    // Assign or reassign rampart every 3 ticks or if not assigned
    if (!this.memory.assignedRampart || (Game.time % 3 === 0)) {
        this.memory.assignedRampart = position.id;
    }

    // Handle combat from rampart
    performCombat(this, target, position);

    return true;

    function getAssignedRampart(creep, target) {
        let range = creep.hasActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
        let position;

        if (creep.memory.assignedRampart) {
            position = Game.getObjectById(creep.memory.assignedRampart);
            if (position && position.pos.getRangeTo(target) > 25) {
                delete creep.memory.assignedRampart;
                position = undefined;
            }
        }

        if (!position) {
            let filter = (r) => r.my && r.structureType === STRUCTURE_RAMPART &&
                !r.pos.checkForObstacleStructure() &&
                !creep.room.myCreeps.some(c => c.memory.assignedRampart === r.id && c.id !== creep.id) &&
                (!r.pos.checkForCreep() || r.pos.isEqualTo(creep.pos));

            // Look for rampart in range first
            position = target.pos.findInRange(creep.room.structures, range, {filter})[0] ||
                creep.pos.findClosestByPath(creep.room.structures, {filter});
        }

        return position;
    }

    function performCombat(creep, target, position) {
        // Move to rampart if not already on it
        if (creep.pos.getRangeTo(position) > 0) {
            creep.shibMove(position, {range: 0});
            return;
        }

        // Ranged combat logic
        if (creep.hasActiveBodyparts(RANGED_ATTACK)) {
            let range = creep.pos.getRangeTo(target);
            if (range <= 3) {
                let threats = creep.pos.findInRange(creep.room.hostileCreeps, 3, {
                    filter: (c) => _.includes(Memory._threats, c.owner.username) || c.owner.username === 'Invader'
                });

                if (threats.length > 1) {
                    creep.rangedMassAttack();
                } else {
                    creep.rangedAttack(target);
                }
            }
        }

        // Melee combat if in range
        if (creep.pos.getRangeTo(target) === 1 && creep.hasActiveBodyparts(ATTACK)) {
            creep.attack(target);
        }
    }
};

/**
 * Handle ranged fighting with optimal movement and targeting
 * @param target
 * @returns {boolean}
 */
Creep.prototype.fightRanged = function (target) {
    if (!target || !this.room.hostileCreeps.length || !this.hasActiveBodyparts(RANGED_ATTACK)) return false;

    // Check if already in optimal position (rampart and range)
    if (this.pos.checkForRampart() && this.pos.getRangeTo(target) <= 3) {
        this.rangedAttack(target);
        return true;
    }

    // Kite if can't win or if too close to dangerous enemies
    if (!this.canIWin(5) || shouldKite(this, target)) {
        return this.shibKite(3);
    }

    let range = this.pos.getRangeTo(target);
    let hostileNearby = this.pos.findInRange(this.room.hostileCreeps, 3);

    // Find rampart for cover if available
    let rampartCover = findRampartCover(this, target);
    if (rampartCover) {
        this.shibMove(rampartCover, {range: 0, ignoreCreeps: false});
        return true;
    }

    if (range <= 3) {
        handleCloseCombat(this, target, hostileNearby);
    } else {
        handleLongRangeCombat(this, target, hostileNearby);
    }

    return true;

    function shouldKite(creep, target) {
        return target instanceof Creep &&
            target.hasActiveBodyparts(ATTACK) &&
            creep.pos.getRangeTo(target) < 3 &&
            (!creep.pos.checkForRampart() && creep.abilityPower().heal < target.abilityPower().attack);
    }

    function findRampartCover(creep, target) {
        return creep.pos.findClosestByPath(creep.room.structures, {
            filter: (r) => r.my && r.structureType === STRUCTURE_RAMPART &&
                !r.pos.checkForObstacleStructure() &&
                r.pos.getRangeTo(target) <= 3
        });
    }

    function handleCloseCombat(creep, target, hostileNearby) {
        if (target instanceof Creep) {
            // Check for mass attack conditions
            if (creep.pos.findInRange(creep.room.hostileCreeps, 1).length > 1 || creep.pos.getRangeTo(target) === 1) {
                creep.say('BIG PEW!', true);
                creep.rangedMassAttack();
            } else {
                creep.say('PEW!', true);
                creep.rangedAttack(target);
            }

            // Decide on movement post-attack
            if (!shouldKite(target)) {
                creep.shibMove(target, {range: 3, ignoreCreeps: false});
            }
        } else {
            creep.say('BURN!', true);
            if (creep.rangedAttack(target) === ERR_NOT_IN_RANGE) {
                creep.shibMove(target, {range: 1, ignoreCreeps: false});
            }
        }
    };

    function handleLongRangeCombat(creep, target, hostileNearby) {
        // Attack the weakest nearby enemy if in range
        let opportunity = hostileNearby.reduce((lowest, creep) => creep.hits < lowest.hits ? creep : lowest, hostileNearby[0]);
        if (opportunity) creep.rangedAttack(opportunity);

        // Move towards target, but adjust range based on threat level
        let moveRange = (target instanceof Creep && !target.hasActiveBodyparts(ATTACK)) ? 1 : 3;
        creep.shibMove(target, {ignoreCreeps: false, range: moveRange});
    }
}


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
        let inPlace = _.filter(this.room.myCreeps, (creep) => creep.memory.destination === this.memory.destination);
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

    // Check if we're in a friendly or safe environment
    if (this.room.name === this.memory.overlord || (!this.room.hostileCreeps.length && !this.room.impassibleStructures.some(s => s.structureType === STRUCTURE_TOWER && !_.includes(FRIENDLIES, s.owner.username) && s.isActive()))) return true;

    // Use cached result if available and not outdated
    if (this.memory.winCache && this.memory.winCache.room === this.room.name && this.memory.winCache.tick + 3 > Game.time) {
        return this.memory.winCache.result;
    }

    // If no intel, assume we can win
    if (!INTEL[this.room.name]) return true;

    // Evaluate threats
    const armedHostiles = findArmedHostiles(this, range);
    const hostileTowers = findHostileTowers(this);

    // Calculate power
    const hostilePower = this.calculateHostilePower(armedHostiles, hostileTowers);
    const friendlyPower = this.calculateFriendlyPower(range, inbound);

    // Update INTEL
    INTEL[this.room.name].hostilePower = hostilePower;
    INTEL[this.room.name].friendlyPower = friendlyPower;

    // Determine victory based on power comparison and tactical advantages
    const result = canWinBasedOnPower(this, hostilePower, friendlyPower, armedHostiles);

    // Cache the result
    this.memory.winCache = {
        room: this.room.name,
        result: result,
        tick: Game.time
    };

    return result;

    function findArmedHostiles(creep, range) {
        return creep.room.hostileCreeps.filter(c => (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL)) && creep.pos.getRangeTo(c) <= range);
    }

    function findHostileTowers(creep) {
        return creep.room.impassibleStructures.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            !_.includes(FRIENDLIES, s.owner.username) &&
            s.isActive() &&
            s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST
        );
    }

    function calculateHostilePower(creep, hostiles, towers) {
        let power = 0;
        hostiles.forEach(c => power += c.abilityPower().attack + (c.hasActiveBodyparts(HEAL) ? c.abilityPower().heal : 0));
        towers.forEach(t => power += TOWER_POWER_ATTACK);
        return power;
    }

    function calculateFriendlyPower(creep, range, inbound) {
        let friendlyPower = creep.abilityPower().attack + creep.abilityPower().heal;
        friendlyPower += creep.room.myCreeps.reduce((sum, c) => {
            if (c.pos.getRangeTo(creep) <= range || (inbound && inbound.includes(c.id))) {
                return sum + c.abilityPower().attack + c.abilityPower().heal;
            }
            return sum;
        }, 0);
        // Add power from friendly towers if any within range
        friendlyPower += creep.room.structures.reduce((sum, s) =>
            s.structureType === STRUCTURE_TOWER && s.my && s.pos.getRangeTo(creep) <= range ? sum + TOWER_POWER_ATTACK : sum, 0);
        return friendlyPower;
    }

    function canWinBasedOnPower(creep, hostilePower, friendlyPower, armedHostiles) {
        return creep.hasActiveBodyparts(RANGED_ATTACK) && !armedHostiles.some(c => c.hasActiveBodyparts(RANGED_ATTACK)) ||
            hostilePower <= friendlyPower ||
            creep.pos.checkForRampart();
    }
};

/**
 * Calculate hostile power within the given range
 * @param {Array} armedHostiles - List of hostile creeps in range
 * @param {Array} hostileTowers - List of hostile towers in range
 * @param {number} range - The range within which the hostile power is being calculated
 * @returns {number} - The total hostile power within the given range
 */
Creep.prototype.calculateHostilePower = function (armedHostiles, hostileTowers, range) {
    let hostilePower = 0;

    // Calculate power of hostile creeps within the range
    armedHostiles.forEach(c => {
        // Only calculate power for hostiles within the specified range
        if (this.pos.getRangeTo(c) <= range) {
            if (c.hasActiveBodyparts(HEAL)) {
                hostilePower += c.abilityPower().heal;
            } else if (c.hasActiveBodyparts(RANGED_ATTACK)) {
                hostilePower += c.abilityPower().rangedAttack;
            } else if (c.hasActiveBodyparts(ATTACK)) {
                hostilePower += c.abilityPower().attack;
            }
        }
    });

    // Add power from hostile towers within the range
    hostileTowers.forEach(tower => {
        if (this.pos.getRangeTo(tower) <= range) {
            hostilePower += TOWER_POWER_FROM_RANGE(tower.pos.getRangeTo(this), TOWER_POWER_ATTACK);
        }
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
    const adjacentRooms = _.map(Game.map.describeExits(this.room.name));
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

