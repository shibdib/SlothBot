/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Active military target lifecycle management.
 */

const state = require('hcState');
const {
    intelOwner,
    checkForNap,
    empireDistance,
    SIEGE_RING,
    minEmpireDist,
    warTargetUserSet,
} = require('hcUtils');
const {stampOperationCooldown} = require('hcTargets');
const {notifySiegeEnd} = require('module.notifications');
const {tryOffensiveNuke, beginNukeFollowUp, hasPendingNuke} = require('hcNukes');

function manageMilitary() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;

    const warTargetUsers = warTargetUserSet();

    let activeNonSiege = 0, activeSiege = 0;
    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op) continue;
        if (op.type === 'roomDenial' || op.dDay) activeSiege++;
        else if (!['stronghold', 'nukes'].includes(op.type)) activeNonSiege++;
    }

    const operationLimit = state.OPERATION_LIMIT + 1;

    if (activeSiege > state.SIEGE_LIMIT) {
        activeSiege = trimExcessSieges(activeSiege);
    }
    activeSiege = trimOutsideSiegeRing(activeSiege, warTargetUsers);

    for (const key in Memory.targetRooms) {
        const target = Memory.targetRooms[key];
        if (!target || target.manual) continue;

        let type = target.type;
        let staleMulti = 1;
        const nukePending = hasPendingNuke(target);

        if (target.nukeLaunched && type === 'roomDenial' && target.dDay &&
            target.dDay - CREEP_LIFE_TIME <= Game.time) {
            if (beginNukeFollowUp(target)) {
                log.a(`${roomLink(key)} nuke follow-up — forming for impact in ${target.dDay - Game.time} ticks.`, 'HIGH COMMAND: ');
            }
        }

        if (target.dDay && target.dDay <= Game.time) {
            target.dDay = undefined;
            if (target.nukeLaunched && type !== 'roomDenial') {
                target.type = 'scout';
                target.tick = Game.time;
                log.a(`${roomLink(key)} nuke landed — switching to scout.`, 'HIGH COMMAND: ');
                continue;
            }
        } else if (target.dDay && !target.nukeLaunched && target.dDay - 50 <= Game.time) {
            target.type = 'scout';
            target.tick = Game.time;
            target.dDay = undefined;
            log.a(`${roomLink(key)} d-day expired — switching to scout.`, 'HIGH COMMAND: ');
            continue;
        }

        switch (type) {
            case 'test':
                continue;

            case 'roomDenial':
                if (target.camping) staleMulti = 9999;
                else staleMulti = 8;

                if (INTEL[key] && FRIENDLIES.includes(INTEL[key].owner)) {
                    log.a(`Canceling roomDenial in ${roomLink(key)} — too many sieges or non-hostile.`, 'HIGH COMMAND: ');
                    stampOperationCooldown(key, target);
                    delete Memory.targetRooms[key];
                    activeSiege--;
                    continue;
                }
                if (!nukePending && (!INTEL[key] || !warTargetUsers.has(INTEL[key].owner))) {
                    log.a(`Canceling roomDenial in ${roomLink(key)} — too many sieges or non-hostile.`, 'HIGH COMMAND: ');
                    stampOperationCooldown(key, target);
                    delete Memory.targetRooms[key];
                    activeSiege--;
                    continue;
                }
                break;

            case 'harass':
            case 'remoteDenial':
                if (target.dDay) staleMulti = SAFE_MODE_DURATION;
                if (!nukePending && activeNonSiege > operationLimit) {
                    log.a(`Canceling ${type} in ${roomLink(key)} — too many operations.`, 'HIGH COMMAND: ');
                    stampOperationCooldown(key, target);
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    continue;
                }
                if (INTEL[key] && FRIENDLIES.includes(INTEL[key].owner)) {
                    log.a(`Canceling ${type} in ${roomLink(key)} — not a war target.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    continue;
                }
                if (!nukePending && (!INTEL[key] || !warTargetUsers.has(INTEL[key].owner))) {
                    log.a(`Canceling ${type} in ${roomLink(key)} — not a war target.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    continue;
                }
                break;

            case 'guard':
                staleMulti *= (target.level + 1);
                if (target.camping) {
                    staleMulti = 9999;
                    const campIntel = INTEL[key];
                    if (campIntel && (!campIntel.owner || FRIENDLIES.includes(campIntel.owner))) {
                        log.a(`Canceling guard in ${roomLink(key)} — room is no longer owned.`, 'HIGH COMMAND: ');
                        notifySiegeEnd(key, 'SUCCESS', target);
                        delete Memory.targetRooms[key];
                        activeNonSiege--;
                        continue;
                    }
                    break;
                }
                if (activeNonSiege > operationLimit) {
                    log.a(`Canceling guard in ${roomLink(key)} — too many operations.`, 'HIGH COMMAND: ');
                    stampOperationCooldown(key, target);
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    continue;
                }
                // Occupy of an owned room drops when diplomacy moves on. Unowned
                // sit-guards (scout fallback) have no owner and stay until stale.
                if (INTEL[key] && INTEL[key].owner
                    && !FRIENDLIES.includes(INTEL[key].owner)
                    && !warTargetUsers.has(INTEL[key].owner)) {
                    log.a(`Canceling guard in ${roomLink(key)} — not a war target.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    continue;
                }
                break;

            case 'stronghold':
                staleMulti = 5;
                if (!INTEL[key] || !INTEL[key].invaderCore || INTEL[key].invaderCore < Game.time) {
                    log.a(`Canceling stronghold in ${roomLink(key)} — core gone.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    continue;
                }
                if (INTEL[key].invaderCoreInvuln && INTEL[key].invaderCoreInvuln > Game.time) {
                    log.a(`Canceling stronghold in ${roomLink(key)} — core invulnerable.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    continue;
                }
                break;

            case 'power':
            case 'poke':
            case 'commodity':
            case 'claimClear':
            case 'score':
            case 'scoreCleaner':
            case 'claim':
                delete Memory.targetRooms[key];
                continue;
        }

        if (_.includes(Memory.nonCombatRooms, key)) {
            delete Memory.targetRooms[key];
            log.a(`Canceling operation in ${roomLink(key)} — manual non-combat room.`, 'HIGH COMMAND: ');
            continue;
        }

        const occupyHold = type === 'guard' && target.camping;

        if (!INTEL[key]) {
            if (Game.rooms[key]) Game.rooms[key].cacheRoomIntel();
            else if (type !== 'scout' && !occupyHold && !nukePending) {
                log.a(`Canceling operation in ${roomLink(key)} — no intel.`, 'HIGH COMMAND: ');
                delete Memory.targetRooms[key];
                continue;
            }
        }

        const owner = intelOwner(INTEL[key]);

        const staleWindow = CREEP_LIFE_TIME * staleMulti;
        const lastKill = target.lastEnemyKilled;
        const lastKillTime = lastKill && lastKill.deathTime;
        const lastActivity = Math.max(target.tick || 0, lastKillTime || 0, target.lastWave || 0);
        if (!occupyHold && !nukePending && lastActivity + staleWindow < Game.time) {
            log.a(`Canceling operation in ${roomLink(key)} — stale.`, 'HIGH COMMAND: ');
            stampOperationCooldown(key, target);
            delete Memory.targetRooms[key];
            continue;
        }

        if (owner === MY_USERNAME && !(target.manual && type === 'guard')) {
            log.a(`Canceling operation in ${roomLink(key)} — targeting our own room.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        if (owner && (FRIENDLIES.includes(owner) || checkForNap(owner)) && !(target.manual && type === 'guard')) {
            log.a(`Canceling operation in ${roomLink(key)} — allied/NAP room.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        if (type !== 'scout' && type !== 'guard' && type !== 'roomDenial' && owner &&
            !THREATS.includes(owner) && empireDistance(key) > DEFENSIVE_BUBBLE &&
            !_.pluck(WAR_TARGETS, 'user').includes(owner)) {
            log.a(`Canceling operation in ${roomLink(key)} — ${owner} no longer a threat.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        if (!occupyHold && !nukePending && target.waves && target.waves >= (target.waveLimit || (type === 'roomDenial' ? 12 : 8))) {
            if (type === 'roomDenial' && tryOffensiveNuke(key)) continue;
            log.a(`Canceling operation in ${roomLink(key)} — max waves reached.`, 'HIGH COMMAND: ');
            stampOperationCooldown(key, target);
            delete Memory.targetRooms[key];
            continue;
        }

        if (!occupyHold && !nukePending && target.friendlyDead && target.tick + CREEP_LIFE_TIME < Game.time) {
            const ratio = target.friendlyDead / (target.enemyDead || 100);
            if (ratio > 2 && target.friendlyDead > 5000) {
                if (type === 'roomDenial' && OFFENSIVE_NUKES && !target.camping) continue;
                log.a(`Canceling operation in ${roomLink(key)} — unsustainable casualties (${ratio.toFixed(2)}).`, 'HIGH COMMAND: ');
                stampOperationCooldown(key, target);
                delete Memory.targetRooms[key];
                continue;
            }
        }
    }
}

function trimOutsideSiegeRing(activeSiege, warTargetUsers) {
    if (!warTargetUsers || !warTargetUsers.size) return activeSiege;
    const dMin = minEmpireDist(warTargetUsers);
    if (!Number.isFinite(dMin)) return activeSiege;
    const cap = dMin + SIEGE_RING;
    const inRing = [];
    const outRing = [];
    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op || op.manual || op.type !== 'roomDenial') continue;
        if (hasPendingNuke(op)) continue;
        const dist = empireDistance(key);
        if (dist <= cap) inRing.push({key, op, dist});
        else outRing.push({key, op, dist});
    }
    outRing.sort((a, b) => a.dist - b.dist);
    const keepStretch = inRing.length ? 0 : 1;
    for (let i = keepStretch; i < outRing.length; i++) {
        const s = outRing[i];
        log.a(`Canceling roomDenial in ${roomLink(s.key)} — outside siege ring.`, 'HIGH COMMAND: ');
        stampOperationCooldown(s.key, s.op);
        delete Memory.targetRooms[s.key];
        activeSiege--;
    }
    return activeSiege;
}

function trimExcessSieges(activeSiege) {
    if (activeSiege <= state.SIEGE_LIMIT) return activeSiege;
    const sieges = [];
    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op || op.manual || op.type !== 'roomDenial') continue;
        if (hasPendingNuke(op)) continue;
        sieges.push({key, op, dist: empireDistance(key)});
    }
    sieges.sort((a, b) => b.dist - a.dist);
    for (let i = 0; i < sieges.length && activeSiege > state.SIEGE_LIMIT; i++) {
        const s = sieges[i];
        log.a(`Canceling roomDenial in ${roomLink(s.key)} — over siege limit.`, 'HIGH COMMAND: ');
        stampOperationCooldown(s.key, s.op);
        delete Memory.targetRooms[s.key];
        activeSiege--;
    }
    return activeSiege;
}

module.exports = {
    manageMilitary,
};
