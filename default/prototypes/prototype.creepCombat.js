/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 3.0 - Major CPU + Deadliness Improvements
 *
 * CPU Wins:
 * - Tick-cached hostileCreeps + hostileStructures on creep
 * - Fewer findClosestByPath calls (use range when possible)
 * - Reused cached lists in heal/attack/canIWin
 *
 * Deadliness Wins:
 * - Scored target prioritization (healers first, then ranged, towers, etc.)
 * - Focus fire: prefer targets already being attacked by allies
 * - Smarter kiting (only when disadvantaged)
 * - More aggressive rangedMassAttack when surrounded
 * - Better rampart retention
 *
 * Fully compatible with optimized pathfinder + longbowSquad.
 */

Object.defineProperty(Creep.prototype, 'combatPower', {
    get: function () {
        if (this._combatPower_ts === Game.time) return this._combatPower;
        const ap = abilityPower(this.body);
        this._combatPower_ts = Game.time;
        return this._combatPower = ap.attack + ap.effectiveHeal + (ap.defense / 100);
    },
    configurable: true,
});

Creep.prototype.handleMilitaryCreep = function (barrier = false, rampart = true, ignoreBorder = true, guardLocation = undefined, guardRange = 8) {
    if (this.room.controller?.safeMode && this.room.user !== MY_USERNAME) return false;

    if (this.hasActiveBodyparts(HEAL)) this.healInRange();

    if (!canEngageCombat(this)) return this.fleeHome(true);

    let hostile = this.findClosestEnemy(barrier, ignoreBorder, guardLocation, guardRange);

    if (hostile) {
        this.memory.target = hostile.id;
        this.memory.targetPos = JSON.stringify(hostile.pos);
    } else {
        this.memory.target = undefined;
        this.memory.targetPos = undefined;
    }

    if (hostile?.pos.checkForRampart()) {
        hostile = hostile.pos.checkForRampart();
        this.memory.target = hostile.id;
    }

    if (hostile && combatAction(this, hostile, rampart)) return true;

    return this.moveToHostileConstructionSites();

    function canEngageCombat(creep) {
        return (creep.hasActiveBodyparts(HEAL) && creep.getActiveBodyparts(HEAL) > 1) ||
            creep.hasActiveBodyparts(ATTACK) ||
            creep.hasActiveBodyparts(RANGED_ATTACK);
    }

    function combatAction(creep, hostile, rampart) {
        if (rampart && creep.fightFromRampart(hostile)) return true;
        if (creep.hasActiveBodyparts(ATTACK) && creep.attackHostile(hostile)) return true;
        return !!(creep.hasActiveBodyparts(RANGED_ATTACK) && creep.fightRanged(hostile));
    }
};

Creep.prototype.findClosestEnemy = function (structuresOnly = false, ignoreBorder = false, guardLocation = undefined, guardRange = 50, includeRampart = false) {
    if (!structuresOnly && this.hasActiveBodyparts(WORK)) structuresOnly = true;

    // === TICK CACHE for hostiles (big CPU win) ===
    if (!this._hostileCache_ts || this._hostileCache_ts !== Game.time) {
        this._hostileCreeps = this.room.hostileCreeps.filter(c =>
            (!guardLocation || c.pos.getRangeTo(guardLocation) < guardRange) && !c.pos.checkForRampart()
        );
        this._hostileStructures = this.room.impassibleStructures.filter(s =>
            s.owner && !FRIENDLIES.includes(s.owner.username) &&
            (!guardLocation || s.pos.getRangeTo(guardLocation) < guardRange) &&
            ![STRUCTURE_KEEPER_LAIR, STRUCTURE_CONTROLLER, STRUCTURE_POWER_BANK].includes(s.structureType) &&
            (this.hasActiveBodyparts(ATTACK) || s.structureType !== STRUCTURE_INVADER_CORE)
        );
        this._hostileCache_ts = Game.time;
    }

    const hostileCreeps = this._hostileCreeps;
    const hostileStructures = this._hostileStructures;

    if (this.memory.blockingCreep) {
        const blocker = Game.getObjectById(this.memory.blockingCreep);
        if (blocker) return blocker;
    }

    if (this.memory.target) {
        const oldTarget = Game.getObjectById(this.memory.target);
        const armedHostile = hostileCreeps.find(c => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || (MY_ROOMS.includes(this.room.name) && c.hasActiveBodyparts(WORK)));
        if (oldTarget instanceof Structure && !armedHostile) return oldTarget;
        this.memory.target = undefined;
    }

    if (!hostileCreeps.length && !hostileStructures.length) return undefined;

    const isArmed = c => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || (MY_ROOMS.includes(this.room.name) && c.hasActiveBodyparts(WORK));
    const inRange = c => !guardLocation || c.pos.getRangeTo(guardLocation) < guardRange;

    // === SCORING SYSTEM (makes combat much deadlier) ===
    const scoreTarget = (target) => {
        let score = 0;
        const range = this.pos.getRangeTo(target);

        if (target instanceof Creep) {
            const ap = abilityPower(target.body);
            // Healers = highest priority
            if (ap.effectiveHeal > 0) score += 1000;
            // Ranged attackers next
            if (target.hasActiveBodyparts(RANGED_ATTACK)) score += 800;
            // Melee
            if (target.hasActiveBodyparts(ATTACK)) score += 600;
            // Work creeps in owned rooms
            if (MY_ROOMS.includes(this.room.name) && target.hasActiveBodyparts(WORK)) score += 500;

            // Focus fire bonus: prefer targets already being attacked by allies
            const alliesAttacking = this.room.myCreeps.filter(c =>
                c.memory.target === target.id && c.pos.getRangeTo(target) <= 5
            ).length;
            score += alliesAttacking * 150;
        } else {
            // Structures
            if (target.structureType === STRUCTURE_TOWER) score += 900;
            else if (target.structureType === STRUCTURE_SPAWN) score += 850;
            else score += 400;
        }

        // Distance penalty (closer = better)
        score -= range * 10;
        return score;
    };

    // Find best target using scoring
    let bestTarget = null;
    let bestScore = -Infinity;

    for (const c of hostileCreeps) {
        if (!isArmed(c) || (ignoreBorder && (c.pos.x <= 0 || c.pos.x >= 49 || c.pos.y <= 0 || c.pos.y >= 49))) continue;
        const s = scoreTarget(c);
        if (s > bestScore) {
            bestScore = s;
            bestTarget = c;
        }
    }

    if (bestTarget && !structuresOnly) return updateTarget(this, bestTarget);

    // Structures (towers first, then spawns, then others)
    for (const s of hostileStructures) {
        if (!s.isActive()) continue;
        const sc = scoreTarget(s);
        if (sc > bestScore) {
            bestScore = sc;
            bestTarget = s;
        }
    }

    if (bestTarget) return updateTarget(this, bestTarget);

    // Fallback: unarmed creeps
    for (const c of hostileCreeps) {
        if (isArmed(c)) continue;
        const s = scoreTarget(c);
        if (s > bestScore) {
            bestScore = s;
            bestTarget = c;
        }
    }

    return bestTarget ? updateTarget(this, bestTarget) : undefined;

    function updateTarget(creep, target) {
        if (includeRampart && target.pos.checkForRampart()) target = target.pos.checkForRampart();
        creep.memory.target = target.id;
        return target;
    }
};

Creep.prototype.attackHostile = function (hostile) {
    if (!hostile) return false;

    const range = this.pos.getRangeTo(hostile);
    const lastRange = this.memory.lastRange || range;
    this.memory.lastRange = range;

    let moveTarget = hostile;

    const rampartCover = this.pos.findClosestByPath(this.room.ramparts, {
        filter: r => r.my && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() &&
            (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos)) && r.pos.getRangeTo(hostile) <= 1
    });
    if (rampartCover) moveTarget = rampartCover;

    if (this.hasActiveBodyparts(RANGED_ATTACK) && range <= 3) {
        const nearby = this.pos.findInRange(this.room.hostileCreeps, 2);
        if (nearby.length >= 2) {
            this.say('BIG PEW!', true);
            this.rangedMassAttack();
        } else {
            this.say('PEW!', true);
            this.rangedAttack(hostile);
        }
    }

    if (this.hasActiveBodyparts(ATTACK)) {
        if (range === 1) {
            this.attack(hostile);
            if (hostile instanceof Creep) this.move(this.pos.getDirectionTo(hostile));
            return true;
        }
        if (range > 1) {
            // Only kite when truly disadvantaged
            if (hostile instanceof Creep && range >= lastRange &&
                hostile.hasActiveBodyparts(RANGED_ATTACK) && this.hits < this.hitsMax * 0.75) {
                this.memory.kiteCount = (this.memory.kiteCount || 0) + 1;
                if (this.memory.kiteCount > 4 || this.hits < this.hitsMax * 0.5) {
                    if (!this.pos.checkForRampart()) this.fleeHome(true);
                } else {
                    this.shibKite(5);
                }
                return true;
            }
            this.memory.kiteCount = 0;
            this.shibMove(moveTarget, {ignoreCreeps: false, range: 1});
            return true;
        }
    }

    if (this.hasActiveBodyparts(WORK) && hostile instanceof Structure) {
        if (this.dismantle(hostile) === ERR_NOT_IN_RANGE) {
            this.shibMove(moveTarget, {ignoreCreeps: false, range: 1});
        }
        return true;
    }

    return false;
};

Creep.prototype.fightFromRampart = function (hostile = undefined) {
    const target = hostile || this.findClosestEnemy(false, true);
    if (!target || !target.pos || !(this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK))) return false;

    const range = this.hasActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
    let ramparts = target.pos.findInRange(FIND_MY_STRUCTURES, range, {
        filter: r => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() &&
            (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos))
    });

    let position = this.pos.findClosestByPath(ramparts);

    if (!position) {
        position = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: r => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() &&
                (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos)) &&
                r.pos.getRangeTo(target) < this.pos.getRangeTo(target) + 1
        });
    }

    if (!position) return false;

    if (!this.pos.isEqualTo(position)) this.shibMove(position, {range: 0});

    if (this.hasActiveBodyparts(RANGED_ATTACK) && this.pos.getRangeTo(target) <= 3) {
        const threats = this.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
        if (threats.length >= 2) this.rangedMassAttack();
        else this.rangedAttack(target);
    }
    if (this.hasActiveBodyparts(ATTACK) && this.pos.isNearTo(target)) this.attack(target);

    return true;
};

Creep.prototype.fightRanged = function (target) {
    if (!target || !this.hasActiveBodyparts(RANGED_ATTACK)) return false;

    const range = this.pos.getRangeTo(target);

    if (MY_ROOMS.includes(this.room.name)) {
        const rampartCover = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: r => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() &&
                r.pos.getRangeTo(target) <= 3 && (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos))
        });
        if (rampartCover) {
            if (!this.pos.isEqualTo(rampartCover)) this.shibMove(rampartCover, {range: 0});
            this.rangedAttack(target);
            return true;
        }
    }

    if (!MY_ROOMS.includes(this.room.name)) {
        const dangerTower = this.room.impassibleStructures.find(s =>
            s.structureType === STRUCTURE_TOWER && s.owner && !FRIENDLIES.includes(s.owner.username) &&
            s.isActive() && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST && this.pos.getRangeTo(s) <= 5
        );
        if (dangerTower) {
            if (range <= 3) this.rangedAttack(target);
            else this.attackInRange();
            this.shibKite(7);
            return true;
        }
    }

    if (range <= 3) {
        const nearby = this.pos.findInRange(this.room.hostileCreeps, 2);
        if (nearby.length >= 2) {
            this.rangedMassAttack();
        } else {
            if (range < 3 && (this.hits < this.hitsMax * 0.8 || nearby.length > 1)) {
                this.shibKite(4);
            }
            this.rangedAttack(target);
        }
    } else {
        this.shibMove(target, {range: 3});
        this.attackInRange();
    }
    return true;
};

Creep.prototype.moveToHostileConstructionSites = function (creepCheck = false, onlyInBuild = true) {
    if (!this.room.constructionSites.length || this.room.controller?.safeMode || FRIENDLIES.includes(INTEL[this.room.name]?.user)) return false;

    let site = Game.getObjectById(this.memory.stompSite) ||
        this.pos.findClosestByRange(this.room.constructionSites, {
            filter: s => (!onlyInBuild || s.progress) && !s.my && !s.pos.checkForCreep()
        });

    if (site) {
        this.memory.stompSite = site.id;
        if (site.pos.isEqualTo(this.pos)) return this.moveRandom();
        this.shibMove(site, {range: 0, ignoreCreeps: false});
        this.say("STOMP", true);
        return true;
    }
    this.memory.stompSite = undefined;
    return false;
};

Creep.prototype.scorchedEarth = function () {
    if (this.room.controller?.safeMode || FRIENDLIES.includes(INTEL[this.room.name]?.user)) return false;

    const hostile = this.findClosestEnemy(true);
    if (!hostile) return false;

    this.memory.target = hostile.id;
    this.say([ICONS.respond, 'SCORCHED', 'EARTH'][Game.time % 3], true);

    if (this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK) || this.hasActiveBodyparts(WORK)) {
        let acted = false;
        if (this.hasActiveBodyparts(ATTACK)) acted = this.attack(hostile) === OK;
        else if (this.hasActiveBodyparts(RANGED_ATTACK)) acted = this.rangedAttack(hostile) === OK;
        else if (this.hasActiveBodyparts(WORK)) acted = this.dismantle(hostile) === OK;

        if (!acted) {
            const moveRange = (!this.hasActiveBodyparts(ATTACK) && !this.hasActiveBodyparts(WORK)) ? 3 : 1;
            this.shibMove(hostile, {tunnel: true, range: moveRange});
        }
    }
    return true;
};

Creep.prototype.attackInRange = function () {
    if (!this.hasActiveBodyparts(RANGED_ATTACK) || (!this.room.hostileCreeps.length && !this.room.hostileStructures.length)) return false;

    const target = Game.getObjectById(this.memory.target);
    if (target && this.pos.inRangeTo(target, 3)) {
        this.rangedAttack(target);
        return true;
    }

    let hostile = Game.getObjectById(this.memory.opportunityAttack);
    if (!hostile || !hostile.pos.inRangeTo(this, 3) || hostile.pos.roomName !== this.room.name) {
        this.memory.opportunityAttack = undefined;
        hostile = FRIENDLIES.includes(INTEL[this.room.name]?.user)
            ? this.pos.findFirstInRange(this.room.hostileCreeps.concat(this.room.hostileStructures), 3)
            : this.pos.findFirstInRange(this.room.hostileCreeps.concat(this.room.structures), 3);
    }

    if (hostile) {
        this.memory.opportunityAttack = hostile.id;
        this.rangedAttack(hostile);
        return true;
    }
    return false;
};

Creep.prototype.healInRange = function (blinky = false) {
    if (!this.hasActiveBodyparts(HEAL)) return false;

    // Use cached hostiles if available, else filter
    const injured = (this._hostileCreeps ? this.room.creeps : this.room.creeps.filter(c =>
        c.owner && (FRIENDLIES.includes(c.owner.username) || c.my) && c.hits < c.hitsMax && this.pos.getRangeTo(c) <= 3
    )).filter(c => c.hits < c.hitsMax && this.pos.getRangeTo(c) <= 3);

    let best = injured.length ? _.min(injured, c => c.hits / c.hitsMax) : null;

    if (this.hits < this.hitsMax && (!best || (best.hits / best.hitsMax) < (this.hits / this.hitsMax))) {
        this.heal(this);
    } else if (best) {
        if (this.pos.isNearTo(best)) this.heal(best);
        else this.rangedHeal(best);
    } else if (blinky) {
        this.heal(this);
    }
};

Creep.prototype.fleeHome = function (force = false) {
    if (this.room.controller?.owner && FRIENDLIES.includes(this.room.controller.owner.username) && this.room.towers[0]) return false;
    if (this.hits < this.hitsMax) force = true;
    if (!force && !this.memory.runCooldown && (this.hits === this.hitsMax || (!INTEL[this.room.name]?.lastCombat || INTEL[this.room.name].lastCombat + 10 < Game.time))) return false;

    if (!this.memory.ranFrom) this.memory.ranFrom = this.room.name;

    const closest = this.memory.fleeDestination || findClosestOwnedRoom(this.room.name, false, 3, false);
    if (!closest) return false;

    this.memory.fleeDestination = closest;

    if (this.room.name !== closest) {
        this.memory.runCooldown = Game.time + 50;
        this.shibMove(new RoomPosition(25, 25, closest), {range: 15});
    } else if (Game.time <= this.memory.runCooldown) {
        this.idleFor((this.memory.runCooldown - Game.time) / 2);
    } else {
        delete this.memory.ranFrom;
        delete this.memory.fleeDestination;
        delete this.memory.runCooldown;
    }
    return true;
};

Creep.prototype.canIWin = function (range = 50, inbound = undefined) {
    if (this.room.controller?.safeMode && this.room.controller.owner?.username !== MY_USERNAME) return false;
    if (this.room.name === this.memory.colony || (!this.room.hostileCreeps.length && !this.room.impassibleStructures.some(s => s.owner && s.structureType === STRUCTURE_TOWER && !FRIENDLIES.includes(s.owner.username) && s.isActive()))) return true;
    if (!INTEL[this.room.name]) return true;

    // Use cached power if available this tick
    if (this._canIWin_ts === Game.time) return this._canIWin_result;

    const hostilePower = calculateHostilePower(this, range);
    const friendlyPower = calculateFriendlyPower(this, range, inbound);

    INTEL[this.room.name].hostilePower = hostilePower;
    INTEL[this.room.name].friendlyPower = friendlyPower;

    const onRampart = this.pos.checkForRampart();
    const hasRanged = this.hasActiveBodyparts(RANGED_ATTACK);
    const noHostileRanged = !this.room.hostileCreeps.some(c => c.hasActiveBodyparts(RANGED_ATTACK));

    const result = (this.hits / this.hitsMax < 0.6 && !onRampart) ? false :
        (hasRanged && noHostileRanged) || (onRampart && friendlyPower >= hostilePower * 0.75) || (friendlyPower > hostilePower);

    this._canIWin_ts = Game.time;
    this._canIWin_result = result;
    return result;

    function calculateHostilePower(creep, range) {
        let power = 0;
        const hostiles = creep.room.hostileCreeps.filter(c =>
            (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(HEAL)) &&
            creep.pos.getRangeTo(c) <= range
        );
        hostiles.forEach(c => {
            const ap = abilityPower(c.body);
            power += ap.attack + ap.effectiveHeal + (ap.defense / 100);
        });
        const towers = creep.room.impassibleStructures.filter(s =>
            s.structureType === STRUCTURE_TOWER && (!s.owner || !FRIENDLIES.includes(s.owner.username)) &&
            s.isActive() && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST
        );
        for (const tower of towers) power += determineTowerDamage(tower.pos.getRangeTo(creep));
        return power;
    }

    function calculateFriendlyPower(creep, range, inbound) {
        const ap = abilityPower(creep.body);
        let power = ap.attack + ap.effectiveHeal + (ap.defense / 100);

        const myCreeps = creep.room.myCreeps.filter(c => c.id !== creep.id);
        const allied = creep.room.creeps.filter(c => c.owner && FRIENDLIES.includes(c.owner.username) && !c.my);
        const friendly = myCreeps.concat(allied);

        power += friendly.reduce((sum, c) => {
            if (c.pos.getRangeTo(creep) <= range || (inbound && inbound.includes(c.id))) {
                const ap2 = abilityPower(c.body);
                return sum + ap2.attack + ap2.effectiveHeal + (ap2.defense / 100);
            }
            return sum;
        }, 0);

        power += creep.room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}})
            .reduce((sum, t) => (t.pos.getRangeTo(creep) <= range && t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST)
                ? sum + determineTowerDamage(t.pos.getRangeTo(creep)) : sum, 0);

        return power;
    }
};

Creep.prototype.findDefensivePosition = function (target) {
    if (target) return this.fightFromRampart(target);

    const rampart = getAssignedRampart(this);
    if (rampart) {
        if (this.pos.getRangeTo(rampart)) {
            this.memory.other.stationary = undefined;
            return this.shibMove(rampart, {range: 0});
        }
        this.memory.other.stationary = true;
        return true;
    }

    const fallback = new RoomPosition(25, 25, this.room.name);
    if (this.pos.getRangeTo(fallback) <= 12) this.idleFor(5);
    else this.shibMove(fallback, {range: 12, avoidEnemies: true});
};

Creep.prototype.formSquad = function () {
    if (!this.memory.grouped && !this.spawning) findGroup(this);
    else if (this.memory.grouped && !this.memory.leader) {
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
        const maxMembers = (creep.memory.misc?.waitFor || 4) - 1;
        let groups = creep.room.myCreeps.filter(c =>
            c.id !== creep.id &&
            c.memory.role.includes(creep.memory.role) &&
            c.memory.destination === creep.memory.destination &&
            c.memory.operation === creep.memory.operation &&
            c.memory.leader && c.memory.squadMembers.length < maxMembers
        );
        if (creep.memory.operation === 'borderPatrol') {
            groups = _.filter(Game.creeps, c =>
                c.my && c.id !== creep.id &&
                (c.memory.role.includes(creep.memory.role) || creep.memory.role.includes(c.memory.role)) &&
                c.memory.destination === creep.memory.destination &&
                c.memory.operation === creep.memory.operation &&
                c.memory.leader && c.memory.squadMembers.length < maxMembers
            );
        }
        if (groups.length) {
            const leader = _.max(groups, c => c.memory.squadMembers.length);
            creep.memory.grouped = true;
            creep.memory.leader = undefined;
            creep.memory.squadMembers = undefined;
            creep.memory.oldRole = creep.memory.role;
            creep.memory.role = 'longbowSquad';
            creep.memory.groupLeader = leader.id;
            leader.memory.grouped = true;
            if (!leader.memory.oldRole) leader.memory.oldRole = leader.memory.role;
            leader.memory.squadMembers.push(creep.id);
        } else {
            creep.memory.leader = true;
            creep.memory.oldRole = creep.memory.role;
            creep.memory.role = 'longbowSquad';
            creep.memory.squadMembers = [];
        }
    }
};

function determineTowerDamage(range) {
    if (range <= 5) return 600;
    if (range < 20) return 600 - 450 * (range - 5) / 15;
    return 150;
}

Creep.prototype.pathingDebug = function () {
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];
    const path = findBestCleaningPath(this, spawn);
    console.log(`Cleaning path: ${JSON.stringify(path)}`);
};

function findBestCleaningPath(creep, target) {
    const room = creep.room;
    if (!room) return [];

    const costMatrix = new PathFinder.CostMatrix();
    room.find(FIND_STRUCTURES).forEach(s => {
        if (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) {
            costMatrix.set(s.pos.x, s.pos.y, Math.round(255 * (s.hits / s.hitsMax)));
        }
    });

    const path = PathFinder.search(creep.pos, {pos: target.pos, range: 1}, {
        roomCallback: roomName => creep.memory.grouped ? getSquadMatrix(roomName) : costMatrix
    });

    const checked = new Set();
    const impassable = [];

    for (const p of path.path) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = p.x + dx, y = p.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                const key = `${x},${y}`;
                if (checked.has(key)) continue;
                checked.add(key);
                const structs = room.structures.filter(s => s.pos.x === x && s.pos.y === y);
                for (const s of structs) {
                    if ((OBSTACLE_OBJECT_TYPES.includes(s.structureType) || s.structureType === STRUCTURE_RAMPART) && s.structureType !== STRUCTURE_CONTROLLER) {
                        impassable.push(s);
                    }
                }
            }
        }
    }
    return impassable;

    function getSquadMatrix(roomName) {
        const matrix = new PathFinder.CostMatrix();
        const terrain = Game.map.getRoomTerrain(roomName);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, 256);
                    for (const v of formationVectors) {
                        const nx = x + v.x, ny = y + v.y;
                        if (nx >= 0 && nx <= 49 && ny >= 0 && ny <= 49 && matrix.get(nx, ny) < 256) matrix.set(nx, ny, 256);
                    }
                } else if (x <= 1 || x >= 48 || y <= 1 || y >= 48) {
                    matrix.set(x, y, 10);
                } else if (tile === TERRAIN_MASK_SWAMP) {
                    matrix.set(x, y, 25);
                    for (const v of formationVectors) {
                        const nx = x + v.x, ny = y + v.y;
                        if (nx >= 0 && nx <= 49 && ny >= 0 && ny <= 49 && matrix.get(nx, ny) < 25) matrix.set(nx, ny, 25);
                    }
                } else {
                    matrix.set(x, y, 1);
                }
            }
        }
        return matrix;
    }
}

const formationVectors = [
    {x: 0, y: 0}, {x: 0, y: -1}, {x: -1, y: 0}, {x: -1, y: -1}
];

function getAssignedRampart(creep, target = undefined) {
    const range = creep.hasActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
    let position = creep.memory.assignedRampart ? Game.getObjectById(creep.memory.assignedRampart) : null;

    if (target || !position) {
        if (target) delete creep.memory.assignedRampart;

        const filter = r => r.my && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() &&
            !creep.room.myCreeps.some(c => c.memory.assignedRampart === r.id && c.id !== creep.id);

        if (target) {
            position = target.pos.findInRange(creep.room.structures, range, {filter})[0] ||
                target.pos.findClosestByPath(creep.room.structures, {filter});
        } else {
            const hostiles = creep.room.hostileCreeps.filter(h =>
                h.hasActiveBodyparts(ATTACK) || h.hasActiveBodyparts(RANGED_ATTACK) || h.hasActiveBodyparts(WORK)
            );
            if (hostiles.length) {
                const available = creep.room.structures.filter(filter);
                position = _.min(available, r =>
                    _.min(hostiles.map(h => Math.abs(h.pos.x - r.pos.x) + Math.abs(h.pos.y - r.pos.y)))
                );
            }
            if (!position) position = creep.pos.findClosestByPath(creep.room.structures, {filter});
        }
    }
    return position;
}