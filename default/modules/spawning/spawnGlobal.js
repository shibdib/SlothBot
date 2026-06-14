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
const {queueCreepIfNeeded, pruneQueueCache} = require('spawnQueue');
const {buildOperationsSignature, pruneEmptyOperations, getPriority} = require('spawnOperations');
const {getSiegeTowerDamage} = require('module.bodyGenerator');

function queueHarassmentCreeps() {
    if (!HARASSMENT_OPERATIONS || !OFFENSIVE_OPERATIONS || !state.OFFENSIVE_ALLOWED) return;

    const readiness = state.EMPIRE_READINESS || getEmpireReadiness();
    if (!readiness.canLaunchOps || readiness.empireCritical || readiness.empireStressed) return;
    if (!THREATS || !THREATS.length) return;

    const remotePool = collectThreatRemotes();
    if (!remotePool.length) return;

    const ratio = typeof HARASSMENT_BUDGET_RATIO === 'number' ? HARASSMENT_BUDGET_RATIO : 0.15;
    const hardCap = typeof HARASSMENT_MAX === 'number' ? HARASSMENT_MAX : 3;
    const budget = Math.min(
        Math.max(1, Math.ceil(readiness.combatReady * ratio)),
        THREATS.length,
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
    const sinceReset = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
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
        }

        const opLevel = Memory.targetRooms[key] ? operation.level : operation.level || 1;
        let priority = INTEL[key] ? getPriority(key) : PRIORITIES.secondary;
        if (Memory.auxiliaryTargets[key] && operation.priority != null) {
            priority = Math.min(priority, operation.priority);
        }
        operation.priority = priority;

        if (operation.builders) {
            queueCreepIfNeeded({role: 'drone', priority: PRIORITIES.drone + 1, numberNeeded: 6, destination: key});
        }

        if (!INTEL[key] || !opLevel) {
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
                    const count = INTEL[key].threatLevel ? 4 : 2;
                    const boosts = INTEL[key].threatLevel > 2 ? [RANGED_ATTACK, HEAL] : undefined;
                    queueCreepIfNeeded({
                        role: 'longbowSquad', priority: priority + 1, numberNeeded: count, destination: key,
                        misc: {waitFor: count, boosts: boosts}, closestRoom: true
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
                if (!operation.complete) {
                    const powerSpace = operation.space || 1;
                    const powerAttacker = getCreepCount(undefined, 'powerAttacker', key);
                    queueCreepIfNeeded({
                        role: 'powerHealer', priority, numberNeeded: powerAttacker * 1.5, destination: key,
                        misc: {boosts: [HEAL]}, closestRoom: true
                    });
                    queueCreepIfNeeded({
                        role: 'powerAttacker', priority: priority - 1, numberNeeded: powerSpace, destination: key,
                        misc: {boosts: [ATTACK]}, closestRoom: true
                    });
                }
                if (operation.hauler) {
                    queueCreepIfNeeded({
                        role: 'powerHauler',
                        priority,
                        numberNeeded: operation.hauler,
                        destination: key,
                        closestRoom: true
                    });
                }
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
                const rdIntel = INTEL[key];
                const rdTowers = rdIntel && rdIntel.towers || 0;
                const rdWaves = operation.waves || 0;
                if (rdTowers) {
                    Memory.targetRooms[key].boosts = [TOUGH, HEAL];
                    const siegeDamage = getSiegeTowerDamage(rdIntel) || rdTowers * 600;
                    const useSolo = MAX_LEVEL >= 7 && siegeDamage <= 960 && !rdIntel.activeDefenders && rdWaves < 2;
                    if (useSolo) {
                        queueCreepIfNeeded({
                            role: 'longbow',
                            priority,
                            numberNeeded: 1,
                            destination: key,
                            closestRoom: true,
                            operation: 'roomDenial',
                            misc: {boosts: [TOUGH, RANGED_ATTACK, HEAL]}
                        });
                    } else {
                        // siegeDuo healer must cover two stacked bodies; multi-tower or high-DPS rooms need a squad.
                        const useSquad = rdIntel.activeDefenders || rdTowers > 1 || siegeDamage > 660 || rdWaves >= 2;
                        if (useSquad) {
                            const waitFor = (rdWaves >= 2 || siegeDamage > 960) ? 4 : 2;
                            queueCreepIfNeeded({
                                role: 'longbowSquad', priority, numberNeeded: waitFor, destination: key,
                                misc: {waitFor: waitFor, boosts: [TOUGH, RANGED_ATTACK, HEAL]},
                                closestRoom: true,
                                operation: 'roomDenial'
                            });
                        } else {
                            queueCreepIfNeeded({
                                role: 'siegeDuo',
                                priority,
                                numberNeeded: 2,
                                destination: key,
                                misc: {boosts: [TOUGH, HEAL, ATTACK]},
                                closestRoom: true,
                                operation: 'roomDenial'
                            });
                        }
                    }
                } else {
                    Memory.targetRooms[key].boosts = undefined;
                    queueCreepIfNeeded({
                        role: 'longbow',
                        priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'roomDenial'
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
                if (opLevel === 1) {
                    queueCreepIfNeeded({
                        role: 'longbow',
                        priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'guard'
                    });
                } else if (opLevel > 1) {
                    queueCreepIfNeeded({
                        role: 'longbowSquad', priority, numberNeeded: 2, destination: key,
                        misc: {waitFor: 2, boosts: [RANGED_ATTACK, HEAL]}, closestRoom: true, operation: 'guard'
                    });
                }
                break;
            case 'stronghold':
                Memory.targetRooms[key].boosts = [HEAL];
                queueCreepIfNeeded({
                    role: 'siegeDuo',
                    priority,
                    numberNeeded: opLevel * 2,
                    destination: key,
                    closestRoom: true,
                    operation: 'stronghold'
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

module.exports = {globalCreepQueue};
