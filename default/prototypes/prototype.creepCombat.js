/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Handle military creep
 * @param barrier
 * @param rampart
 * @param ignoreBorder
 * @param guardLocation
 * @param guardRange
 * @returns {boolean|*}
 */
Creep.prototype.handleMilitaryCreep = function (barrier = false, rampart = true, ignoreBorder = true, guardLocation = undefined, guardRange = 8) {
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

    if (hostile) {
        this.memory.target = hostile.id;
        this.memory.targetPos = JSON.stringify(hostile.pos);
    } else {
        this.memory.target = undefined;
        this.memory.targetPos = undefined;
    }

    // Handle enemy on rampart
    if (hostile && hostile.pos.checkForRampart()) {
        hostile = hostile.pos.checkForRampart();
        this.memory.target = hostile.id;
    }

    // Combat strategy
    if (hostile && combatAction(this, hostile, rampart)) {
        return true;
    }

    return this.moveToHostileConstructionSites();

    function canEngageCombat(creep) {
        return creep.hasActiveBodyparts(HEAL) && creep.getActiveBodyparts(HEAL) > 1 ||
            creep.hasActiveBodyparts(ATTACK) ||
            creep.hasActiveBodyparts(RANGED_ATTACK);
    }

    function combatAction(creep, hostile, rampart) {
        if (rampart && creep.fightFromRampart(hostile)) return true;
        if (creep.hasActiveBodyparts(ATTACK) && creep.attackHostile(hostile)) return true;
        return !!(creep.hasActiveBodyparts(RANGED_ATTACK) && creep.fightRanged(hostile));
    }
};

/**
 * Find closest enemy
 * @param structuresOnly
 * @param ignoreBorder
 * @param guardLocation
 * @param guardRange
 * @param includeRampart
 * @returns {*|undefined|Structure}
 */
Creep.prototype.findClosestEnemy = function (structuresOnly = false, ignoreBorder = false, guardLocation = undefined, guardRange, includeRampart = false) {
    // If this is a structures only op, set that
    if (!structuresOnly && (this.hasActiveBodyparts(WORK))) structuresOnly = true;
    // Cores only in friendly rooms
    let invaderCore;
    if (this.hasActiveBodyparts(ATTACK)) invaderCore = true;
    // Cache the required data upfront
    const hostileStructures = _.filter(this.room.impassibleStructures, (s) =>
        s.owner && !FRIENDLIES.includes(s.owner.username) &&
        (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange)
        && ![STRUCTURE_KEEPER_LAIR, STRUCTURE_CONTROLLER, STRUCTURE_POWER_BANK].includes(s.structureType) &&
        (invaderCore || s.structureType !== STRUCTURE_INVADER_CORE)
    );

    const hostileCreeps = _.filter(this.room.hostileCreeps, (s) =>
        (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange) && !s.pos.checkForRampart()
    );

    const barriersPresent = _.some(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)
        && (!this.room.controller || !this.room.controller.owner || !FRIENDLIES.includes(this.room.controller.owner.username));

    // Handle a blocking creep for squads
    if (this.memory.blockingCreep) {
        const blocker = Game.getObjectById(this.memory.blockingCreep);
        if (blocker) return blocker;
    }

    if (this.memory.target) {
        let oldTarget = Game.getObjectById(this.memory.target);
        const armedHostile = _.find(hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || (MY_ROOMS.includes(this.room.name) && c.hasActiveBodyparts(WORK)));
        if (oldTarget && oldTarget instanceof Structure && !armedHostile) {
            return oldTarget;
        } else {
            this.memory.target = undefined;
        }
    }

    if (!hostileCreeps.length && !hostileStructures.length) return undefined;

    const isArmedCreep = (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || (MY_ROOMS.includes(this.room.name) && c.hasActiveBodyparts(WORK));
    const inGuardRange = (c) => !guardLocation || c.pos.getRangeTo(guardLocation) < guardRange;
    const isRampartChecked = (c) => !c.pos.checkForRampart() || c.pos.checkForRampart().hits < 50000;

    const findClosest = (creeps, filter) => barriersPresent
        ? this.pos.findClosestByPath(creeps, {filter})
        : this.pos.findClosestByRange(creeps, {filter});

    // Handle attacking rooms with targets behind ramparts
    const target = hostileStructures.find((s) => s.structureType === STRUCTURE_SPAWN) || hostileStructures.find((s) => s.structureType === STRUCTURE_TOWER) || this.room.controller;
    if (target && !FRIENDLIES.includes(INTEL[this.room.name].user)) {
        const cleaningPath = findBestCleaningPath(this, target);
        if (cleaningPath.length) return updateTargetAndReturn(this, cleaningPath[0]);
    }

    let enemy = findClosest(hostileCreeps, (c) =>
        isArmedCreep(c) &&
        (!ignoreBorder || (c.pos.x > 0 && c.pos.x < 49 && c.pos.y > 0 && c.pos.y < 49)) &&
        inGuardRange(c) &&
        !c.pos.checkForRampart() // Avoid ramparts
    );
    if (enemy && !structuresOnly) return updateTargetAndReturn(this, enemy);

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

    enemy = findClosest(hostileStructures, (s) =>
        isRampartChecked(s) &&
        s.isActive()
    );
    if (enemy) return updateTargetAndReturn(this, enemy);

    enemy = findClosest(hostileStructures, (s) =>
        s.structureType === STRUCTURE_TOWER &&
        s.isActive()
    );
    if (enemy) return updateTargetAndReturn(this, enemy);

    enemy = findClosest(hostileStructures, (s) =>
        s.structureType === STRUCTURE_SPAWN &&
        s.isActive()
    );
    if (enemy) return updateTargetAndReturn(this, enemy);

    enemy = findClosest(hostileCreeps, (c) =>
        !isArmedCreep(c) &&
        (!ignoreBorder || (c.pos.x > 0 && c.pos.x < 49 && c.pos.y > 0 && c.pos.y < 49)) &&
        inGuardRange(c) &&
        !c.pos.checkForRampart()
    );
    if (enemy && !structuresOnly) return updateTargetAndReturn(this, enemy);

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
                this.memory.kiteCount = (this.memory.kiteCount || 0) + 1;

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
            // Not in a kiting situation — reset counter so future engagements start fresh
            this.memory.kiteCount = 0;
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
Creep.prototype.fightFromRampart = function (hostile = undefined) {
    let target = hostile || this.findClosestEnemy(false, true);

    // Quick checks
    if (!target || !target.pos || !(this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK))) {
        return false;
    }

    // Find best rampart near target
    let range = this.hasActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
    let ramparts = target.pos.findInRange(FIND_MY_STRUCTURES, range, {
        filter: (r) => r.structureType === STRUCTURE_RAMPART &&
            !r.pos.checkForObstacleStructure() &&
            (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos))
    });

    let position = this.pos.findClosestByPath(ramparts);

    if (!position) {
        // If no rampart in range of target, find any rampart that's closer to the target than we are
        position = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: (r) => r.structureType === STRUCTURE_RAMPART &&
                !r.pos.checkForObstacleStructure() &&
                (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos)) &&
                r.pos.getRangeTo(target) < this.pos.getRangeTo(target)
        });
    }

    if (!position) return false;

    // Move and attack
    if (!this.pos.isEqualTo(position)) {
        this.shibMove(position, {range: 0});
    }

    // Combat
    if (this.hasActiveBodyparts(RANGED_ATTACK)) {
        if (this.pos.getRangeTo(target) <= 3) {
            let threats = this.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
            if (threats.length > 1) this.rangedMassAttack();
            else this.rangedAttack(target);
        }
    }
    if (this.hasActiveBodyparts(ATTACK) && this.pos.isNearTo(target)) {
        this.attack(target);
    }

    return true;
};

/**
 * Handle ranged fighting with optimal movement and targeting
 * @param target
 * @returns {boolean}
 */
Creep.prototype.fightRanged = function (target) {
    if (!target || !this.hasActiveBodyparts(RANGED_ATTACK)) return false;

    let range = this.pos.getRangeTo(target);

    // 1. Prioritize Rampart Cover (own rooms only)
    if (MY_ROOMS.includes(this.room.name)) {
        let rampartCover = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: (r) => r.structureType === STRUCTURE_RAMPART &&
                !r.pos.checkForObstacleStructure() &&
                r.pos.getRangeTo(target) <= 3 &&
                (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos))
        });

        if (rampartCover) {
            if (!this.pos.isEqualTo(rampartCover)) {
                this.shibMove(rampartCover, {range: 0});
            }
            this.rangedAttack(target);
            return true;
        }
    }

    // 2. Tower avoidance in enemy rooms: flee max-damage range (≤5)
    if (!MY_ROOMS.includes(this.room.name)) {
        const dangerTower = this.room.impassibleStructures.find(s =>
            s.structureType === STRUCTURE_TOWER &&
            s.owner && !FRIENDLIES.includes(s.owner.username) &&
            s.isActive() &&
            s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST &&
            this.pos.getRangeTo(s) <= 5
        );
        if (dangerTower) {
            if (range <= 3) this.rangedAttack(target);
            else this.attackInRange();
            const fleeResult = PathFinder.search(
                this.pos,
                [{pos: dangerTower.pos, range: 8}],
                {flee: true, maxRooms: 1, maxOps: 500}
            );
            if (fleeResult.path.length) this.move(this.pos.getDirectionTo(fleeResult.path[0]));
            return true;
        }
    }

    // 3. Open field kiting
    if (range <= 3) {
        if (range < 3) {
            // Use a wider flee range when damaged — ranged fire or a stray melee hit
            const kiteRange = target instanceof Creep && target.hasActiveBodyparts(ATTACK) ? 4 : (this.hits < this.hitsMax ? 4 : 3);
            this.shibKite(kiteRange);
        }
        this.rangedAttack(target);
    } else {
        this.shibMove(target, {range: 3});
        this.attackInRange();
    }

    return true;
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
        filter: (s) => (!onlyInBuild || s.progress) && !s.my && !s.pos.checkForCreep()
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

    // Check if its a friendly room
    if (FRIENDLIES.includes(INTEL[this.room.name].user)) return false;

    // Find the closest hostile structure
    let hostile = this.findClosestEnemy(true);

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
            if (!actionTaken && hostile) {
                const moveRange = !this.hasActiveBodyparts(ATTACK) && !this.hasActiveBodyparts(WORK) ? 3 : 1;
                this.shibMove(hostile, {tunnel: true, range: moveRange});
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
        if (!FRIENDLIES.includes(INTEL[this.room.name].user)) hostile = this.pos.findFirstInRange(this.room.hostileCreeps.concat(this.room.structures), 3);
        else hostile = this.pos.findFirstInRange(this.room.hostileCreeps.concat(this.room.hostileStructures), 3);
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
 * Heal a friendly creep in range or heal self if necessary
 * @returns {boolean}
 */
Creep.prototype.healInRange = function (blinky = undefined) {
    if (!this.hasActiveBodyparts(HEAL)) return false;

    // Find the closest injured friendly creep within healing range (3)
    let injured = this.room.creeps.filter((c) => c.owner && (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax && this.pos.getRangeTo(c) <= 3);
    if (injured.length) injured = _.min(injured, (c) => c.hits / c.hitsMax);

    // Heal self if needed
    if (this.hits < this.hitsMax && (!injured || (injured.hits / injured.hitsMax) < (this.hits / this.hitsMax))) {
        this.heal(this);
    } else if (injured) {
        if (this.pos.isNearTo(injured)) {
            this.heal(injured);
        } else {
            this.rangedHeal(injured);
        }
    } else if (blinky) this.heal(this);
};

/**
 * Run back to overlord
 * @param force
 * @returns {*|boolean}
 */
Creep.prototype.fleeHome = function (force = false) {
    if (this.room.controller && this.room.controller.owner && FRIENDLIES.includes(this.room.controller.owner.username) && this.room.structures.find(s => s.structureType === STRUCTURE_TOWER)) return false;
    if (this.hits < this.hitsMax) force = true;
    if (!force && !this.memory.runCooldown && (this.hits === this.hitsMax || (!INTEL[this.room.name].lastCombat || INTEL[this.room.name].lastCombat + 10 < Game.time))) return false;
    if (!this.memory.ranFrom) this.memory.ranFrom = this.room.name;
    let cooldown = this.memory.runCooldown;
    let closest = this.memory.fleeDestination || findClosestOwnedRoom(this.room.name, false, 3, false);
    if (!closest) return false;
    this.memory.fleeDestination = closest;
    if (this.room.name !== closest) {
        this.memory.runCooldown = Game.time + 50;
        this.shibMove(new RoomPosition(25, 25, closest), {range: 15});
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
 * @param {number} [range=50] - The range to check for friendly and hostile units
 * @param {string[]} [inbound=undefined] - An array of creep IDs that are inbound to help
 * @returns {boolean}
 */
Creep.prototype.canIWin = function (range = 50, inbound = undefined) {
    // Safemode check
    if (this.room.controller && this.room.controller.safeMode && this.room.controller.owner && this.room.controller.owner.username !== MY_USERNAME) return false;

    // Check if we're in a friendly or safe environment
    if (this.room.name === this.memory.colony || (!this.room.hostileCreeps.length && !this.room.impassibleStructures.some(s => s.owner && s.structureType === STRUCTURE_TOWER && !_.includes(FRIENDLIES, s.owner.username) && s.isActive()))) return true;

    // If no intel, assume we can win
    if (!INTEL[this.room.name]) return true;

    const hostilePower = calculateHostilePower(this, range);
    const friendlyPower = calculateFriendlyPower(this, range, inbound);
    const result = canWinBasedOnPower(this, hostilePower, friendlyPower);

    // Update INTEL
    INTEL[this.room.name].hostilePower = hostilePower;
    INTEL[this.room.name].friendlyPower = friendlyPower;

    return result;

    function calculateHostilePower(creep, range) {
        let power = 0;
        const hostiles = creep.room.hostileCreeps.filter(c =>
            (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL)) &&
            creep.pos.getRangeTo(c) <= range
        );
        hostiles.forEach(c => {
            const ap = abilityPower(c.body);
            // Threat score = Total DPS + Total Effective Healing + (EHP / 100) to account for pure meat shields
            power += ap.attack + ap.effectiveHeal + (ap.defense / 100);
        });
        const towers = creep.room.impassibleStructures.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            (!s.owner || !_.includes(FRIENDLIES, s.owner.username)) &&
            s.isActive() &&
            s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST
        );
        for (const tower of towers) {
            power += determineTowerDamage(tower.pos.getRangeTo(creep))
        }
        return power;
    }

    function calculateFriendlyPower(creep, range, inbound) {
        const ap = abilityPower(creep.body);
        let friendlyPower = ap.attack + ap.effectiveHeal + (ap.defense / 100);
        
        const myCreeps = creep.room.myCreeps.filter((c) => c.id !== creep.id);
        const alliedCreeps = creep.room.creeps.filter(c => c.owner && FRIENDLIES.includes(c.owner.username) && !c.my);
        const friendlyCreeps = myCreeps.concat(alliedCreeps);

        friendlyPower += friendlyCreeps.reduce((sum, c) => {
            if (c.pos.getRangeTo(creep) <= range || (inbound && inbound.includes(c.id))) {
                const alliedAp = abilityPower(c.body);
                return sum + alliedAp.attack + alliedAp.effectiveHeal + (alliedAp.defense / 100);
            }
            return sum;
        }, 0);

        friendlyPower += creep.room.find(FIND_MY_STRUCTURES, {
            filter: {structureType: STRUCTURE_TOWER}
        }).reduce((sum, t) => t.pos.getRangeTo(creep) <= range && t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST ? sum + determineTowerDamage(t.pos.getRangeTo(creep)) : sum, 0);

        return friendlyPower;
    }

    function canWinBasedOnPower(creep, hostilePower, friendlyPower) {
        const onRampart = creep.pos.checkForRampart();
        const hasRanged = creep.hasActiveBodyparts(RANGED_ATTACK);
        const noHostileRanged = !creep.room.hostileCreeps.some(c => c.hasActiveBodyparts(RANGED_ATTACK));

        // Check for retreat if health is critically low
        if (creep.hits / creep.hitsMax < 0.6 && !creep.pos.checkForRampart()) return false;

        return (hasRanged && noHostileRanged) ||
            (onRampart && friendlyPower >= hostilePower * 0.75) ||
            (friendlyPower > hostilePower);
    }
};

/**
 * Find a rampart for defense
 * @param target
 * @returns {boolean}
 */
Creep.prototype.findDefensivePosition = function (target) {
    if (target) {
        return this.fightFromRampart(target);
    } else {
        const rampart = getAssignedRampart(this);
        if (rampart) {
            if (this.pos.getRangeTo(rampart)) {
                this.memory.other.stationary = undefined;
                return this.shibMove(rampart, {range: 0});
            } else {
                this.memory.other.stationary = true;
                return true;
            }
        } else {
            moveToSafePosition(this);
        }
    }
    function moveToSafePosition(creep) {
        const fallbackPosition = new RoomPosition(25, 25, creep.room.name);
        if (creep.pos.getRangeTo(fallbackPosition) <= 12) {
            creep.idleFor(5);
        } else {
            creep.shibMove(fallbackPosition, {range: 12, avoidEnemies: true});
        }
    }
};

Creep.prototype.formSquad = function () {
    // Find partners
    if (!this.memory.grouped && !this.spawning) {
        findGroup(this);
    } else if (this.memory.grouped && !this.memory.leader) {
        const leader = Game.getObjectById(this.memory.groupLeader);
        if (!leader) {
            this.memory.grouped = undefined;
            this.memory.leader = undefined;
            this.memory.groupLeader = undefined;
            this.memory.squadMembers = undefined;
            this.memory.role = this.memory.oldRole;
            this.memory.oldRole = undefined;
        }
    }

    function findGroup(creep) {
        const maxMembers = (creep.memory.misc && creep.memory.misc.waitFor || 4) - 1;
        let currentGroups = creep.room.myCreeps.filter((c) => c.id !== creep.id && c.memory.role.includes(creep.memory.role) && c.memory.destination === creep.memory.destination && c.memory.operation === creep.memory.operation && c.memory.leader && c.memory.squadMembers.length < maxMembers);
        if (creep.memory.operation === 'borderPatrol') currentGroups = _.filter(Game.creeps, (c) => c.my && c.id !== creep.id && (c.memory.role.includes(creep.memory.role) || creep.memory.role.includes(c.memory.role)) && c.memory.destination === creep.memory.destination && c.memory.operation === creep.memory.operation && c.memory.leader && c.memory.squadMembers.length < maxMembers)
        if (currentGroups.length) {
            currentGroups = _.max(currentGroups, c => c.memory.squadMembers.length);
            creep.memory.grouped = true;
            creep.memory.leader = undefined;
            creep.memory.squadMembers = undefined;
            creep.memory.oldRole = creep.memory.role;
            creep.memory.role = 'longbowSquad';
            creep.memory.groupLeader = currentGroups.id;
            currentGroups.memory.grouped = true;
            if (!currentGroups.memory.oldRole) currentGroups.memory.oldRole = currentGroups.memory.role;
            currentGroups.memory.squadMembers.push(creep.id);
        } else {
            creep.memory.leader = true;
            creep.memory.oldRole = creep.memory.role;
            creep.memory.role = 'longbowSquad';
            creep.memory.squadMembers = [];
        }
    }
}

// Computes damage of a tower based on range
function determineTowerDamage(range) {
    if (range <= 5) {
        return 600;
    } else if (range < 20) {
        return 600 - 450 * (range - 5) / 15;
    } else {
        return 150;
    }
}

Creep.prototype.pathingDebug = function () {
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];
    const cleaningPath = findBestCleaningPath(this, spawn);
    console.log(`Cleaning path: ${JSON.stringify(cleaningPath)}`);
}

function findBestCleaningPath(creep, target) {
    const room = creep.room;
    if (!room) return {path: null, structures: []}; // Room not visible

    const costMatrix = new PathFinder.CostMatrix();
    room.find(FIND_STRUCTURES).forEach(structure => {
        if (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) {
            // Calculate the cost based on hits, higher hits = higher cost
            let cost = Math.round(255 * (structure.hits / structure.hitsMax));
            costMatrix.set(structure.pos.x, structure.pos.y, cost);
        }
    });

    const path = PathFinder.search(creep.pos, {pos: target.pos, range: 1},
        {
            roomCallback: function (roomName) {
                if (!creep.memory.grouped) return costMatrix;
                return getSquadMatrix(roomName);
            }
        });
    const checked = new Set();
    const impassableStructures = [];

    // Check each position in path and range 1 around it
    for (const pathPos of path.path) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = pathPos.x + dx;
                const y = pathPos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                const posKey = `${x},${y}`;
                if (checked.has(posKey)) continue;
                checked.add(posKey);
                const structs = room.structures.filter(s => s.pos.x === x && s.pos.y === y);
                for (const struct of structs) {
                    if (OBSTACLE_OBJECT_TYPES.includes(struct.structureType) || struct.structureType === STRUCTURE_RAMPART) {
                        if (struct.structureType !== STRUCTURE_CONTROLLER) impassableStructures.push(struct);
                    }
                }
            }
        }
    }
    return impassableStructures;

    function getSquadMatrix(roomName) {
        return buildSquadMatrix(roomName);

        function buildSquadMatrix(roomName) {
            let matrix = new PathFinder.CostMatrix();
            let terrain = Game.map.getRoomTerrain(roomName);
            const plainCost = 1;
            const swampCost = 25
            for (let y = 0; y < 50; y++) {
                for (let x = 0; x < 50; x++) {
                    let tile = terrain.get(x, y);
                    if (tile === TERRAIN_MASK_WALL) {
                        matrix.set(x, y, 256);
                        for (let vector of formationVectors) {
                            const newX = x + vector.x;
                            const newY = y + vector.y;
                            if (newX < 0 || newX > 49 || newY < 0 || newY > 49) continue;
                            const currentCost = matrix.get(newX, newY);
                            if (currentCost >= 256) continue;
                            matrix.set(newX, newY, 256);
                        }
                    } else if (x <= 1 || x >= 48 || y <= 1 || y >= 48) {
                        matrix.set(x, y, 10);
                    } else if (tile === TERRAIN_MASK_SWAMP) {
                        matrix.set(x, y, swampCost);
                        for (let vector of formationVectors) {
                            const newX = x + vector.x;
                            const newY = y + vector.y;
                            if (newX < 0 || newX > 49 || newY < 0 || newY > 49) continue;
                            const currentCost = matrix.get(newX, newY);
                            if (currentCost >= swampCost) continue;
                            matrix.set(newX, newY, swampCost);
                        }
                    } else {
                        matrix.set(x, y, plainCost);
                    }
                }
            }
            return matrix;
        }
    }
}

const formationVectors = [
    {x: 0, y: 0}, // top-left
    {x: 0, y: -1}, // top-right
    {x: -1, y: 0}, // bottom-left
    {x: -1, y: -1}, // bottom-right
]

function getAssignedRampart(creep, target = undefined) {
    let range = creep.hasActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
    let position;
    if (creep.memory.assignedRampart) {
        position = Game.getObjectById(creep.memory.assignedRampart);
        if (target) {
            delete creep.memory.assignedRampart;
            position = undefined;
        }
    }
    if (!position) {
        let filter = (r) => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !creep.room.myCreeps.some(c => c.memory.assignedRampart === r.id && c.id !== creep.id);
        position = target ? target.pos.findInRange(creep.room.structures, range, {filter})[0] || target.pos.findClosestByPath(creep.room.structures, {filter}) : creep.pos.findClosestByPath(creep.room.structures, {filter});
    }
    return position;
}