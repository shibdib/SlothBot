/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const towers = require('module.towerController');
const {addToMad} = require('hcNukes');
const {getFlowContext} = require('spawnFlow');
const ROOM_STATE_CACHE = {};
const PLAYER_HOSTILE_PARTS = [ATTACK, RANGED_ATTACK, WORK, CLAIM];

// Re-send an "ongoing attack" reminder at most this often (~3 hours real time)
const ALERT_REMINDER_TICKS = CREEP_LIFE_TIME * 2;
// Email grouping window passed to Game.notify (minutes)
const ALERT_GROUP_MINUTES = 30;
// Only email once a situation is actually dangerous (matches all-clear threshold)
const NOTIFY_MIN_THREAT = 3;
const NOTIFY_CRITICAL_RANGE = 10;
const NOTIFY_MIN_COMBAT_POWER = 25;
const NOTIFY_MAJOR_COMBAT_POWER = 100;
const NOTIFY_COMBAT_PARTS = [ATTACK, RANGED_ATTACK, HEAL, WORK];
const NOTIFY_CRITICAL_STRUCTURES = [
    STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER,
];
const SAFEMODE_TIER1_STRUCTURES = [
    STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN,
];
const SAFEMODE_CRISIS_MIN_URGENCY = 50;
const SAFEMODE_MIN_RESERVE = 1;
const SAFEMODE_TOWER_POWER_ESTIMATE = 600;
// track attackstate for each room
const ALERT_STATE_TRACKING = {};

class DefenseManager {
    constructor(room) {
        this.room = room;
    }

    run() {
        if (Game.time % 1000 === 0) this._pruneRoomStateCache();

        towers.towerController(this.room);
        this.room.invaderCheck();

        const intel = INTEL[this.room.name];
        const armedHostiles = this.room.hostileCreeps.filter(c =>
            PLAYER_HOSTILE_PARTS.some(p => c.hasActiveBodyparts(p))
        );
        const playerArmed = armedHostiles.filter(c => c.owner && c.owner.username !== 'Invader');
        const underAttack = armedHostiles.length > 0;

        // towerController used to set this — labTech, shuttle, terminal, and spawn still read it
        if (underAttack) {
            ALERT_STATE_TRACKING[this.room.name] = Game.time;
            this.room.memory.dangerousAttack = true;
            this.alertHostileAttack();
            if (playerArmed.length) {
                this.safeModeManager();
                if (intel) intel.requestingSupport = true;
            }
        } else {
            // Clear attack state immediately so economy/military response logic (e.g. guard spawns)
            // stops treating the room as threatened once hostiles are gone. Notification timing
            // (reminders + all-clear) is handled separately via ALERT_STATE_TRACKING / _defenseAlerts.
            this.room.memory.dangerousAttack = undefined;
            if (intel) intel.requestingSupport = undefined;
            if (!ALERT_STATE_TRACKING[this.room.name] || Game.time - ALERT_STATE_TRACKING[this.room.name] > ALERT_REMINDER_TICKS) {
                clearHostileAlert(this.room);
                delete ALERT_STATE_TRACKING[this.room.name];
            }
            delete this.room.memory.safeModeDeferred;
        }

        if (!Memory._rampartsSet || RAMPART_ACCESS) this.rampartManager();

        if (Game.time % 100 === 0) this.handleNukeAttack();

        this.room.memory.earlyWarning = _.some(
            Object.values(Game.map.describeExits(this.room.name)),
            roomName => INTEL[roomName] && INTEL[roomName].threatLevel > 4
        );
    }

    _pruneRoomStateCache() {
        for (const name of Object.keys(ROOM_STATE_CACHE)) {
            if (!Game.rooms[name]) delete ROOM_STATE_CACHE[name];
        }
    }

    rampartManager() {
        const roomName = this.room.name;
        const currentTick = Game.time;

        // Cache room state once per tick
        if (!ROOM_STATE_CACHE[roomName] || ROOM_STATE_CACHE[roomName].tick !== currentTick) {
            const allies = this.room.creeps.filter(c =>
                c.owner && _.includes(FRIENDLIES, c.owner.username) && !c.my
            );
            ROOM_STATE_CACHE[roomName] = {
                ramparts: this.room.ramparts,
                allies,
                hostileCreeps: this.room.hostileCreeps,
                tick: currentTick
            };
        }

        const state = ROOM_STATE_CACHE[roomName];

        if (!RAMPART_ACCESS) {
            Memory._rampartsSet = true;
            for (let rampart of state.ramparts) {
                if (rampart.isPublic) rampart.setPublic(false);
            }
            return;
        }

        Memory._rampartsSet = undefined;

        if (!state.hostileCreeps.length) {
            for (let rampart of state.ramparts) {
                if (!rampart.isPublic) rampart.setPublic(true);
            }
            return;
        }

        if (state.allies.length) {
            for (let rampart of state.ramparts) {
                if (rampart.isPublic) {
                    const closestHostile = rampart.pos.findClosestByRange(state.hostileCreeps);
                    if (closestHostile && rampart.pos.getRangeTo(closestHostile) <= 1) {
                        rampart.setPublic(false);
                    }
                } else {
                    const closestHostile = rampart.pos.findClosestByRange(state.hostileCreeps);
                    if (closestHostile && rampart.pos.getRangeTo(closestHostile) > 1) {
                        rampart.setPublic(true);
                    }
                }
            }
        } else if (state.hostileCreeps.length) {
            for (let rampart of state.ramparts) {
                if (rampart.isPublic) rampart.setPublic(false);
            }
        }

        for (let rampart of state.ramparts) {
            if (rampart.isPublic && rampart.pos.checkForObstacleStructure()) {
                rampart.setPublic(false);
            }
        }
    }

    handleNukeAttack() {
        const currentTick = Game.time;
        const roomName = this.room.name;
        const nukes = this.room.find(FIND_NUKES);
        if (!nukes.length) {
            this.room.memory.nuke = undefined;
            return false;
        }

        this.room.memory.nuke = _.min(nukes, 'timeToLand').timeToLand;

        const launchRoom = nukes[0].launchRoomName;
        const launchIntel = INTEL[launchRoom];
        if (launchIntel && launchIntel.owner) {
            addToMad(launchIntel.owner);
        }

        const criticalStructures = this.room.structures.filter(s => [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN].includes(s.structureType));

        for (let nuke of nukes) {
            if (nuke.timeToLand <= 75) {
                for (let c of this.room.myCreeps) {
                    c.memory.fleeNukeTime = currentTick + nuke.timeToLand + 2;
                    c.memory.fleeNukeRoom = roomName;
                }
                return true;
            }

            const nearbyStructures = [];
            for (let s of criticalStructures) {
                if (nuke.pos.getRangeTo(s.pos) <= 5) nearbyStructures.push(s);
            }

            for (let structure of nearbyStructures) {
                if (structure.pos.checkForConstructionSites() || structure.pos.checkForRampart()) continue;
                const {tryCreateConstructionSite} = require('planUtils');
                tryCreateConstructionSite(structure.pos, STRUCTURE_RAMPART);
            }
        }
        return true;
    }

    alertHostileAttack() {
        const playerHostile = this.room.hostileCreeps.filter(c =>
            c.owner &&
            c.owner.username !== 'Invader' &&
            PLAYER_HOSTILE_PARTS.some(p => c.hasActiveBodyparts(p))
        );
        const threatening = playerHostile.filter(c =>
            NOTIFY_COMBAT_PARTS.some(p => c.hasActiveBodyparts(p))
        );
        if (!threatening.length) return;

        const hostileOwners = _.uniq(threatening.map(c => c.owner.username)).sort();
        sendHostileNotification(this.room, hostileOwners, threatening);
    }

    safeModeManager() {
        const room = this.room;
        const intel = INTEL[room.name];
        addThreat(room);

        if (room.controller.safeMode) {
            room.memory.defenseCooldown = undefined;
            if (room.controller.safeMode < 750 && room.level >= 5) {
                room.memory.defenseCooldown = Game.time + room.controller.safeMode + CREEP_LIFE_TIME * 0.5;
            }
            delete room.memory.safeModeDeferred;
            return;
        }

        if (!room.controller.safeModeAvailable) return;

        const threatening = getThreateningPlayerHostiles(room);
        if (!threatening.length) return;

        const decision = evaluateSafeModeActivation(room, threatening);
        if (!decision.activate) {
            if (decision.deferSupport) {
                room.memory.safeModeDeferred = {
                    tick: Game.time,
                    reason: decision.reason,
                    holder: decision.holder,
                    winner: decision.winner,
                    bid: decision.bid,
                    urgency: decision.crisis && decision.crisis.urgency,
                };
            } else {
                delete room.memory.safeModeDeferred;
            }
            return;
        }

        const crisis = decision.crisis;
        room.memory.safeModeInfo = {
            tick: Game.time,
            attackers: intel && intel.hostileOwners,
            level: intel && intel.threatLevel,
            reasons: crisis.reasons,
            vitality: crisis.vitality,
            urgency: crisis.urgency,
            bid: decision.bid,
        };
        delete room.memory.safeModeDeferred;
        activateSafeMode(room, crisis);
    }
}

profiler.registerClass(DefenseManager, 'DefenseManager');
module.exports = DefenseManager;

function empireAtWar() {
    return !!((global.WAR_TARGETS && WAR_TARGETS.length) || (global.THREATS && THREATS.length));
}

function getThreateningPlayerHostiles(room) {
    return room.hostileCreeps.filter(c =>
        c.owner &&
        c.owner.username !== 'Invader' &&
        NOTIFY_COMBAT_PARTS.some(p => c.hasActiveBodyparts(p))
    );
}

function isRoomUnderPlayerThreat(room) {
    if (!room) return false;
    if (room.memory.dangerousAttack) return true;
    if (getThreateningPlayerHostiles(room).length) return true;
    const intel = INTEL[room.name];
    if (intel && intel.threatLevel >= 3) return true;
    if (room.memory.earlyWarning) return true;
    return false;
}

function getEmpireSafeModeHolder() {
    for (const name of MY_ROOMS) {
        const other = Game.rooms[name];
        if (other && other.controller && other.controller.safeMode) {
            return {roomName: name, room: other};
        }
    }
    return null;
}

function scoreRoomVitality(room) {
    if (!room || !room.controller) return 0;

    const rcl = room.controller.level;
    const atWar = empireAtWar();
    const {flowStressed, trendOk, flowHealthy} = getFlowContext(room);
    const energyState = room.energyState;

    let score = rcl * 20;

    if (energyState >= 3 || flowHealthy) score *= 1.25;
    else if (energyState >= 2 && trendOk) score *= 1.0;
    else if (energyState === 1) score *= 0.75;
    else score *= 0.5;

    if (flowStressed) score *= 0.7;

    if (atWar) {
        if (rcl >= 8) score += 80;
        else if (rcl >= 7) score += 40;
        else if (rcl <= 4) score -= 40;

        if (rcl === 8 && (energyState <= 1 || flowStressed)) score -= 50;
        else if (rcl === 7 && energyState <= 1 && flowStressed) score -= 25;
    }

    if (room.terminal) score += 15;
    if (room.storage) score += 10;
    if (room.factory) score += 10;

    return Math.max(0, Math.round(score));
}

function assessStructureCrisis(room) {
    let worstRatio = 1;
    let worstType;
    for (const structure of room.structures) {
        if (!SAFEMODE_TIER1_STRUCTURES.includes(structure.structureType)) continue;
        const ratio = structure.hits / structure.hitsMax;
        if (ratio < worstRatio) {
            worstRatio = ratio;
            worstType = structure.structureType;
        }
    }

    const spawnDead = !room.spawns.length;
    const extensionDamage = room.structures.some(s =>
        s.structureType === STRUCTURE_EXTENSION && s.hits < s.hitsMax * 0.85
    );

    return {
        spawnDead,
        worstType,
        worstRatio,
        extensionOnly: extensionDamage && worstRatio >= 0.99 && !spawnDead,
        existential: spawnDead || worstRatio < 0.5,
        significant: spawnDead || worstRatio < 0.8,
    };
}

function roomCanDefendWithoutSafeMode(room, threatening, threatAssessment, structureCrisis) {
    const hostilePower = threatAssessment.hostilePower || 0;
    const friendlyPower = threatAssessment.friendlyPower || 0;
    const activeTowers = (room.towers || []).filter(t =>
        t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST
    ).length;
    const effectiveDefense = friendlyPower + (activeTowers * SAFEMODE_TOWER_POWER_ESTIMATE);
    const defenders = room.myCreeps.filter(c =>
        c.memory.role === 'defender' &&
        (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK))
    ).length;

    if (structureCrisis.significant) return false;
    if (!threatening.length || hostilePower <= 0) return true;

    if (effectiveDefense > hostilePower * 1.25) return true;
    if (defenders >= threatening.length && effectiveDefense >= hostilePower) return true;
    if (activeTowers > 0 && threatAssessment.minRange > NOTIFY_CRITICAL_RANGE &&
        effectiveDefense >= hostilePower * 0.85) return true;

    return false;
}

function assessSafeModeCrisis(room, threatening) {
    const threatAssessment = assessNotificationThreat(room, threatening);
    const structureCrisis = assessStructureCrisis(room);
    const vitality = scoreRoomVitality(room);
    const canDefend = roomCanDefendWithoutSafeMode(room, threatening, threatAssessment, structureCrisis);
    const reasons = [];

    let urgency = 0;

    if (structureCrisis.existential) {
        urgency += 200;
        reasons.push(structureCrisis.spawnDead ? 'spawn_dead' : 'critical_sub_50');
    } else if (structureCrisis.significant) {
        urgency += 120;
        reasons.push('tier1_damage');
    } else if (structureCrisis.extensionOnly) {
        urgency += 15;
        reasons.push('extension_damage');
    }

    if (threatAssessment.threatLevel >= 4) urgency += 60;
    else if (threatAssessment.threatLevel >= 3) urgency += 30;

    if (threatAssessment.minRange !== undefined && threatAssessment.minRange <= 5) {
        urgency += 80;
        reasons.push('core_breach');
    } else if (threatAssessment.minRange !== undefined && threatAssessment.minRange <= NOTIFY_CRITICAL_RANGE) {
        urgency += 40;
        reasons.push('near_core');
    }

    if (threatAssessment.hostilePower >= NOTIFY_MAJOR_COMBAT_POWER) urgency += 50;
    if (threatening.length >= 2) urgency += 25;

    if (canDefend && !structureCrisis.significant) {
        urgency = Math.round(urgency * 0.3);
        reasons.push('self_defending');
    }

    if (structureCrisis.extensionOnly && urgency < SAFEMODE_CRISIS_MIN_URGENCY) {
        return {
            needed: false,
            urgency,
            reasons,
            vitality,
            canDefend,
            threatAssessment,
            structureCrisis,
        };
    }

    const needed = urgency >= SAFEMODE_CRISIS_MIN_URGENCY &&
        (structureCrisis.significant || threatAssessment.worthy || structureCrisis.spawnDead);

    return {
        needed,
        urgency,
        reasons,
        vitality,
        canDefend,
        threatAssessment,
        structureCrisis,
    };
}

function computeSafeModeBid(room, crisis) {
    const vitality = crisis.vitality || scoreRoomVitality(room);
    return crisis.urgency * (vitality / 100);
}

function evaluateSafeModeActivation(room, threatening) {
    const crisis = assessSafeModeCrisis(room, threatening);
    const bid = computeSafeModeBid(room, crisis);

    if (!crisis.needed) {
        return {activate: false, reason: 'not_needed', crisis, bid};
    }

    if (room.controller.safeModeAvailable <= SAFEMODE_MIN_RESERVE && !crisis.structureCrisis.existential) {
        return {activate: false, reason: 'reserving_charge', crisis, bid};
    }

    const holder = getEmpireSafeModeHolder();
    if (holder && holder.roomName !== room.name) {
        return {
            activate: false,
            reason: 'empire_slot_taken',
            holder: holder.roomName,
            crisis,
            bid,
            deferSupport: true,
        };
    }

    let winner = room.name;
    let bestBid = bid;

    for (const name of MY_ROOMS) {
        if (name === room.name) continue;
        const other = Game.rooms[name];
        if (!other || !other.controller || !other.controller.my) continue;
        if (!isRoomUnderPlayerThreat(other)) continue;

        const otherThreatening = getThreateningPlayerHostiles(other);
        if (!otherThreatening.length) continue;

        const otherCrisis = assessSafeModeCrisis(other, otherThreatening);
        if (!otherCrisis.needed) continue;

        const otherBid = computeSafeModeBid(other, otherCrisis);
        if (otherBid > bestBid) {
            bestBid = otherBid;
            winner = name;
        }
    }

    if (winner !== room.name) {
        return {
            activate: false,
            reason: 'lower_priority',
            winner,
            crisis,
            bid,
            deferSupport: true,
        };
    }

    return {activate: true, crisis, bid: bestBid};
}

function getCriticalDefenseTargets(room) {
    const targets = [];
    if (room.controller) targets.push({pos: room.controller.pos, label: 'controller'});
    for (const spawn of room.spawns) targets.push({pos: spawn.pos, label: 'spawn'});
    if (room.storage) targets.push({pos: room.storage.pos, label: 'storage'});
    if (room.terminal) targets.push({pos: room.terminal.pos, label: 'terminal'});
    return targets;
}

function assessNotificationThreat(room, threatening) {
    const intel = INTEL[room.name] || {};
    const threatLevel = intel.threatLevel || 0;
    const hostilePower = intel.hostilePower || 0;
    const friendlyPower = intel.friendlyPower || 0;
    const criticalTargets = getCriticalDefenseTargets(room);

    let nearestCritical;
    let minRange = Infinity;
    for (const creep of threatening) {
        for (const target of criticalTargets) {
            const range = creep.pos.getRangeTo(target.pos);
            if (range < minRange) {
                minRange = range;
                nearestCritical = target.label;
            }
        }
    }

    const structureDamage = room.structures.some(s =>
        NOTIFY_CRITICAL_STRUCTURES.includes(s.structureType) && s.hits < s.hitsMax
    );

    const worthy = threatLevel >= 4 ||
        structureDamage ||
        (minRange <= NOTIFY_CRITICAL_RANGE) ||
        threatening.length >= 2 ||
        hostilePower >= NOTIFY_MAJOR_COMBAT_POWER ||
        (threatLevel >= NOTIFY_MIN_THREAT &&
            hostilePower >= NOTIFY_MIN_COMBAT_POWER &&
            hostilePower > friendlyPower);

    return {
        worthy,
        threatening,
        threatLevel,
        hostilePower,
        friendlyPower,
        hostileCount: intel.numberOfHostiles || threatening.length,
        nearestCritical,
        minRange: minRange === Infinity ? undefined : minRange,
        structureDamage,
    };
}

const HOSTILE_PART_LABELS = {
    [ATTACK]: 'ATK',
    [RANGED_ATTACK]: 'RNG',
    [HEAL]: 'HL',
    [WORK]: 'WRK',
    [CLAIM]: 'CLM',
};

function describeHostileForces(hostiles) {
    const owners = {};
    for (const creep of hostiles) {
        const name = creep.owner.username;
        if (!owners[name]) owners[name] = {creeps: 0, parts: {}};
        owners[name].creeps++;
        for (const part of NOTIFY_COMBAT_PARTS.concat([CLAIM])) {
            if (creep.hasActiveBodyparts(part)) {
                owners[name].parts[part] = (owners[name].parts[part] || 0) + 1;
            }
        }
    }

    return Object.keys(owners).sort().map((name) => {
        const entry = owners[name];
        const partStr = Object.keys(entry.parts)
            .map((part) => `${entry.parts[part]}${HOSTILE_PART_LABELS[part] || part}`)
            .join('+');
        return `${name} x${entry.creeps} [${partStr}]`;
    }).join(', ');
}

function buildHostileNotificationMessage(room, reason, assessment, ownersKey) {
    const lines = [
        `${room.name} under attack [${reason}]`,
        `Attackers: ${describeHostileForces(assessment.threatening)}`,
    ];

    if (assessment.nearestCritical && assessment.minRange !== undefined) {
        lines.push(`Nearest target: ${assessment.nearestCritical} (${assessment.minRange} tiles away)`);
    }
    if (assessment.structureDamage) lines.push('Critical structure damage detected');
    lines.push(`Threat ${assessment.threatLevel}/5, combat power ${assessment.hostilePower} vs ${assessment.friendlyPower} friendly`);

    if (room.controller && room.controller.safeMode) {
        lines.push(`Safe mode active (${room.controller.safeMode} ticks remaining)`);
    }

    const activeTowers = room.towers
        ? room.towers.filter(t => t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST).length
        : 0;
    if (activeTowers) lines.push(`${activeTowers} tower(s) available`);

    lines.push(`Owners: ${ownersKey}`);
    return lines.join('. ');
}

function sendHostileNotification(room, hostileOwners, threatening) {
    Memory._defenseAlerts = Memory._defenseAlerts || {};
    const state = Memory._defenseAlerts[room.name];
    const ownersKey = hostileOwners.join(',');
    const assessment = assessNotificationThreat(room, threatening);
    const threatLevel = assessment.threatLevel;
    const hostileCount = assessment.hostileCount;

    let reason;
    if (assessment.worthy) {
        if (!state || !state.notified) {
            reason = 'INITIAL';
        } else if (state.ownersKey !== ownersKey) {
            reason = 'NEW ATTACKER';
        } else if (threatLevel > (state.peakThreat || 0)) {
            reason = 'ESCALATION';
        } else if (Game.time - state.lastAlert >= ALERT_REMINDER_TICKS) {
            reason = 'ONGOING';
        }
    }

    Memory._defenseAlerts[room.name] = {
        firstAlert: state ? state.firstAlert : Game.time,
        lastAlert: reason ? Game.time : (state && state.lastAlert) || Game.time,
        ownersKey,
        notified: !!(state && state.notified) || !!reason,
        peakThreat: Math.max(threatLevel, (state && state.peakThreat) || 0),
        peakHostiles: Math.max(hostileCount, (state && state.peakHostiles) || 0),
    };

    if (!reason) return;

    if (INTEL[room.name]) INTEL[room.name].alertEmail = true;

    const historyLink = roomHistoryLink(room.name);
    const summary = buildHostileNotificationMessage(room, reason, assessment, ownersKey);

    Game.notify(summary, ALERT_GROUP_MINUTES);

    log.a(`${historyLink} ${summary}`, 'DEFENSE');
}

function clearHostileAlert(room) {
    if (!Memory._defenseAlerts || !Memory._defenseAlerts[room.name]) return;
    const state = Memory._defenseAlerts[room.name];
    delete Memory._defenseAlerts[room.name];

    if (!state.notified || (state.peakThreat || 0) < NOTIFY_MIN_THREAT) return;
    const duration = Game.time - (state.firstAlert || Game.time);
    const summary = `${room.name} [ALL CLEAR] attack ended after ${duration} ticks (~${Math.round(duration / 60)} min). Peak: ${state.peakHostiles} hostiles, threat ${state.peakThreat}/5, owners ${state.ownersKey}`;
    Game.notify(summary, ALERT_GROUP_MINUTES);
    log.a(`${roomLink(room.name)} all clear after ${duration} ticks. Peak: ${state.peakHostiles} hostiles, threat ${state.peakThreat}, owners ${state.ownersKey}`, 'DEFENSE');
}

function activateSafeMode(room, crisis = {}) {
    const result = room.controller.activateSafeMode();
    if (result !== OK) {
        log.w(`${roomLink(room.name)} safe mode activation failed (${result}). Charges=${room.controller.safeModeAvailable}`, 'DEFENSE');
        return result;
    }

    const ownerArray = _.uniq(room.hostileCreeps.map(c => c.owner && c.owner.username).filter(Boolean));
    const intel = INTEL[room.name] || {};
    const summary = [
        `${room.name} SAFE MODE activated`,
        `trigger: ${(crisis.reasons || []).join(',') || 'unknown'}`,
        `vitality=${crisis.vitality || scoreRoomVitality(room)} urgency=${crisis.urgency || 0}`,
        `threat=${intel.threatLevel || 0} power ${intel.hostilePower || 0}/${intel.friendlyPower || 0}`,
        `charges left=${room.controller.safeModeAvailable}`,
        `attackers=${ownerArray.join(',') || 'none'}`,
    ].join('. ');

    log.a(summary, 'DEFENSE COMMAND');
    Game.notify(summary, ALERT_GROUP_MINUTES);
    return result;
}

function addThreat(room) {
    const neutrals = _.uniq(room.hostileCreeps
        .filter(c => c.owner && !_.includes(FRIENDLIES, c.owner.username) &&
            c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper')
        .map(c => c.owner.username));
    if (neutrals.length) {
        for (let user of neutrals) {
            if (user === MY_USERNAME || _.includes(FRIENDLIES, user)) continue;
            let cache = Memory._userList || {};
            let standing;
            if (cache[user]) {
                standing = cache[user]['standing'] - 0.25;
            } else if (!cache[user]) {
                standing = 0;
                log.w(roomLink(room.name) + ' has detected a neutral.' + user + ' has now been marked hostile for trespassing.', 'DIPLOMACY:');
            }
            cache[user] = {
                standing: standing,
                lastAction: Game.time,
            };
            Memory._userList = cache;
        }
    }
}