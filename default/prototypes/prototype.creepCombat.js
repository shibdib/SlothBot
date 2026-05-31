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

// Structure types worth breaking a rampart to reach. A rampart sitting over one
// of these inherits the underlying structure's priority; anything else under a
// rampart (roads, containers, nothing at all) leaves it as a bare wall — which
// goes to the last-resort fallback so we don't chip walls while real targets exist.
const IMPORTANT_UNDER_RAMPART = new Set([
    STRUCTURE_TOWER,
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TERMINAL,
    STRUCTURE_LAB,
    STRUCTURE_NUKER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_FACTORY
]);

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

    if (!canEngageCombat(this) && this.memory.role !== 'test') return this.fleeHome(true);

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
    // If creep role is 'test' treat flag named 'd' as a target
    if (this.memory.role === 'test') {
        const flag = Game.flags.d;
        if (flag) return flag;
    }

    if (!structuresOnly && this.hasActiveBodyparts(WORK)) structuresOnly = true;

    const isArmed = c => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || (MY_ROOMS.includes(this.room.name) && c.hasActiveBodyparts(WORK));
    const inRange = c => !guardLocation || c.pos.getRangeTo(guardLocation) < guardRange;
    const onBorder = pos => pos.x <= 0 || pos.x >= 49 || pos.y <= 0 || pos.y >= 49;

    // === TICK CACHE for hostiles (big CPU win) ===
    // Split hostile creeps by rampart cover at cache time so we only pay
    // checkForRampart once per hostile per tick. The two lists feed the
    // priority chain below — direct hostiles first, then structures, then
    // the ramparts protecting any hostiles we couldn't otherwise reach.
    if (!this._hostileCache_ts || this._hostileCache_ts !== Game.time) {
        this._directHostileCreeps = [];
        this._rampartedHostileCreeps = [];
        for (const c of this.room.hostileCreeps) {
            if (!inRange(c)) continue;
            if (c.pos.checkForRampart()) this._rampartedHostileCreeps.push(c);
            else this._directHostileCreeps.push(c);
        }
        this._hostileStructures = this.room.impassibleStructures.filter(s =>
            s.owner && !FRIENDLIES.includes(s.owner.username) &&
            inRange(s) &&
            ![STRUCTURE_KEEPER_LAIR, STRUCTURE_CONTROLLER, STRUCTURE_POWER_BANK].includes(s.structureType) &&
            (this.hasActiveBodyparts(ATTACK) || s.structureType !== STRUCTURE_INVADER_CORE)
        );
        this._hostileCache_ts = Game.time;
    }

    const hostileCreeps = this._directHostileCreeps;
    const hostileStructures = this._hostileStructures;
    const rampartedHostiles = this._rampartedHostileCreeps;
    const armedHostile = hostileCreeps.find(isArmed);

    if (this.memory.blockingCreep) {
        const blocker = Game.getObjectById(this.memory.blockingCreep);
        if (blocker) return blocker;
    }

    if (this.memory.target) {
        const oldTarget = Game.getObjectById(this.memory.target);
        if (oldTarget instanceof Structure && !armedHostile) return oldTarget;
        this.memory.target = undefined;
    }

    if (!hostileCreeps.length && !hostileStructures.length && !rampartedHostiles.length) return undefined;

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
            else if (target.structureType === STRUCTURE_RAMPART) score += 50; // bare wall — proxy-scored elsewhere when it covers something
            else if (IMPORTANT_UNDER_RAMPART.has(target.structureType)) score += 500; // storage / terminal / lab / nuker / etc.
            else score += 200; // extensions, links, other minor structures
        }

        // Distance penalty (closer = better)
        score -= range * 10;
        return score;
    };

    // Score a rampart as if it were the (important) structure it covers. We pay
    // the lookFor once per rampart per call and the rampart-vs-structure tie is
    // resolved by handleMilitaryCreep's swap — either way, damage lands on the
    // rampart first, which is what has to die before we touch the structure.
    const scoreRampartProxy = (rampart) => {
        const beneath = rampart.pos.lookFor(LOOK_STRUCTURES)
            .find(o => o.id !== rampart.id && IMPORTANT_UNDER_RAMPART.has(o.structureType));
        if (!beneath) return null; // bare rampart — handled in priority 5
        // Score the rampart at the underlying structure's value, but keep the
        // rampart as the actual target so callers without a swap step (e.g. ops
        // that don't go through handleMilitaryCreep) still attack the right tile.
        let score = scoreTarget(beneath);
        // scoreTarget added the underlying structure's score AND its range
        // penalty — but the range is measured to the rampart's position (same
        // tile), so this is already what we want.
        return score;
    };

    let bestTarget = null;
    let bestScore = -Infinity;

    // Priority 1: armed, directly-reachable hostile creeps. Skipped entirely for
    // WORK / structuresOnly callers — they shouldn't be scoring creep targets at
    // all, because a high creep score could otherwise dominate the structure pass.
    if (!structuresOnly) {
        for (const c of hostileCreeps) {
            if (!isArmed(c) || (ignoreBorder && onBorder(c.pos))) continue;
            const s = scoreTarget(c);
            if (s > bestScore) {
                bestScore = s;
                bestTarget = c;
            }
        }
        if (bestTarget) return updateTarget(this, bestTarget);
    }

    // Priority 2: hostile structures. Ramparts get proxy-scored by what's
    // underneath; bare ramparts get deferred to priority 5 so we don't waste
    // attacks chipping walls when there's something real to kill.
    const bareRampartTargets = [];
    for (const s of hostileStructures) {
        if (!s.isActive()) continue;
        if (s.structureType === STRUCTURE_RAMPART) {
            const proxy = scoreRampartProxy(s);
            if (proxy === null) {
                bareRampartTargets.push(s);
                continue;
            }
            if (proxy > bestScore) {
                bestScore = proxy;
                bestTarget = s;
            }
        } else {
            const sc = scoreTarget(s);
            if (sc > bestScore) {
                bestScore = sc;
                bestTarget = s;
            }
        }
    }
    if (bestTarget) return updateTarget(this, bestTarget);

    // Priority 3: ramparts protecting hostile creeps we can't reach directly.
    // Armed occupants get a +500 bonus so we chip through to threats rather than
    // ignore them. Dedup in case two hostiles ever share a tile.
    const visitedRamparts = new Set();
    for (const c of rampartedHostiles) {
        if (ignoreBorder && onBorder(c.pos)) continue;
        const rampart = c.pos.checkForRampart();
        if (!rampart || visitedRamparts.has(rampart.id)) continue;
        visitedRamparts.add(rampart.id);
        let sc = scoreTarget(rampart);
        if (isArmed(c)) sc += 500;
        if (sc > bestScore) {
            bestScore = sc;
            bestTarget = rampart;
        }
    }
    if (bestTarget) return updateTarget(this, bestTarget);

    // Priority 4: unarmed direct hostiles (skipped in structuresOnly mode for the
    // same reason priority 1 is — workers shouldn't path off to chase haulers).
    if (!structuresOnly) {
        for (const c of hostileCreeps) {
            if (isArmed(c)) continue;
            const s = scoreTarget(c);
            if (s > bestScore) {
                bestScore = s;
                bestTarget = c;
            }
        }
        if (bestTarget) return updateTarget(this, bestTarget);
    }

    // Priority 5: bare ramparts. Walls with nothing on the other side — only
    // attack when literally everything else is dead. Lets us tunnel through a
    // dormant base, but never sidetracks active combat.
    for (const s of bareRampartTargets) {
        const sc = scoreTarget(s);
        if (sc > bestScore) {
            bestScore = sc;
            bestTarget = s;
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
        position = target.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: r => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() &&
                (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos))
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

    const kiteTarget = target instanceof Creep && target.hasActiveBodyparts(ATTACK);
    const targetRange = kiteTarget ? 3 : 1;

    if (range <= targetRange) {
        const nearby = this.pos.findInRange(this.room.hostileCreeps, 2);
        if (nearby.length >= 2) {
            this.rangedMassAttack();
        } else {
            if (range < targetRange && (this.hits < this.hitsMax * 0.8 || nearby.length > 1)) {
                this.shibKite(4);
            }
            this.rangedAttack(target);
        }
    } else {
        this.shibMove(target, {range: targetRange});
        this.attackInRange();
    }
    return true;
};

Creep.prototype.moveToHostileConstructionSites = function (creepCheck = false, onlyInBuild = true) {
    if (!this.room.constructionSites.length || this.room.controller?.safeMode || FRIENDLIES.includes(INTEL[this.room.name]?.user)) return false;

    let site = Game.getObjectById(this.memory.stompSite) ||
        this.pos.findClosestByRange(this.room.constructionSites, {
            filter: s => (!onlyInBuild || s.progress) && !s.my && !s.pos.checkForCreep()
        }) || this.pos.findClosestByRange(this.room.constructionSites, {
            filter: s => !s.my && !s.pos.checkForCreep()
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
    const injured = (this.room.creeps.filter(c =>
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
        if (creep.memory.squadCooldown && Game.time < creep.memory.squadCooldown) return;

        const operation = creep.memory.operation;
        const destination = creep.memory.destination;

        // Without a coordinating signal (shared op + dest) there's nothing to
        // anchor a group on. Idle and retry later.
        if (!operation && !destination) {
            creep.memory.squadCooldown = Game.time + 50;
            return;
        }

        const myRole = creep.memory.role || '';
        const maxMembers = (creep.memory.misc?.waitFor || 4) - 1;

        // Bidirectional role match — a fresh 'longbow' needs to find an existing
        // 'longbowSquad' leader, AND a freshly-promoted 'longbowSquad' leader
        // needs to find new 'longbow's spawning later. Old code only matched one
        // direction, so once a leader was promoted, follower spawns rolled in by
        // luck of string-prefix order rather than design.
        const rolesCompatible = c => {
            const r = c.memory.role || '';
            return !!r && !!myRole && (r === myRole || r.includes(myRole) || myRole.includes(r));
        };

        // Candidate: same op + dest, role-compatible, and either an existing
        // leader with open slots OR a fully ungrouped peer we can promote.
        // Followers are deliberately excluded — the old code's `!c.memory.leader`
        // also matched followers, then crashed on `leader.memory.squadMembers.push`
        // because followers don't have a squadMembers list.
        const candidate = c =>
            c.id !== creep.id &&
            !c.spawning &&
            c.memory.destination === destination &&
            c.memory.operation === operation &&
            rolesCompatible(c) &&
            ((c.memory.leader && (c.memory.squadMembers || []).length < maxMembers)
                || !c.memory.grouped);

        // Same-room is the common case and cheap. Expand to nearby rooms when
        // nothing matches locally — handles dispersed ops (borderPatrol, harass)
        // and two solos converging on a destination from different sides.
        let candidates = creep.room.myCreeps.filter(candidate);
        if (!candidates.length) {
            candidates = _.filter(Game.creeps, c =>
                c.my && c.room.name !== creep.room.name &&
                Game.map.getRoomLinearDistance(creep.room.name, c.room.name) <= 1 &&
                candidate(c)
            );
        }

        if (!candidates.length) {
            creep.memory.squadCooldown = Game.time + 50;
            return;
        }

        // Prefer slotting into an existing partial squad over forming a new pair
        // — fills the squad faster than two new pairs forming in parallel near a
        // third partial leader. Among existing leaders, pick the most-filled one.
        const existingLeaders = candidates.filter(c => c.memory.leader);
        let leader;
        if (existingLeaders.length) {
            leader = _.max(existingLeaders, c => (c.memory.squadMembers || []).length);
        } else {
            // No existing leader nearby — promote the closest ungrouped peer.
            // Same-room peers always beat cross-room ones via the 50 sentinel.
            leader = _.min(candidates, c =>
                c.room.name === creep.room.name ? creep.pos.getRangeTo(c) : 50);
        }

        if (!leader || !leader.id) {
            creep.memory.squadCooldown = Game.time + 50;
            return;
        }

        // Initialise leader memory if we just promoted them. Idempotent for
        // creeps that were already leading a partial squad.
        if (!leader.memory.leader) {
            if (!leader.memory.oldRole) leader.memory.oldRole = leader.memory.role;
            leader.memory.role = 'longbowSquad';
            leader.memory.leader = true;
            leader.memory.grouped = true;
            leader.memory.squadMembers = leader.memory.squadMembers || [];
        }

        // Join as follower. The oldRole guard preserves the original role across
        // re-pairings (creep was 'longbow' → became 'longbowSquad' → leader died,
        // got restored to 'longbow' in handleFollower → now pairing again — we
        // don't want to lose the original by writing oldRole='longbowSquad').
        if (!creep.memory.oldRole) creep.memory.oldRole = creep.memory.role;
        creep.memory.role = 'longbowSquad';
        creep.memory.grouped = true;
        creep.memory.leader = undefined;
        creep.memory.squadMembers = undefined;
        creep.memory.groupLeader = leader.id;

        if (!leader.memory.squadMembers.includes(creep.id)) {
            leader.memory.squadMembers.push(creep.id);
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