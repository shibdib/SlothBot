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

    if (!hostile) {
        return this.moveToHostileConstructionSites();
    } else {
        // Store hostiles position in memory
        this.memory.target = hostile.id;
        this.memory.targetPos = JSON.stringify(hostile.pos);
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
    // Cache the required data upfront
    const hostileStructures = _.filter(this.room.impassibleStructures, (s) =>
        s.owner && !FRIENDLIES.includes(s.owner.username) &&
        (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange)
        && ![STRUCTURE_KEEPER_LAIR, STRUCTURE_CONTROLLER, STRUCTURE_POWER_BANK].includes(s.structureType)
    );

    const hostileCreeps = _.filter(this.room.hostileCreeps, (s) =>
        (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange) && !s.pos.checkForRampart()
    );

    const barriersPresent = _.some(this.room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);

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

    // Handle attacking rooms with targets behind ramparts
    if (this.room.controller && !FRIENDLIES.includes(INTEL[this.room.name].user) && findBestCleaningPath(this, this.room.controller).length) {
        const destroyThese = findBestCleaningPath(this, this.room.controller);
        if (destroyThese[0]) return updateTargetAndReturn(this, destroyThese[0].structure);
    }

    enemy = findClosest(hostileCreeps, (c) =>
        !isArmedCreep(c) &&
        (!ignoreBorder || (c.pos.x > 0 && c.pos.x < 49 && c.pos.y > 0 && c.pos.y < 49)) &&
        inGuardRange(c) &&
        !c.pos.checkForRampart()
    );
    if (enemy && !structuresOnly) return updateTargetAndReturn(this, enemy);

    enemy = findClosest(hostileStructures, (s) =>
        isRampartChecked(s) &&
        s.isActive()
    );
    if (enemy) return updateTargetAndReturn(this, enemy);

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
 * Handle ranged fighting with optimal movement and targeting
 * @param target
 * @returns {boolean}
 */
Creep.prototype.fightRanged = function (target) {
    if (!target || !this.hasActiveBodyparts(RANGED_ATTACK)) return false;

    // Check if already in optimal position (rampart and range)
    if (this.pos.checkForRampart() && this.pos.getRangeTo(target) <= 3) {
        this.rangedAttack(target);
        return true;
    }

    let range = this.pos.getRangeTo(target);

    // Find rampart for cover if available
    let rampartCover = findRampartCover(this, target);
    if (rampartCover) {
        this.shibMove(rampartCover, {range: 0, ignoreCreeps: false});
        return true;
    }

    if (range <= 3) {
        handleCloseCombat(this, target);
    } else {
        handleLongRangeCombat(this, target);
    }

    // Kite if can't win or if too close to dangerous enemies
    if (!this.canIWin(8) || shouldKite(this, target)) {
        return this.shibKite(7);
    }

    return true;

    function shouldKite(creep, target) {
        return creep.pos && target instanceof Creep &&
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

    function handleCloseCombat(creep, target) {
        if (target instanceof Creep) {
            // Check for mass attack conditions
            if (creep.pos.findInRange(creep.room.hostileCreeps, 1).length > 1 || creep.pos.getRangeTo(target) === 1) {
                creep.say('BIG PEW!', true);
                creep.rangedMassAttack();
            } else {
                creep.say('PEW!', true);
                creep.rangedAttack(target);
            }
            // Check for nearby melee creeps
            const meleeEnemies = creep.room.hostileCreeps.find((c) => c.hasActiveBodyparts(ATTACK) && c.pos.getRangeTo(creep) <= 4);
            // If you can win, move closer
            if (creep.canIWin(5) && !meleeEnemies) {
                creep.shibMove(target, {range: 2});
            } else {
                creep.shibKite(6)
            }
        } else {
            creep.say('BURN!', true);
            let rampartEnemies = [];
            if (target.pos.checkForRampart()) {
                rampartEnemies = creep.pos.findInRange(creep.room.hostileCreeps, 2, {filter: (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)});
            }
            // Handle attack
            if (target.structureType !== STRUCTURE_WALL && creep.pos.isNearTo(target)) {
                creep.rangedMassAttack();
            }
            // Handle movement
            if (rampartEnemies.length || !creep.canIWin(2)) return creep.shibKite(3)
            const range = target.structureType !== STRUCTURE_SPAWN && !rampartEnemies.length ? 1 : 2;
            if (creep.canIWin(5)) {
                creep.shibMove(target, {range: range, ignoreCreeps: false});
            } else {
                return creep.shibKite(6)
            }
        }
    };

    function handleLongRangeCombat(creep, target) {
        // Attack the weakest nearby enemy if in range
        creep.attackInRange();

        // Move towards target, but adjust range based on threat level
        let nearbyMelee = creep.room.hostileCreeps.filter((c) => c.hasActiveBodyparts(ATTACK) && c.pos.getRangeTo(creep) <= 6);
        if (nearbyMelee.length) nearbyMelee = creep.pos.findClosestByPath(nearbyMelee);
        let moveRange = (nearbyMelee ? 4 : target instanceof Creep && !target.hasActiveBodyparts(ATTACK)) ? 1 : 3;

        // Kite if can't win or if too close to dangerous enemies
        if (!creep.canIWin(6) || shouldKite(this, target)) {
            return creep.shibKite(5);
        } else {
            return creep.shibMove(target, {ignoreCreeps: false, range: moveRange});
        }
    }
}

/**
 * Handle rampart fighting
 * @param hostile
 * @returns {boolean}
 */
Creep.prototype.fightFromRampart = function (hostile = undefined) {
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

    // Handle combat
    performCombat(this, target, position);
    return true;

    function performCombat(creep, target, position) {
        // Move to rampart if not already on it
        if (creep.pos.getRangeTo(position) > 0) {
            creep.shibMove(position, {range: 0});
            return;
        }
        // Ranged combat
        if (creep.hasActiveBodyparts(RANGED_ATTACK)) {
            let range = creep.pos.getRangeTo(target);
            if (range <= 3) {
                let threats = creep.pos.findInRange(creep.room.hostileCreeps, 3, {
                    filter: (c) => !FRIENDLIES.includes(c.owner.username)
                });
                if (threats.length > 1) {
                    creep.rangedMassAttack();
                } else {
                    creep.rangedAttack(target);
                }
            }
        }
        // Melee combat
        if (creep.pos.getRangeTo(target) === 1 && creep.hasActiveBodyparts(ATTACK)) {
            creep.attack(target);
        }
    }
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
        filter: (s) => (!onlyInBuild || s.progress) && !s.my
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
    let injured = _.find(this.room.creeps, (c) =>
        (_.includes(FRIENDLIES, c.owner.username) || c.my) && c.hits < c.hitsMax
    );

    // Heal self if needed
    if (this.hits < this.hitsMax && (!injured || (injured.hits / injured.hitsMax) < (this.hits / this.hitsMax))) {
        this.heal(this); // Heal self if less than max health
        return true;
    }

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

    if (blinky) this.heal(this);

    return false;
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
    let cooldown = this.memory.runCooldown;
    let closest = this.memory.fleeDestination || findClosestOwnedRoom(this.room.name, false, 3);
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
    if (this.room.controller && this.room.controller.safeMode && this.room.controller.owner.username !== MY_USERNAME) return false;

    // Check if we're in a friendly or safe environment
    if (this.room.name === this.memory.colony || (!this.room.hostileCreeps.length && !this.room.impassibleStructures.some(s => s.structureType === STRUCTURE_TOWER && !_.includes(FRIENDLIES, s.owner.username) && s.isActive()))) return true;

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
        hostiles.forEach(c => power += c.abilityPower().attack + (c.hasActiveBodyparts(HEAL) ? c.abilityPower().heal : 0));
        const towers = creep.room.impassibleStructures.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            !_.includes(FRIENDLIES, s.owner.username) &&
            s.isActive() &&
            s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST
        );
        for (const tower of towers) {
            power += determineTowerDamage(tower.pos.getRangeTo(creep))
        }
        return power;
    }

    function calculateFriendlyPower(creep, range, inbound) {
        let friendlyPower = creep.abilityPower().attack + creep.abilityPower().heal;
        const myCreeps = creep.room.find(FIND_MY_CREEPS);

        friendlyPower += myCreeps.reduce((sum, c) => {
            if (c.pos.getRangeTo(creep) <= range || (inbound && inbound.includes(c.id))) {
                return sum + c.abilityPower().attack + c.abilityPower().heal;
            }
            return sum;
        }, 0);

        friendlyPower += creep.room.find(FIND_MY_STRUCTURES, {
            filter: {structureType: STRUCTURE_TOWER}
        }).reduce((sum, t) => t.pos.getRangeTo(creep) <= range && t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST ? sum + TOWER_POWER_ATTACK : sum, 0);

        return friendlyPower;
    }

    function canWinBasedOnPower(creep, hostilePower, friendlyPower) {
        const onRampart = creep.pos.checkForRampart();
        const hasRanged = creep.hasActiveBodyparts(RANGED_ATTACK);
        const noHostileRanged = !creep.room.hostileCreeps.some(c => c.hasActiveBodyparts(RANGED_ATTACK));

        // Check for retreat if health is critically low
        if (creep.hits / creep.hitsMax < 0.6) return false; // 4. Intelligent retreat based on health percentage

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

Creep.prototype.formSquad = function () {
    // Find partners
    if (!this.memory.grouped) {
        findGroup(this);
    }

    function findGroup(creep) {
        const currentGroups = _.find(creep.room.myCreeps, (c) => c.memory.role === creep.memory.role && c.memory.destination === creep.memory.destination && c.memory.operation === creep.memory.operation && c.memory.leader && c.memory.squadMembers.length < 3);
        if (currentGroups) {
            creep.memory.grouped = true;
            creep.memory.groupLeader = currentGroups.id;
            currentGroups.memory.grouped = true;
            currentGroups.memory.squadMembers.push(creep.id);
        } else {
            creep.memory.leader = true;
            creep.memory.squadMembers = [];
        }
    }
}
Creep.prototype.formSquadDebug = function () {
    // Find partners
    if (!this.memory.grouped) {
        findGroup(this);
    }

    function findGroup(creep) {
        const currentGroups = _.find(creep.room.myCreeps, (c) => c.memory.role === creep.memory.role && c.memory.destination === creep.memory.destination && c.memory.operation === creep.memory.operation && c.memory.leader && c.memory.squadMembers.length < 3);
        if (currentGroups) {
            creep.memory.grouped = true;
            creep.memory.groupLeader = currentGroups.id;
            currentGroups.memory.squadMembers.push(creep.id);
        } else {
            creep.memory.leader = true;
            creep.memory.grouped = true;
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

function findBestCleaningPath(creep, target) {
    const room = creep.room;
    if (!room) return {path: null, structures: []}; // Room not visible

    const costMatrix = new PathFinder.CostMatrix();
    room.find(FIND_STRUCTURES).forEach(structure => {
        if (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) {
            // Calculate the cost based on hits, higher hits = higher cost
            let cost = Math.floor(structure.hits / 100000); // Adjust this divisor as needed
            // Cap the cost to prevent impassable barriers
            cost = Math.min(cost, 255); // 255 is the max cost in a CostMatrix
            costMatrix.set(structure.pos.x, structure.pos.y, cost);
        }
    });

    // Pathfinding options
    const pathOptions = {
        roomCallback: function (roomName) {
            if (roomName === room.name) {
                return costMatrix;
            }
            return false;
        },
        plainCost: 1,
        swampCost: 2,
        maxOps: 2000,
    };
    const path = PathFinder.search(creep.pos, {pos: target.pos, range: 1}, pathOptions);
    let structuresOnPath = [];
    if (path.path.length > 0) {
        structuresOnPath = path.path.reduce((acc, pos) => {
            const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
            structures.forEach(structure => {
                if (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) {
                    acc.push({pos: structure.pos, structure: structure});
                }
            });
            return acc;
        }, []);
    }
    return structuresOnPath;
}

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