function structOwner(s) {
    if (s && typeof s.safeOwnerName === 'function') return s.safeOwnerName();
    try {
        return s.owner && s.owner.username;
    } catch (e) {
        return undefined;
    }
}

function structMy(s) {
    if (s && typeof s.safeIsMy === 'function') return s.safeIsMy();
    try {
        return !!s.my;
    } catch (e) {
        return false;
    }
}

function structActive(s) {
    try {
        return s.isActive();
    } catch (e) {
        return false;
    }
}

function isFriendlyCombatRoom(room) {
    if (!room) return false;
    if (MY_ROOMS.includes(room.name)) return true;
    if (room.controller?.my) return true;
    if (room.user && FRIENDLIES.includes(room.user)) return true;
    const intel = INTEL[room.name];
    if (!intel) return false;
    if (intel.owner && FRIENDLIES.includes(intel.owner)) return true;
    if (intel.user && FRIENDLIES.includes(intel.user)) return true;
    return false;
}

function roomHasInvaderThreat(room) {
    if (!room) return false;
    const intel = INTEL[room.name];
    if (intel?.invaderCore && intel.invaderCore > Game.time) return true;
    if (room.hostileCreeps.some(c => c.owner?.username === 'Invader')) return true;
    return room.structures.some(s =>
        s.structureType === STRUCTURE_INVADER_CORE || structOwner(s) === 'Invader'
    );
}

function roomHasResolvableCombatThreat(room) {
    if (!room) return false;
    if (room.hostileCreeps.length) return true;
    if (roomHasInvaderThreat(room)) return true;
    return room.impassibleStructures.some(s =>
        s.structureType === STRUCTURE_TOWER && isStructureCombatHostile(s) && structActive(s)
    );
}

function isStrongholdRoom(room) {
    if (!room) return false;
    if (roomHasInvaderThreat(room)) return true;
    const intel = INTEL[room.name];
    return !!(intel?.sk && intel.towers);
}

function friendlyRoomBlocksCombat(room) {
    return isFriendlyCombatRoom(room) && !roomHasInvaderThreat(room);
}

function isStructureCombatHostile(structure) {
    if (!structure || !(structure instanceof Structure)) return false;
    if (structMy(structure)) return false;
    const room = structure.room || Game.rooms[structure.pos.roomName];
    const owner = structOwner(structure);

    // Invader structures are hostile even inside our reserved remotes and owned rooms.
    if (structure.structureType === STRUCTURE_INVADER_CORE) return !!room;
    if (owner === 'Invader') return !!room;

    if (room && isFriendlyCombatRoom(room)) return false;

    if (!owner || owner === MY_USERNAME) {
        // Stronghold perimeter ramparts are often ownerless but still block the core.
        if (structure.structureType === STRUCTURE_RAMPART && isStrongholdRoom(room)) return true;
        return false;
    }
    if (FRIENDLIES.includes(owner)) return false;
    return true;
}

function allyAttackersOn(room, target) {
    if (!room || !target) return 0;
    if (room._allyAtkTick !== Game.time) {
        const map = Object.create(null);
        const mine = room.myCreeps;
        for (let i = 0; i < mine.length; i++) {
            const c = mine[i];
            const id = c.memory && c.memory.target;
            if (!id) continue;
            if (!map[id]) map[id] = [];
            map[id].push(c);
        }
        room._allyAtk = map;
        room._allyAtkTick = Game.time;
    }
    const list = room._allyAtk[target.id];
    if (!list || !list.length) return 0;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
        if (list[i].pos.getRangeTo(target) <= 5) n++;
    }
    return n;
}

function combatTargetDebug(creep, message) {
    if (!Memory.combatTargetDebug) return;
    if (!creep.memory._combatDbgTick || creep.memory._combatDbgTick + 10 <= Game.time) {
        creep.memory._combatDbgTick = Game.time;
        log.w(message, `COMBAT DBG ${creep.name}:`);
    }
}

function isValidHostileTarget(target) {
    if (!target) return false;
    if (target instanceof Creep) {
        if (target.my) return false;
        const owner = target.owner && target.owner.username;
        if (owner === MY_USERNAME) return false;
        return !owner || !FRIENDLIES.includes(owner);
    }
    if (target instanceof Structure) {
        return isStructureCombatHostile(target);
    }
    return true;
}

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
    STRUCTURE_FACTORY,
    STRUCTURE_INVADER_CORE,
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
        if (this.memory.target !== hostile.id) this.memory.target = hostile.id;
    } else if (this.memory.target !== undefined) {
        this.memory.target = undefined;
    }
    if (this.memory.targetPos !== undefined) this.memory.targetPos = undefined;

    if (hostile?.pos.checkForRampart()) {
        const rampart = hostile.pos.checkForRampart();
        if (rampart && isValidHostileTarget(rampart)) {
            hostile = rampart;
            this.memory.target = hostile.id;
        }
    }

    if (hostile && !isValidHostileTarget(hostile)) {
        hostile = undefined;
        if (this.memory.target !== undefined) this.memory.target = undefined;
    }

    if (hostile && combatAction(this, hostile, rampart)) {
        combatTargetDebug(this, `attacking ${hostile.structureType || hostile.name} @${hostile.pos.x},${hostile.pos.y}`);
        return true;
    }

    const movedToSites = this.moveToHostileConstructionSites();
    if (!hostile && !movedToSites && Memory.combatTargetDebug) {
        const cores = this.room.structures.filter(s => s.structureType === STRUCTURE_INVADER_CORE);
        const invaderStructs = this.room.structures.filter(s => structOwner(s) === 'Invader').length;
        combatTargetDebug(this,
            `${this.room.name} no target | dest=${this.memory.destination || 'none'} friendly=${isFriendlyCombatRoom(this.room)} invaderThreat=${roomHasInvaderThreat(this.room)} ` +
            `hostileCreeps=${this.room.hostileCreeps.length} cores=${cores.length} invaderStructs=${invaderStructs} ` +
            `cachedHostileStructs=${(this._hostileStructures || []).length} coreHostile=${cores[0] ? isStructureCombatHostile(cores[0]) : 'n/a'}`
        );
    }
    return movedToSites;

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
    const inRange = c => !guardLocation || c.pos.getRangeTo(guardLocation) <= guardRange;
    const onBorder = pos => pos.x <= 0 || pos.x >= 49 || pos.y <= 0 || pos.y >= 49;

    const hostileCacheKey = [
        Game.time,
        structuresOnly ? 1 : 0,
        ignoreBorder ? 1 : 0,
        guardLocation ? `${guardLocation.x},${guardLocation.y},${guardLocation.roomName}` : '',
        guardRange,
    ].join(':');

    // === TICK CACHE for hostiles (big CPU win) ===
    // Split hostile creeps by rampart cover at cache time so we only pay
    // checkForRampart once per hostile per tick. The two lists feed the
    // priority chain below — direct hostiles first, then structures, then
    // the ramparts protecting any hostiles we couldn't otherwise reach.
    if (this._hostileCache_key !== hostileCacheKey) {
        this._directHostileCreeps = [];
        this._rampartedHostileCreeps = [];
        for (const c of this.room.hostileCreeps) {
            if (!inRange(c)) continue;
            if (c.pos.checkForRampart()) this._rampartedHostileCreeps.push(c);
            else this._directHostileCreeps.push(c);
        }
        this._hostileStructures = this.room.impassibleStructures.filter(s =>
            isStructureCombatHostile(s) &&
            inRange(s) &&
            ![STRUCTURE_KEEPER_LAIR, STRUCTURE_CONTROLLER, STRUCTURE_POWER_BANK].includes(s.structureType)
        );
        this._hostileCache_key = hostileCacheKey;
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
        if (oldTarget instanceof Structure && isValidHostileTarget(oldTarget) && !armedHostile && Math.random() > 0.75) {
            return oldTarget;
        }
        this.memory.target = undefined;
    }

    if (!hostileCreeps.length && !hostileStructures.length && !rampartedHostiles.length) return undefined;

    // === SCORING SYSTEM (makes combat much deadlier) ===
    const scoreTarget = (target) => {
        let score = 0;
        const range = this.pos.getRangeTo(target);

        if (target instanceof Creep) {
            const ap = abilityPower(target.body);
            // Healers
            if (ap.effectiveHeal > 0) score += 1000;
            // Ranged attackers next
            if (target.hasActiveBodyparts(RANGED_ATTACK)) score += 800;
            // Melee
            if (target.hasActiveBodyparts(ATTACK)) score += 600;
            // Work creeps
            if (target.hasActiveBodyparts(WORK)) score += 200;

            // Focus fire bonus: prefer targets already being attacked by allies
            const allies = allyAttackersOn(this.room, target);
            if (allies) score += allies * 150;
        } else {
            // Structures
            if (target.structureType === STRUCTURE_INVADER_CORE) score += 950;
            else if (target.structureType === STRUCTURE_TOWER) score += 900;
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
        if (!s.isActive() && s.structureType !== STRUCTURE_INVADER_CORE) continue;
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
            if (isArmed(c) || (ignoreBorder && onBorder(c.pos))) continue;
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

    return bestTarget && isValidHostileTarget(bestTarget) ? updateTarget(this, bestTarget) : undefined;

    function updateTarget(creep, target) {
        if (includeRampart && target.pos.checkForRampart()) target = target.pos.checkForRampart();
        creep.memory.target = target.id;
        return target;
    }
};

Creep.prototype.attackHostile = function (hostile) {
    if (!hostile || !isValidHostileTarget(hostile)) return false;

    const range = this.pos.getRangeTo(hostile);
    const lastRange = this.memory.lastRange || range;
    this.memory.lastRange = range;

    let moveTarget = hostile;

    const rampartCover = this.pos.findClosestByPath(this.room.ramparts, {
        filter: r => structMy(r) && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() &&
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
    if (!target || !isValidHostileTarget(target) || !target.pos || !(this.hasActiveBodyparts(ATTACK) || this.hasActiveBodyparts(RANGED_ATTACK))) return false;

    const range = this.hasActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
    const rampartFilter = r => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() &&
        (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos));
    let ramparts = global.posMyStructuresInRange
        ? global.posMyStructuresInRange(target.pos, range, {filter: rampartFilter})
        : target.pos.findInRange(FIND_MY_STRUCTURES, range, {filter: rampartFilter});

    let position = this.pos.findClosestByPath(ramparts);

    if (!position) {
        const allRamparts = global.roomMyStructures
            ? global.roomMyStructures(this.room, {filter: rampartFilter})
            : this.room.find(FIND_MY_STRUCTURES, {filter: rampartFilter});
        position = target.pos.findClosestByPath(allRamparts);
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
    if (!target || !isValidHostileTarget(target) || !this.hasActiveBodyparts(RANGED_ATTACK)) return false;

    const range = this.pos.getRangeTo(target);

    if (MY_ROOMS.includes(this.room.name)) {
        const rampartCoverFilter = r => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() &&
            r.pos.getRangeTo(target) <= 3 && (!r.pos.checkForCreep() || r.pos.isEqualTo(this.pos));
        const rampartCandidates = global.roomMyStructures
            ? global.roomMyStructures(this.room, {filter: rampartCoverFilter})
            : this.room.find(FIND_MY_STRUCTURES, {filter: rampartCoverFilter});
        const rampartCover = this.pos.findClosestByPath(rampartCandidates);
        if (rampartCover) {
            if (!this.pos.isEqualTo(rampartCover)) this.shibMove(rampartCover, {range: 0});
            this.rangedAttack(target);
            return true;
        }
    }

    if (!MY_ROOMS.includes(this.room.name)) {
        const dangerTower = this.room.impassibleStructures.find(s =>
            s.structureType === STRUCTURE_TOWER && isStructureCombatHostile(s) &&
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

Creep.prototype.moveToHostileConstructionSites = function (onlyInBuild = true) {
    if (!this.room.constructionSites.length || this.room.controller?.safeMode || friendlyRoomBlocksCombat(this.room)) return false;

    let site = Game.getObjectById(this.memory.stompSite) ||
        this.pos.findClosestByRange(this.room.constructionSites, {
            filter: s => (!onlyInBuild || s.progress) && !structMy(s) && !s.pos.checkForCreep()
        }) || this.pos.findClosestByRange(this.room.constructionSites, {
            filter: s => !structMy(s) && !s.pos.checkForCreep()
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
    if (this.room.controller?.safeMode || friendlyRoomBlocksCombat(this.room)) return false;

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
    if (!this.hasActiveBodyparts(RANGED_ATTACK)) return false;

    const target = Game.getObjectById(this.memory.target);
    if (target && target.pos && target.pos.roomName === this.pos.roomName && this.pos.inRangeTo(target, 3)) {
        this.rangedAttack(target);
        return true;
    }
    if (!this.room.hostileCreeps.length && !this.room.hostileStructures.length) return false;

    let hostile = Game.getObjectById(this.memory.opportunityAttack);
    if (!hostile || !isValidHostileTarget(hostile) || !hostile.pos.inRangeTo(this, 3) || hostile.pos.roomName !== this.room.name) {
        this.memory.opportunityAttack = undefined;
        const candidates = this.room.hostileCreeps.concat(this.room.hostileStructures);
        if (!friendlyRoomBlocksCombat(this.room)) {
            for (const s of this.room.structures) {
                if (isValidHostileTarget(s) && !candidates.includes(s)) candidates.push(s);
            }
        }
        hostile = this.pos.findFirstInRange(candidates, 3);
    }

    if (hostile && isValidHostileTarget(hostile)) {
        this.memory.opportunityAttack = hostile.id;
        this.rangedAttack(hostile);
        return true;
    }
    return false;
};

Creep.prototype.healInRange = function (blinky = false) {
    if (!this.hasActiveBodyparts(HEAL)) return false;

    const injured = this.room.creeps.filter(c =>
        c.owner && (FRIENDLIES.includes(c.owner.username) || c.my) && c.hits < c.hitsMax && this.pos.getRangeTo(c) <= 3
    );

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
    if (this.room.name === this.memory.colony || !roomHasResolvableCombatThreat(this.room)) return true;
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
            s.structureType === STRUCTURE_TOWER && isStructureCombatHostile(s) &&
            structActive(s) && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST
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

        const towers = global.roomMyStructures
            ? global.roomMyStructures(creep.room, {filter: {structureType: STRUCTURE_TOWER}})
            : creep.room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}});
        power += towers.reduce((sum, t) => (t.pos.getRangeTo(creep) <= range && t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST)
            ? sum + determineTowerDamage(t.pos.getRangeTo(creep)) : sum, 0);

        return power;
    }
};

// Hold on the exit toward `towardRoom` (or the nearest exit). Used when a duo
// leader is in a threatened dest without the partner — 25,25 is the bunker.
Creep.prototype.moveToRoomExit = function (towardRoom) {
    let tile;
    if (towardRoom && towardRoom !== this.pos.roomName) {
        const dir = this.room.findExitTo(towardRoom);
        if (dir > 0) tile = this.pos.findClosestByRange(dir);
    }
    if (!tile) tile = this.pos.findClosestByRange(FIND_EXIT);
    if (!tile) return false;
    if (this.pos.getRangeTo(tile) <= 1) return true;
    this.shibMove(tile, {range: 0, forceSolo: true});
    return true;
};

Creep.prototype.findDefensivePosition = function (target) {
    if (target) return this.fightFromRampart(target);

    const rampart = getAssignedRampart(this);
    if (rampart) {
        if (!this.memory.other) this.memory.other = {};
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

// Forming waitFor squads still merge in the colony. Once a wave commits
// (boosted and left home) it never takes joiners — replacements are a new group.
const SQUAD_RECRUIT_TTL = 600;

function isCommittedSquad(creep) {
    if (!creep || !creep.memory) return false;
    if (creep.memory.initialFormUp) return true;
    return !!(creep.memory.misc && creep.memory.misc.sealed);
}

function formColonyOf(creep) {
    if (!creep || !creep.memory) return undefined;
    return (creep.memory.misc && creep.memory.misc.formColony) || creep.memory.colony;
}

function defaultWaitFor(creep) {
    const w = creep && creep.memory && creep.memory.misc && creep.memory.misc.waitFor;
    if (w > 0) return w;
    const role = (creep && creep.memory && (creep.memory.oldRole || creep.memory.role)) || '';
    return role === 'longbowSquad' ? 2 : 1;
}

// WaitFor-less / waitFor-1 are one bucket. Waves (2/4) only group with equal size,
// so a leftover solo or duo cannot lead a waitFor-4 and skip holdForWave.
function waitForCompatible(a, b) {
    const wa = defaultWaitFor(a);
    const wb = defaultWaitFor(b);
    const aWave = wa > 1;
    const bWave = wb > 1;
    if (aWave !== bWave) return false;
    if (!aWave) return true;
    return wa === wb;
}

function ungroupCreep(creep) {
    if (!creep || !creep.memory) return;
    creep.memory.leader = undefined;
    creep.memory.grouped = undefined;
    creep.memory.groupLeader = undefined;
    creep.memory.squadMembers = undefined;
    creep.memory.squadListed = undefined;
    if (creep.memory.oldRole) {
        creep.memory.role = creep.memory.oldRole;
        creep.memory.oldRole = undefined;
    }
}

Creep.prototype.ungroupFromSquad = function () {
    ungroupCreep(this);
    if (this.releaseBoostLabs) this.releaseBoostLabs();
};

function formingAtHome(creep) {
    if (!creep || isCommittedSquad(creep)) return false;
    const home = formColonyOf(creep);
    return !!(home && creep.room.name === home);
}

function sameFormColony(a, b) {
    const wait = (a.memory.misc && a.memory.misc.waitFor) || 0;
    if (!(wait > 1)) return true;
    const ca = formColonyOf(a);
    const cb = formColonyOf(b);
    if (!ca || !cb) return true;
    return ca === cb;
}

function squadMinTTL(leader) {
    if (!leader) return 0;
    let min = leader.spawning ? Infinity : (leader.ticksToLive || Infinity);
    for (const id of leader.memory.squadMembers || []) {
        const m = Game.getObjectById(id);
        if (!m) continue;
        const t = m.spawning ? Infinity : (m.ticksToLive || Infinity);
        if (t < min) min = t;
    }
    return min;
}

function leaderHasOpenSlot(leader, joinerWaitFor) {
    if (!leader || !leader.memory.leader || isCommittedSquad(leader)) return false;
    const theirWait = defaultWaitFor(leader);
    if (joinerWaitFor && joinerWaitFor !== theirWait) return false;
    const live = (leader.memory.squadMembers || []).length + 1;
    if (live >= theirWait) return false;
    if (live >= (joinerWaitFor || theirWait)) return false;
    // Forming at home must still take joiners; TTL only blocks remnants in the field.
    if (!formingAtHome(leader) && squadMinTTL(leader) < SQUAD_RECRUIT_TTL) return false;
    return true;
}

function absorbSquad(winner, loser, waitFor) {
    if (!winner || !loser || winner.id === loser.id || !loser.memory.leader) return;
    if (!winner.memory.squadMembers) winner.memory.squadMembers = [];

    const attach = (creep) => {
        if (!creep || creep.id === winner.id) return false;
        if (winner.memory.squadMembers.length + 1 >= waitFor) return false;
        if (winner.memory.squadMembers.includes(creep.id)) return false;
        creep.memory.leader = undefined;
        creep.memory.squadMembers = undefined;
        creep.memory.grouped = true;
        creep.memory.groupLeader = winner.id;
        creep.memory.squadListed = undefined;
        creep.memory.role = 'longbowSquad';
        winner.memory.squadMembers.push(creep.id);
        return true;
    };

    const memberIds = (loser.memory.squadMembers || []).slice();
    for (let i = 0; i < memberIds.length; i++) {
        if (!attach(Game.getObjectById(memberIds[i]))) break;
    }
    attach(loser);

    if (!loser.memory.leader) return;
    const remaining = (loser.memory.squadMembers || []).filter(id => {
        const c = Game.getObjectById(id);
        return c && c.memory.groupLeader === loser.id;
    });
    for (let i = 0; i < remaining.length; i++) {
        ungroupCreep(Game.getObjectById(remaining[i]));
    }
    ungroupCreep(loser);
}

function disbandEmptyLeader(leader) {
    if (!leader || !leader.memory.leader || isCommittedSquad(leader)) return false;
    const live = [];
    for (const id of leader.memory.squadMembers || []) {
        if (Game.getObjectById(id)) live.push(id);
    }
    if (live.length) {
        if (live.length !== (leader.memory.squadMembers || []).length) {
            leader.memory.squadMembers = live;
        }
        return false;
    }
    ungroupCreep(leader);
    return true;
}

// Two incomplete waitFor-4 pairs never re-enter findGroup (already grouped),
// so they camp the dest exit forever. Nearby partial leaders combine here;
// both sides pick the same winner (size, then name) so they do not swap.
function tryMergePartialSquads(leader) {
    const waitFor = defaultWaitFor(leader);
    if (waitFor <= 2) return;
    if ((leader.memory.squadMembers || []).length + 1 >= waitFor) return;

    const dest = leader.memory.destination;
    const op = leader.memory.operation;
    if (!dest && !op) return;

    const isNearbyLeader = (c) => {
        if (!c || c.id === leader.id || !c.my || !c.memory.leader) return false;
        if (c.memory.destination !== dest || c.memory.operation !== op) return false;
        if (isCommittedSquad(c) || isCommittedSquad(leader)) return false;
        if (!sameFormColony(leader, c)) return false;
        const theirWait = defaultWaitFor(c);
        if (theirWait !== waitFor) return false;
        if (theirWait <= 2) return false;
        // Uncommitted same-wave pairs merge even below SQUAD_RECRUIT_TTL.
        if (!formingAtHome(c) && squadMinTTL(c) < SQUAD_RECRUIT_TTL) return false;
        if (!formingAtHome(leader) && squadMinTTL(leader) < SQUAD_RECRUIT_TTL) return false;
        return (c.memory.squadMembers || []).length + 1 < theirWait;
    };

    let others = leader.room.myCreeps.filter(isNearbyLeader);
    if (!others.length) {
        const pool = (global.world && global.world.militaryCreeps) || Game.creeps;
        const list = Array.isArray(pool) ? pool : Object.values(pool);
        others = list.filter(c =>
            isNearbyLeader(c) &&
            c.room.name !== leader.room.name &&
            Game.map.getRoomLinearDistance(leader.room.name, c.room.name) <= 1
        );
    }
    if (!others.length) return;

    const winner = others.concat(leader).reduce((best, c) => {
        const sb = (best.memory.squadMembers || []).length;
        const sc = (c.memory.squadMembers || []).length;
        if (sc !== sb) return sc > sb ? c : best;
        return c.name < best.name ? c : best;
    });

    if (winner.id !== leader.id) {
        absorbSquad(winner, leader, defaultWaitFor(winner) || waitFor);
        return;
    }
    for (let i = 0; i < others.length; i++) {
        absorbSquad(leader, others[i], waitFor);
        if ((leader.memory.squadMembers || []).length + 1 >= waitFor) break;
    }
}

Creep.prototype.formSquad = function () {
    if (this.spawning) return;
    if (this.memory.leader) disbandEmptyLeader(this);
    if (!this.memory.grouped) findGroup(this);
    else if (this.memory.leader) tryMergePartialSquads(this);
    else if (this.memory.grouped && !this.memory.leader) {
        const leader = Game.getObjectById(this.memory.groupLeader);
        if (!leader) this.ungroupFromSquad();
    }

    function findGroup(creep) {
        if (creep.memory.squadCooldown && Game.time < creep.memory.squadCooldown) return;
        // Committed remnants never re-pair with a fresh wave.
        if (isCommittedSquad(creep)) return;

        const operation = creep.memory.operation;
        const waitFor = creep.memory.misc && creep.memory.misc.waitFor;
        if (!(waitFor > 1) && (operation === 'roomDenial' || operation === 'stronghold')) return;
        const destination = creep.memory.destination;

        // Without a coordinating signal (shared op + dest) there's nothing to
        // anchor a group on. Idle and retry later.
        if (!operation && !destination) {
            creep.memory.squadCooldown = Game.time + 50;
            return;
        }

        const myRole = creep.memory.role || '';
        const maxMembers = Math.max(0, defaultWaitFor(creep) - 1);

        const isLongbowFamily = (role) => role === 'longbow' || role === 'longbowSquad';
        const rolesCompatible = c => {
            const r = c.memory.role || '';
            const old = c.memory.oldRole || '';
            const myOld = creep.memory.oldRole || '';
            return (isLongbowFamily(r) || isLongbowFamily(old))
                && (isLongbowFamily(myRole) || isLongbowFamily(myOld));
        };

        // Candidate: same op + dest, role-compatible, and either an existing
        // leader with open slots OR a fully ungrouped peer we can promote.
        // Followers are deliberately excluded — the old code's `!c.memory.leader`
        // also matched followers, then crashed on `leader.memory.squadMembers.push`
        // because followers don't have a squadMembers list.
        const candidate = c =>
            c.id !== creep.id &&
            !c.spawning &&
            !isCommittedSquad(c) &&
            waitForCompatible(creep, c) &&
            sameFormColony(creep, c) &&
            c.memory.destination === destination &&
            c.memory.operation === operation &&
            rolesCompatible(c) &&
            ((c.memory.leader && leaderHasOpenSlot(c, maxMembers + 1))
                || !c.memory.grouped);

        // Same-room is the common case and cheap. Expand to nearby rooms when
        // nothing matches locally — handles dispersed ops (borderPatrol, harass)
        // and two solos converging on a destination from different sides.
        let candidates = creep.room.myCreeps.filter(candidate);
        if (!candidates.length) {
            const pool = (global.world && global.world.militaryCreeps) || Game.creeps;
            const list = Array.isArray(pool) ? pool : Object.values(pool);
            candidates = list.filter(c =>
                c.my && c.room.name !== creep.room.name &&
                Game.map.getRoomLinearDistance(creep.room.name, c.room.name) <= 1 &&
                candidate(c)
            );
        }

        if (!candidates.length) {
            const waitFor = creep.memory.misc && creep.memory.misc.waitFor;
            creep.memory.squadCooldown = Game.time + ((waitFor > 1) ? 1 : 50);
            return;
        }

        // Prefer slotting into an existing partial squad over forming a new pair
        // — fills the squad faster than two new pairs forming in parallel near a
        // third partial leader. Among existing leaders, pick the most-filled one.
        const existingLeaders = candidates.filter(c => c.memory.leader);
        let leader;
        if (existingLeaders.length) {
            // Prefer a long-lived, already-filling quad over a dying remnant
            // that happens to have more bodies this tick.
            leader = existingLeaders.reduce((best, c) => {
                // At home, match tryMerge (size then name) so joiners and
                // partial leaders pick the same winner. In the field, prefer TTL.
                if (!(formingAtHome(c) && formingAtHome(best))) {
                    const tc = squadMinTTL(c);
                    const tb = squadMinTTL(best);
                    if (tc !== tb) return tc > tb ? c : best;
                }
                const sc = (c.memory.squadMembers || []).length;
                const sb = (best.memory.squadMembers || []).length;
                if (sc !== sb) return sc > sb ? c : best;
                return c.name < best.name ? c : best;
            });
        } else {
            // No existing leader nearby — pair with the closest ungrouped peer.
            // Same-room peers always beat cross-room ones via the 50 sentinel.
            const peer = _.min(candidates, c =>
                c.room.name === creep.room.name ? creep.pos.getRangeTo(c) : 50);
            if (!peer || !peer.id) {
                creep.memory.squadCooldown = Game.time + 50;
                return;
            }
            // Lower name is always leader so both creeps agree regardless of
            // who runs findGroup first this tick.
            if (creep.name < peer.name) {
                if (!creep.memory.oldRole) creep.memory.oldRole = creep.memory.role;
                creep.memory.role = 'longbowSquad';
                creep.memory.leader = true;
                creep.memory.grouped = true;
                creep.memory.squadMembers = creep.memory.squadMembers || [];
                return;
            }
            leader = peer;
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

function getAssignedRampart(creep, target = undefined) {
    const range = creep.hasActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
    let position = creep.memory.assignedRampart ? Game.getObjectById(creep.memory.assignedRampart) : null;

    if (target || !position) {
        if (target) delete creep.memory.assignedRampart;

        const filter = r => structMy(r) && r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() &&
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