/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Global military/auxiliary operation creep dispatch.
 */

const spawnState = require('spawnState');
const state = require('hcState');
const {getEmpireReadiness} = require('hcReadiness');
const {collectThreatRemotes} = require('harassUtils');
const {getCreepCount} = require('spawnCounts');
const {queueCreepIfNeeded, pruneQueueCache, clearOpQueueRole} = require('spawnQueue');
const {buildOperationsSignature, pruneEmptyOperations, getPriority, resolvePendingAssignments} = require('spawnOperations');
const {getSiegeTowerDamage} = require('module.bodyGenerator');
const {SIEGE_REQUIRED_BOOSTS, SIEGE_OPTIONAL_BOOSTS, siegeLabBoosts} = require('bodySiegeBoosts');
const {isNukeHold} = require('hcNukes');

function queueHarassmentCreeps() {
    // Harassment is independent of OFFENSIVE_OPERATIONS so live shards can raid
    // remotes without opening room sieges.
    if (!HARASSMENT_OPERATIONS || !state.ALLOW_NEW_OPS) return;

    const readiness = state.EMPIRE_READINESS || getEmpireReadiness();
    if (!readiness.canLaunchOps || readiness.empireCritical) return;

    const threatCount = (THREATS && THREATS.length) || 0;
    const warCount = (global.WAR_TARGETS && WAR_TARGETS.length) || 0;
    if (!threatCount && !warCount) return;

    const remotePool = collectThreatRemotes();
    if (!remotePool.length) return;

    const ratio = typeof HARASSMENT_BUDGET_RATIO === 'number' ? HARASSMENT_BUDGET_RATIO : 0.15;
    const hardCap = typeof HARASSMENT_MAX === 'number' ? HARASSMENT_MAX : 3;
    const budget = Math.min(
        Math.max(1, Math.ceil(readiness.combatReady * ratio)),
        Math.max(threatCount, warCount),
        remotePool.length,
        hardCap
    );

    queueCreepIfNeeded({
        role: 'longbow',
        global: true,
        priority: PRIORITIES.secondary,
        numberNeeded: budget,
        operation: 'harass',
    });
}

function globalCreepQueue() {
    if (global.isPostResetDangerWindow && global.isPostResetDangerWindow()) return;

    pruneQueueCache();
    pruneEmptyOperations();

    const signature = buildOperationsSignature();
    const fullScan = signature !== spawnState.lastGlobalOpSignature || Game.time % spawnState.GLOBAL_QUEUE_FULL_SCAN_INTERVAL === 0;
    spawnState.lastGlobalOpSignature = signature;
    if (!fullScan) return;

    queueHarassmentCreeps();

    const operations = {...Memory.targetRooms, ...Memory.auxiliaryTargets};

    if (_.isEmpty(operations)) return;

    const checkSustainability = require('module.highCommand').operationSustainability;

    for (let key in operations) {
        const operation = operations[key];
        if (!operation) continue;

        const opRoom = Game.rooms[key];
        if (opRoom && spawnState.MILITARY_SUSTAIN_OPS.has(operation.type)) {
            checkSustainability(opRoom, key);
            if (!Memory.targetRooms[key] && !Memory.auxiliaryTargets[key]) continue;
        }

        const opLevel = operation.level != null ? operation.level : 1;
        let priority = INTEL[key] ? getPriority(key) : PRIORITIES.secondary;
        if (Memory.auxiliaryTargets[key] && operation.priority != null) {
            priority = Math.min(priority, operation.priority);
        }
        operation.priority = priority;

        if (operation.builders) {
            queueCreepIfNeeded({
                role: 'drone', priority: PRIORITIES.drone + 1, numberNeeded: 6, destination: key, closestRoom: true
            });
        }

        const intel = INTEL[key];
        if (!intel || intel.cached == null) {
            queueCreepIfNeeded({role: 'scout', priority: 1, numberNeeded: 1, destination: key, closestRoom: true});
            continue;
        }

        switch (operation.type) {
            case 'scout':
                queueCreepIfNeeded({role: 'scout', priority: 1, numberNeeded: 1, destination: key, closestRoom: true});
                break;
            case 'claim':
                queueCreepIfNeeded({
                    role: 'claimer', priority, numberNeeded: 1, destination: key,
                    closestRoom: true, operation: 'claim'
                });
                break;
            case 'rebuild':
                if (!INTEL[key] || !INTEL[key].lastPlayerSighting || INTEL[key].lastPlayerSighting + 750 < Game.time || INTEL[key].safemode) {
                    const rebuildRoom = Game.rooms[key];
                    let rebuildPriority = 2;
                    if (rebuildRoom) {
                        const hasSpawn = rebuildRoom.spawns.length > 0;
                        if (!hasSpawn) rebuildPriority = 1;
                        else if (rebuildRoom.storage && rebuildRoom.terminal) rebuildPriority = PRIORITIES.drone;
                        else rebuildPriority = 3;
                    }
                    queueCreepIfNeeded({
                        role: 'drone', priority: rebuildPriority + getCreepCount(undefined, 'drone', key),
                        numberNeeded: 6, destination: key, misc: {boosts: [WORK]}, closestRoom: true
                    });
                }
                if (INTEL[key].threatLevel) {
                    if (INTEL[key].threatLevel > 1) {
                        const owners = INTEL[key].hostileOwners;
                        if (!owners || !owners.length) break;
                        const maxLevelOfAttacker = userStrength(_.max(owners, (o) => userStrength(o)));
                        if ((maxLevelOfAttacker >= 7 && MAX_LEVEL < 7) || (maxLevelOfAttacker > MAX_LEVEL + 1)) continue;
                    }
                    const count = 4;
                    const boosted = INTEL[key].threatLevel > 2;
                    if (boosted) {
                        operation.boosts = [HEAL];
                        operation.optionalBoosts = [RANGED_ATTACK];
                    }
                    queueCreepIfNeeded({
                        role: 'longbowSquad', priority: priority + 1, numberNeeded: count, destination: key,
                        misc: {waitFor: count, boosts: boosted ? [RANGED_ATTACK, HEAL] : undefined}, closestRoom: true
                    });
                }
                break;
            case 'commodity':
            case 'mineral':
                queueCreepIfNeeded({
                    role: 'commodityMiner', priority, numberNeeded: 3, destination: key,
                    misc: {boosts: [WORK]}, closestRoom: true
                });
                break;
            case 'power':
                queuePowerOperation(operation, key, priority);
                break;
            case 'remoteDenial':
                const remotes = _.filter(_.map(Game.map.describeExits(key)), function (r) {
                    return (!INTEL[r] || !INTEL[r].owner) && Object.values(Game.map.describeExits(r)).length > 1;
                });
                queueCreepIfNeeded({
                    role: 'longbow', priority, numberNeeded: 1, destination: key,
                    misc: {remotes: remotes}, closestRoom: true, operation: 'remoteDenial'
                });
                break;
            case 'roomDenial':
                if (isNukeHold(operation)) {
                    operation.boosts = undefined;
                    operation.optionalBoosts = undefined;
                    clearOpQueueRole('longbow', key, 'roomDenial');
                    clearOpQueueRole('longbowSquad', key, 'roomDenial');
                    if (!Game.rooms[key]) {
                        queueCreepIfNeeded({
                            role: 'scout',
                            priority: 1,
                            numberNeeded: 1,
                            destination: key,
                            closestRoom: true
                        });
                    }
                    break;
                }
                const rdIntel = INTEL[key];
                const rdTowers = rdIntel && rdIntel.towers || 0;
                const rdWaves = operation.waves || 0;
                const rdLimit = operation.waveLimit || 12;
                if (rdWaves >= rdLimit) {
                    operation.boosts = undefined;
                    operation.optionalBoosts = undefined;
                    clearOpQueueRole('longbow', key, 'roomDenial');
                    clearOpQueueRole('longbowSquad', key, 'roomDenial');
                    if (!Game.rooms[key]) {
                        queueCreepIfNeeded({
                            role: 'scout',
                            priority: 1,
                            numberNeeded: 1,
                            destination: key,
                            closestRoom: true
                        });
                    }
                    break;
                }
                if (rdTowers) {
                    operation.boosts = SIEGE_REQUIRED_BOOSTS.slice();
                    operation.optionalBoosts = SIEGE_OPTIONAL_BOOSTS.slice();
                    const siegeDamage = getSiegeTowerDamage(rdIntel) || rdTowers * 600;
                    // Melee siegeDuo is not used here: the healer is sized for two
                    // stacked bodies and cannot be built at RCL 6 against even one tower.
                    // Solos need a recent dest look with no armed hostiles. Missing
                    // that used to keep sending boosted singles into unseen defenders.
                    const destSeen = rdIntel.lastObservation
                        && Game.time - rdIntel.lastObservation < CREEP_LIFE_TIME;
                    const defenders = !!(rdIntel.activeDefenders
                        || (rdIntel.armedHostile && Game.time - rdIntel.armedHostile < CREEP_LIFE_TIME));
                    const useSolo = siegeDamage <= 960 && destSeen && !defenders && rdWaves < 2;
                    const labBoosts = siegeLabBoosts();
                    // RCL7 has no observers. A scout in dest is how we see
                    // ramparts on the landing tiles before/during the 2×2 hop.
                    if (!Game.rooms[key]) {
                        queueCreepIfNeeded({
                            role: 'scout',
                            priority: 1,
                            numberNeeded: 1,
                            destination: key,
                            closestRoom: true
                        });
                    }
                    if (useSolo) {
                        clearOpQueueRole('longbowSquad', key, 'roomDenial');
                        queueCreepIfNeeded({
                            role: 'longbow',
                            priority,
                            numberNeeded: 1,
                            destination: key,
                            closestRoom: true,
                            operation: 'roomDenial',
                            misc: {boosts: labBoosts}
                        });
                    } else {
                        const waitFor = (rdWaves >= 2 || siegeDamage > 960) ? 4 : 2;
                        clearOpQueueRole('longbow', key, 'roomDenial');
                        queueCreepIfNeeded({
                            role: 'longbowSquad', priority, numberNeeded: waitFor, destination: key,
                            misc: {waitFor: waitFor, boosts: labBoosts},
                            closestRoom: true,
                            operation: 'roomDenial'
                        });
                    }
                } else {
                    // Intel says no towers. Do not send a naked longbow into a
                    // possible bunker — scout until vision converts to guard.
                    operation.boosts = undefined;
                    operation.optionalBoosts = undefined;
                    clearOpQueueRole('longbow', key, 'roomDenial');
                    clearOpQueueRole('longbowSquad', key, 'roomDenial');
                    queueCreepIfNeeded({
                        role: 'scout',
                        priority: 1,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true
                    });
                }
                if (operation.claimAttacker) {
                    queueCreepIfNeeded({
                        role: 'claimAttacker',
                        priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'roomDenial'
                    });
                }
                if (operation.cleaner) {
                    queueCreepIfNeeded({
                        role: 'cleaner',
                        priority,
                        numberNeeded: 2,
                        destination: key,
                        closestRoom: true,
                        operation: 'roomDenial'
                    });
                }
                break;
            case 'claimClear':
                queueCreepIfNeeded({
                    role: 'claimer',
                    priority,
                    numberNeeded: 1,
                    destination: key,
                    closestRoom: true,
                    operation: 'claimClear'
                });
                break;
            case 'guard':
                clearOpQueueRole('longbow', key, 'roomDenial');
                clearOpQueueRole('longbowSquad', key, 'roomDenial');
                if (opLevel <= 1) {
                    queueCreepIfNeeded({
                        role: 'longbow',
                        priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'guard'
                    });
                } else if (opLevel > 1) {
                    operation.boosts = [HEAL];
                    operation.optionalBoosts = SIEGE_OPTIONAL_BOOSTS.slice();
                    queueCreepIfNeeded({
                        role: 'longbowSquad', priority, numberNeeded: 2, destination: key,
                        misc: {waitFor: 2, boosts: [RANGED_ATTACK, HEAL, MOVE]}, closestRoom: true, operation: 'guard'
                    });
                }
                if (operation.claimAttacker) {
                    queueCreepIfNeeded({
                        role: 'claimAttacker',
                        priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'guard'
                    });
                }
                break;
            case 'stronghold': {
                const shBoosts = siegeLabBoosts();
                operation.boosts = SIEGE_REQUIRED_BOOSTS.slice();
                operation.optionalBoosts = SIEGE_OPTIONAL_BOOSTS.slice();
                const shTowers = (intel && intel.towers) || 0;
                const shDamage = getSiegeTowerDamage(intel) || shTowers * 600;
                // Auto-open is 1–3 towers at RCL 8 T3. A duo tanks 1800 dump
                // (3×600); only 4+ or operated 3-tower dumps need a quad.
                const shWaitFor = (shTowers >= 4 || shDamage > 1800) ? 4 : 2;
                if (shWaitFor < 4) clearOpQueueRole('longbowSquad', key, 'stronghold');
                queueCreepIfNeeded({
                    role: 'longbowSquad',
                    priority,
                    numberNeeded: shWaitFor,
                    destination: key,
                    closestRoom: true,
                    operation: 'stronghold',
                    misc: {waitFor: shWaitFor, boosts: shBoosts}
                });
                if (operation.loot) queueCreepIfNeeded({
                    role: 'remoteHauler',
                    priority,
                    numberNeeded: 2,
                    destination: key,
                    closestRoom: true,
                    operation: 'roomDenial'
                });
                break;
            }
        }
    }

    resolvePendingAssignments(true);
}

const POWER_HEALERS_PER_ATTACKER = 2;
const POWER_HAULER_CARRY = 1250;

function powerHaulerCount(operation, key) {
    if (operation.haulers) return operation.haulers;
    const amount = operation.powerAmount || (INTEL[key] && INTEL[key].powerAmount) || 0;
    return Math.max(1, Math.ceil(amount / POWER_HAULER_CARRY));
}

function powerHitsLeft(operation, key) {
    const room = Game.rooms[key];
    if (room) {
        const bank = room.impassibleStructures.find(s => s.structureType === STRUCTURE_POWER_BANK);
        if (!bank) return 0;
        return bank.hits;
    }
    const intel = INTEL[key];
    if (intel && intel.powerHits != null) return intel.powerHits;
    return typeof POWER_BANK_HITS !== 'undefined' ? POWER_BANK_HITS : 2000000;
}

function powerLiveDps(key, operation) {
    const room = Game.rooms[key];
    let dps = 0;
    if (room) {
        const creeps = room.myCreeps || [];
        for (let i = 0; i < creeps.length; i++) {
            const c = creeps[i];
            if (!c.memory || c.memory.role !== 'powerAttacker') continue;
            dps += abilityPower(c.body).meleeAttack || 0;
        }
    }
    if (!dps) dps = (operation.space || 1) * 25 * ATTACK_POWER;
    return dps;
}

function powerHaulersDue(operation, key) {
    if (operation.complete) return true;
    const hits = powerHitsLeft(operation, key);
    if (!hits) return true;
    const dist = findClosestOwnedRoom(key, true) || 8;
    const eta = dist * 50 + 200;
    return hits / powerLiveDps(key, operation) <= eta;
}

function queuePowerOperation(operation, key, priority) {
    const hits = powerHitsLeft(operation, key);
    if (!operation.complete && hits > 80000) {
        const attackers = Math.max(1, operation.space || 1);
        queueCreepIfNeeded({
            role: 'powerHealer',
            priority,
            numberNeeded: attackers * POWER_HEALERS_PER_ATTACKER,
            destination: key,
            misc: {boosts: [HEAL]},
            closestRoom: true
        });
        queueCreepIfNeeded({
            role: 'powerAttacker',
            priority: priority - 1,
            numberNeeded: attackers,
            destination: key,
            closestRoom: true
        });
    }
    if (powerHaulersDue(operation, key)) {
        queueCreepIfNeeded({
            role: 'powerHauler',
            priority,
            numberNeeded: powerHaulerCount(operation, key),
            destination: key,
            closestRoom: true
        });
    }
}

module.exports = {globalCreepQueue};
