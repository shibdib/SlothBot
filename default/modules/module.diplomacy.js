/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.6 - markHostile/clearHostile/listHostile console helpers; temp-hostiles now
 *               persist in Memory.tempHostiles and push onto THREATS.
 *               v2.5: MY_STRENGTH baseline exposed as global; diplomacyReport plain text.
 *               v2.4: precomputed owner→rooms map; grouped WAR_PRIORITY/INTEL_PENALTY
 *               constants; composite userStrength mixed into war target priority.
 */

'use strict';

let diplomacyCache = {};

// Hysteresis & smoothing constants for war target stability.
const THREAT_ADD = -25;          // standing must reach this to join THREATS
const THREAT_REMOVE = -5;        // ...and rise above this to leave
const ENEMY_ADD = -300;
const ENEMY_REMOVE = -200;
const WAR_TARGETS_MAX = 3;
const WAR_TARGETS_REBUILD_COOLDOWN = 25; // recompute list at most this often
const WAR_TARGETS_EMA_ALPHA = 0.15;      // smoothing factor on per-user priority
const WAR_TARGETS_STICKY_BONUS = 30;     // score nudge for users already on the list

// War-target qualification — what makes a user "deserve" attack.
// The pool is built in two tiers: we only fall through to the opportunistic
// tier when the worthy tier is empty (peace mode → pick on weaker neighbours
// we can actually handle). When BOTH tiers are empty, WAR_TARGETS is empty
// and the bot focuses on economy.
const AGGRESSOR_RECENCY_TICKS = 5000;        // attacked or harassed us within this window
const ENCROACH_DISTANCE = 2;                 // their rooms within this many of ours = encroachment
const ENCROACH_MIN_THREAT_LEVEL = 2;         // ...and they need at least this much hostile signal
const OPPORTUNISTIC_DISTANCE = 3;            // peace-mode targets must be within this distance
const OPPORTUNISTIC_STRENGTH_RATIO = 0.7;    // ...and at this fraction of our strength or weaker
const MANUAL_WAR_TARGET_PRIORITY = 9999;     // synthetic priority for config-declared targets

// Raw-priority weights for buildWarTargets — grouped so tuning is one place.
const WAR_PRIORITY = {
    standingDivisor: 10,         // negative standing / 10 contributes to raw
    lastActionBase: 50,          // bonus that decays over 500 ticks from last action
    lastActionDecayTicks: 500,
    intelCombatBase: 80,         // recent combat in their room
    intelCombatDecayTicks: 300,
    intelArmedBase: 60,          // recent armed hostile sighting
    intelArmedDecayTicks: 200,
    intelThreatHigh: 40,         // threatLevel >= 3 in their room
    intelClose: 70,              // their room within 3 of one of mine
    intelTowers: 30,             // they have towers in this room
    strengthPerLevel: 8,         // composite strength contribution (matches userStrength scale)
    strengthCap: 60              // ...capped so a megacorp doesn't drown out closer threats
};

// trackThreat gate: at most one standing hit per user per this many ticks.
// Without it, a single 50-tick engagement compounds into 50 standing hits.
const TRACK_THREAT_COOLDOWN = 20;
const STANDING_FLOOR = -1500;

// Stale-user prune: how often, and how old/inactive a user must be to drop.
const USERLIST_PRUNE_INTERVAL = 5000;
const USERLIST_PRUNE_INACTIVE_TICKS = 50000;

// scoreUserFromIntel weights — separate scaling because this nudges standing, not priority.
const INTEL_PENALTY = {
    recentCombat: -80,           // intel.lastCombat within 500 ticks
    armedHostileClose: -120,     // intel.armedHostile recent AND distance < 4
    highThreatNearby: -60,       // threatLevel >= 3 AND distance < 5
    powerOrCommodity: -40,
    fortifiedNeighbor: -100      // towers/SK at distance <= 2 and not friendly
};

module.exports.diplomacyManager = function () {
    if (!Memory._userList || !(Memory._userList instanceof Object)) Memory._userList = {};
    if (!Memory.tempHostiles) Memory.tempHostiles = {};

    const currentTime = Game.time;

    if (!diplomacyCache.tick || diplomacyCache.tick !== currentTime) {
        if (!global.LOAN_LIST) global.LOAN_LIST = [];
        if (!global.MANUAL_FRIENDS) global.MANUAL_FRIENDS = [];

        // Expire temp-hostile entries — keeps Memory clean and the active set well-defined.
        for (const name in Memory.tempHostiles) {
            if (Memory.tempHostiles[name].tick <= currentTime) delete Memory.tempHostiles[name];
        }
        const tempHostileNames = Object.keys(Memory.tempHostiles);

        global.FRIENDLIES = _.union(LOAN_LIST, [MY_USERNAME], ['Shibdib'], MANUAL_FRIENDS)
            .filter(u => !Memory.tempHostiles[u]);

        // Precompute owner→rooms once per tick — scoreUserFromIntel and buildWarTargets both
        // need this, and walking the full INTEL per-user was O(users × rooms) per tick.
        const ownerToRooms = {};
        for (const roomName in INTEL) {
            const intel = INTEL[roomName];
            const account = intel && (intel.owner || intel.reservation);
            if (!account) continue;
            (ownerToRooms[account] = ownerToRooms[account] || []).push(intel);
        }

        // Composite strength of our own empire — comparison baseline for highCommand
        // (siege feasibility, candidate filter, scoreTarget gap penalty).
        global.MY_STRENGTH = userStrength(MY_USERNAME);

        threatManager(ownerToRooms);

        // Temp-hostiles go onto THREATS so defenders engage them, but they're NOT pushed
        // onto ENEMIES — that would trigger sieges, which is too escalatory for a temporary
        // mark. Use the standing system if you want full enemy status.
        if (tempHostileNames.length) global.THREATS = _.union(global.THREATS, tempHostileNames);

        diplomacyCache = {tick: currentTime};
    }
};

/**
 * Console helper — temporarily treat a user as hostile (drop from FRIENDLIES, add to THREATS)
 * for `ticks` ticks. Persists across global resets via Memory.tempHostiles. Does not modify
 * permanent standing — use for one-off retaliation or testing without burning the relationship.
 *
 * Usage: markHostile('PlayerName')           // 1500 ticks default
 *        markHostile('PlayerName', 5000)
 */
global.markHostile = function (username, ticks = 1500) {
    if (!username) {
        console.log('usage: markHostile(username, ticks=1500)');
        return;
    }
    if (!Memory.tempHostiles) Memory.tempHostiles = {};
    Memory.tempHostiles[username] = {tick: Game.time + ticks, added: Game.time};
    diplomacyCache = {};   // force re-evaluation on the next tick
    console.log(`Marked ${username} as temp-hostile for ${ticks} ticks (until tick ${Game.time + ticks}).`);
};

global.clearHostile = function (username) {
    if (!Memory.tempHostiles || !Memory.tempHostiles[username]) {
        console.log(`${username} is not in tempHostiles.`);
        return;
    }
    delete Memory.tempHostiles[username];
    diplomacyCache = {};
    console.log(`Cleared temp-hostile mark on ${username}.`);
};

global.listHostile = function () {
    const list = Memory.tempHostiles || {};
    const names = Object.keys(list);
    if (!names.length) {
        console.log('No active temp-hostile marks.');
        return;
    }
    console.log('\nActive temp-hostile marks:');
    for (const name of names) {
        const ticksLeft = list[name].tick - Game.time;
        console.log(`  ${name.padEnd(18)} ${ticksLeft} ticks remaining`);
    }
};

function threatManager(ownerToRooms) {
    const currentTime = Game.time;
    global.ENEMIES = [];
    global.THREATS = [];

    // Use last tick's classification for the at-war signal so decay rate isn't dependent
    // on the iteration order of Memory._userList.
    let isAtWar = false;
    for (const name in Memory._userList) {
        const u = Memory._userList[name];
        if (u && (u.isEnemy || u.isThreat)) {
            isAtWar = true;
            break;
        }
    }
    const decayRate = isAtWar ? 0.1 : 0.3;
    const recoveryRate = isAtWar ? 0.5 : 1.0;

    for (const name in Memory._userList) {
        if (!name || name === MY_USERNAME || name === 'undefined' || name.length < 2) continue;

        const user = Memory._userList[name];
        let currentRating = user.standing || 0;

        // Decay block — only skip when the user genuinely changed recently. Classification still runs.
        const decayEligible = (user.lastChange || 0) + 25 < currentTime
            && (user.lastAction || 0) + 25 < currentTime;
        if (decayEligible) {
            // Don't decay current threats out of threat range — wait for active improvement.
            const protectedFromDecay = user.isThreat && currentRating < THREAT_REMOVE;
            if (!protectedFromDecay) {
                currentRating = (currentRating > 5)
                    ? currentRating - decayRate
                    : currentRating + recoveryRate;
                currentRating = Math.max(STANDING_FLOOR, Math.min(100, currentRating));
                user.lastChange = currentTime;
            }
        }

        // Hysteresis: separate add/remove thresholds so users don't flicker on/off the lists.
        const forcedEnemy = COMBAT_SERVER && !FRIENDLIES.includes(name);
        if (user.isEnemy) {
            if (forcedEnemy || currentRating < ENEMY_REMOVE) ENEMIES.push(name);
            else user.isEnemy = false;
        } else if (forcedEnemy || currentRating < ENEMY_ADD) {
            ENEMIES.push(name);
            user.isEnemy = true;
        }
        if (user.isThreat) {
            if (currentRating < THREAT_REMOVE) THREATS.push(name);
            else user.isThreat = false;
        } else if (currentRating < THREAT_ADD) {
            THREATS.push(name);
            user.isThreat = true;
        }

        const intelScore = scoreUserFromIntel(name, currentTime, ownerToRooms[name]);
        if (intelScore < -50) {
            currentRating = Math.max(currentRating - 20, STANDING_FLOOR);
            user.lastAction = currentTime;
        }

        user.standing = Math.round(currentRating * 100) / 100;
    }

    if (currentTime % USERLIST_PRUNE_INTERVAL === 0) pruneUserList(currentTime);

    global.ENEMIES = _.union(ENEMIES, HOSTILES || []);
    global.THREATS = _.union(THREATS, HOSTILES || []);

    // Throttle the WAR_TARGETS rebuild — it iterates INTEL per user. In between rebuilds we
    // simply re-publish the persisted list so the global stays consistent.
    if (!Memory.warTargets || !Memory._lastWarTargetsBuild
        || Memory._lastWarTargetsBuild + WAR_TARGETS_REBUILD_COOLDOWN <= currentTime) {
        buildWarTargets(currentTime, ownerToRooms);
        Memory._lastWarTargetsBuild = currentTime;
    } else {
        global.WAR_TARGETS = Memory.warTargets;
    }
}

function pruneUserList(currentTime) {
    // Drop users we haven't seen acting in a very long time, aren't classified, and whose
    // standing has decayed back to neutral. Keeps Memory._userList from growing forever.
    for (const name in Memory._userList) {
        const u = Memory._userList[name];
        if (!u) {
            delete Memory._userList[name];
            continue;
        }
        if (u.isEnemy || u.isThreat) continue;
        if (FRIENDLIES.includes(name)) continue;
        const inactive = !u.lastAction || (currentTime - u.lastAction) > USERLIST_PRUNE_INACTIVE_TICKS;
        const neutral = Math.abs(u.standing || 0) < 5;
        if (inactive && neutral) delete Memory._userList[name];
    }
}

function scoreUserFromIntel(username, currentTime, userRooms) {
    if (!userRooms || !userRooms.length) return 0;
    let score = 0;
    const userIsFriendly = FRIENDLIES.includes(username);
    for (const intel of userRooms) {
        const distance = findClosestOwnedRoom(intel.name, true) || 99;

        if (intel.lastCombat && intel.lastCombat + 500 > currentTime) score += INTEL_PENALTY.recentCombat;
        if (intel.armedHostile && intel.armedHostile + 300 > currentTime && distance < 4) score += INTEL_PENALTY.armedHostileClose;
        if (intel.threatLevel && intel.threatLevel >= 3 && distance < 5) score += INTEL_PENALTY.highThreatNearby;
        if ((intel.power && intel.power > currentTime) || intel.commodity) score += INTEL_PENALTY.powerOrCommodity;
        if (distance <= 2 && (intel.towers || intel.sk) && !userIsFriendly) score += INTEL_PENALTY.fortifiedNeighbor;
    }
    return score;
}

function buildWarTargets(currentTime, ownerToRooms) {
    if (!Memory.warTargets) Memory.warTargets = [];
    const previousMembers = new Set(Memory.warTargets.map(t => t && t.user).filter(Boolean));

    // Config-declared always-war list. Bypasses every qualification check below
    // and is always emitted into WAR_TARGETS even when we'd otherwise be at peace.
    const manualList = (global.MANUAL_WAR_TARGETS || []).filter(u =>
        u && u !== MY_USERNAME && !FRIENDLIES.includes(u)
    );
    const manualSet = new Set(manualList);

    // Two-tier candidate pools. We only fall through to the opportunistic tier
    // when the worthy tier is empty — that's the "peace mode → pick on weak
    // neighbours we can actually handle" branch the user wanted. When both tiers
    // are empty, we emit just the manual list (possibly empty) and the bot is
    // free to invest CPU into economy / boost stockpile instead of churning ops.
    const worthy = [];
    const opportunistic = [];

    for (const name in Memory._userList) {
        if (!name || name === MY_USERNAME || name === 'undefined' || name.length < 2
            || FRIENDLIES.includes(name) || NO_DIRECT_ATTACKS.includes(name)
            || manualSet.has(name)) continue;

        const user = Memory._userList[name];
        const userRooms = ownerToRooms[name] || [];

        // Walk the user's rooms once and capture three signals we need below:
        // closest distance to a room of ours, whether they're encroaching on a
        // neighbour of ours, and whether their close room is showing hostile signs.
        let minDistance = 99;
        let encroachingHostile = false;
        for (const intel of userRooms) {
            const dist = findClosestOwnedRoom(intel.name, true) || 99;
            if (dist < minDistance) minDistance = dist;
            if (dist <= ENCROACH_DISTANCE) {
                const hostileSignal = intel.lastCombat || intel.armedHostile
                    || (intel.threatLevel || 0) >= ENCROACH_MIN_THREAT_LEVEL || intel.towers;
                if (hostileSignal) encroachingHostile = true;
            }
        }

        // ===== Worthy tier =====
        // ENEMY classification, a recent aggression on us, or hostile encroachment
        // near our rooms. These users earned a place on the list.
        const isEnemy = ENEMIES.includes(name);
        const isAggressor = user.lastAction
            && (currentTime - user.lastAction) < AGGRESSOR_RECENCY_TICKS;

        let tier;
        if (isEnemy || isAggressor || encroachingHostile) {
            tier = 'worthy';
        } else if (minDistance <= OPPORTUNISTIC_DISTANCE
            && userStrength(name) < (global.MY_STRENGTH || 1) * OPPORTUNISTIC_STRENGTH_RATIO) {
            // ===== Opportunistic tier =====
            // Close enough to be a credible target AND weaker than us, so we
            // know we can handle them. Only used when worthy is empty.
            tier = 'opportunistic';
        } else {
            // Neither worthy nor handleable. Decay any stale priority EMA so a
            // long-dormant user doesn't keep an inflated score around.
            if (user.warPriority) {
                const decayed = Math.round(user.warPriority * (1 - WAR_TARGETS_EMA_ALPHA));
                user.warPriority = decayed > 1 ? decayed : undefined;
            }
            continue;
        }

        // Raw priority — same formula as before; the difference is who's allowed
        // into this scoring step.
        let raw = user.standing < 0 ? -user.standing / WAR_PRIORITY.standingDivisor : 0;
        if (user.lastAction) {
            raw += WAR_PRIORITY.lastActionBase
                * Math.max(0, 1 - (currentTime - user.lastAction) / WAR_PRIORITY.lastActionDecayTicks);
        }
        for (const intel of userRooms) {
            const dist = findClosestOwnedRoom(intel.name, true) || 99;
            if (intel.lastCombat) {
                raw += WAR_PRIORITY.intelCombatBase
                    * Math.max(0, 1 - (currentTime - intel.lastCombat) / WAR_PRIORITY.intelCombatDecayTicks);
            }
            if (intel.armedHostile) {
                raw += WAR_PRIORITY.intelArmedBase
                    * Math.max(0, 1 - (currentTime - intel.armedHostile) / WAR_PRIORITY.intelArmedDecayTicks);
            }
            if (intel.threatLevel >= 3) raw += WAR_PRIORITY.intelThreatHigh;
            if (dist <= 3) raw += WAR_PRIORITY.intelClose;
            if (intel.towers) raw += WAR_PRIORITY.intelTowers;
        }

        const strength = userStrength(name);
        raw += Math.min(strength * WAR_PRIORITY.strengthPerLevel, WAR_PRIORITY.strengthCap);
        raw = Math.round(raw);

        // EMA smoothing as before.
        const prevEMA = user.warPriority != null ? user.warPriority : raw;
        const smoothed = Math.round(prevEMA * (1 - WAR_TARGETS_EMA_ALPHA) + raw * WAR_TARGETS_EMA_ALPHA);
        user.warPriority = smoothed;

        const ranking = smoothed + (previousMembers.has(name) ? WAR_TARGETS_STICKY_BONUS : 0);
        const entry = {user: name, priority: smoothed, ranking};
        if (tier === 'worthy') worthy.push(entry); else opportunistic.push(entry);
    }

    // Manual targets always go on the list, with synthetic max priority. The
    // remaining slots are filled from the worthy pool, or from opportunistic
    // when worthy is empty (peace-mode aggression).
    const targets = manualList.map(name => ({user: name, priority: MANUAL_WAR_TARGET_PRIORITY, manual: true}));
    const remainingSlots = WAR_TARGETS_MAX - targets.length;
    if (remainingSlots > 0) {
        const pool = worthy.length ? worthy : opportunistic;
        pool.sort((a, b) => b.ranking - a.ranking);
        for (let i = 0; i < remainingSlots && i < pool.length; i++) {
            targets.push({user: pool[i].user, priority: pool[i].priority});
        }
    }

    Memory.warTargets = targets;
    global.WAR_TARGETS = targets;
}

module.exports.trackThreat = function (creep) {
    const {room, hits, hitsMax, memory} = creep;
    const currentTime = Game.time;

    if (!INTEL[room.name]) return room.cacheRoomIntel();

    const hostileTower = room.towers.find(t => !t.my);
    if (hostileTower && !INTEL[room.name].towers) {
        room.cacheRoomIntel(true);
        purgeBadRoute(room.name);
    }

    if (hits < (memory._lastHits || hitsMax)) {
        if (!INTEL[room.name]) return;

        INTEL[room.name].lastCombat = currentTime;
        INTEL[room.name].pathingPenalty = currentTime;
        INTEL[room.name].armedHostile = currentTime;

        const isHostileRoom = INTEL[room.name].user && !FRIENDLIES.includes(INTEL[room.name].user);
        if (isHostileRoom) purgeBadRoute(room.name);
        if (isHostileRoom && memory.destination !== room.name) return;

        const nearbyHostiles = _.uniq(
            room.creeps
                .filter(c =>
                    c.owner &&
                    c.owner.username !== MY_USERNAME &&
                    ((c.hasActiveBodyparts(RANGED_ATTACK) && c.pos.inRangeTo(creep, 3)) ||
                        (c.hasActiveBodyparts(ATTACK) && c.pos.isNearTo(creep)))
                )
                .map(c => c.owner.username)
        );

        for (const user of nearbyHostiles) {
            if (user === MY_USERNAME || user === 'Invader' || user === 'Source Keeper') continue;

            if (!Memory._userList) Memory._userList = {};
            const cache = Memory._userList;
            const userEntry = cache[user] || {standing: 0};

            // Cooldown so a sustained engagement compounds at most once per N ticks per user.
            if ((userEntry.lastAction || 0) + TRACK_THREAT_COOLDOWN > currentTime) continue;

            const multiplier = (INTEL[room.name].user === MY_USERNAME) ? 3 : 1.0;
            let standing = userEntry.standing || 0;

            standing -= (FRIENDLIES.includes(user) ? 1.5 : 3.5) * multiplier;
            standing = Math.max(standing, STANDING_FLOOR);

            userEntry.standing = standing;
            userEntry.lastAction = currentTime;
            userEntry.lastChange = currentTime;
            cache[user] = userEntry;
        }
    }

    memory._lastHits = hits;

    if (room.hostileCreeps.length && INTEL[room.name] && INTEL[room.name].user === MY_USERNAME) {
        const neutrals = _.uniq(room.hostileCreeps.map(c => c.owner.username));

        for (const user of neutrals) {
            if (user === MY_USERNAME || user === 'Invader' || user === 'Source Keeper' ||
                FRIENDLIES.includes(user) || (INTEL[room.name] && INTEL[room.name].isHighway)) continue;

            if (!Memory._userList) Memory._userList = {};
            const cache = Memory._userList;
            const userEntry = cache[user] || {standing: 0};

            if ((userEntry.lastAction || 0) + 50 > currentTime) continue;

            userEntry.standing = Math.max((userEntry.standing || 0) - 0.75, STANDING_FLOOR);
            userEntry.lastAction = currentTime;
            userEntry.lastChange = currentTime;
            cache[user] = userEntry;
        }
    }
};

// ============================================================
//                    CONSOLE COMMAND
// ============================================================

global.diplomacyReport = function () {
    const currentTime = Game.time;
    const users = Memory._userList || {};

    console.log(`\nDIPLOMACY REPORT — tick ${currentTime}`);
    console.log(`MY_STRENGTH: ${(global.MY_STRENGTH || 0).toFixed(1)}  |  FRIENDLIES: ${FRIENDLIES.length}  THREATS: ${THREATS.length}  ENEMIES: ${ENEMIES.length}`);

    const sortedUsers = Object.keys(users)
        .filter(name => name && name !== MY_USERNAME && name !== 'undefined' && name.length > 1)
        .sort((a, b) => users[b].standing - users[a].standing)
        .slice(0, 12);

    console.log(`\nTop standings (12):`);
    console.log(`  ${'user'.padEnd(18)} ${'standing'.padStart(8)} ${'strength'.padStart(8)}  last action`);
    for (const name of sortedUsers) {
        const u = users[name];
        const strength = userStrength(name).toFixed(1);
        const lastAction = u.lastAction ? `${currentTime - u.lastAction} ticks ago` : '-';
        console.log(`  ${name.padEnd(18)} ${u.standing.toFixed(1).padStart(8)} ${strength.padStart(8)}  ${lastAction}`);
    }

    if (global.WAR_TARGETS && global.WAR_TARGETS.length) {
        console.log(`\nWar targets (${global.WAR_TARGETS.length}):`);
        console.log(`  ${'user'.padEnd(18)} ${'priority'.padStart(8)} ${'strength'.padStart(8)}`);
        for (const t of global.WAR_TARGETS) {
            console.log(`  ${t.user.padEnd(18)} ${String(t.priority).padStart(8)} ${userStrength(t.user).toFixed(1).padStart(8)}`);
        }
    } else {
        console.log(`\nNo active war targets.`);
    }

    let recentOffenders = 0;
    let tracked = 0;
    for (const name in users) {
        if (!name || name === MY_USERNAME || name === 'undefined' || name.length < 2) continue;
        const u = users[name];
        if (u.lastAction && currentTime - u.lastAction < 500) recentOffenders++;
        tracked++;
    }

    console.log(`\nActive in last 500 ticks: ${recentOffenders}  |  users tracked: ${tracked}\n`);
};

module.exports.getWarTargets = function () {
    return global.WAR_TARGETS || [];
};

module.exports.isEnemy = function (username) {
    return ENEMIES.includes(username) || THREATS.includes(username);
};