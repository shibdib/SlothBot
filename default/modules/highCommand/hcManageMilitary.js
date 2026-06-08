/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Active military target lifecycle management.

 */


const state = require('hcState');

const {intelOwner, checkForNap} = require('hcUtils');

function manageMilitary() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;

    const warTargetUsers = new Set(WAR_TARGETS.map(t => t.user));

    let activeNonSiege = 0, activeSiege = 0;
    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op) continue;
        if (op.type === 'roomDenial' || op.dDay) activeSiege++;
        else if (!['stronghold', 'nukes'].includes(op.type)) activeNonSiege++;
    }

    const operationLimit = state.OPERATION_LIMIT + 1;

    for (const key in Memory.targetRooms) {
        const target = Memory.targetRooms[key];
        if (!target || target.manual) continue;

        let type = target.type;
        let staleMulti = 1;

        if (target.dDay && target.dDay - 50 <= Game.time) {
            target.type = 'scout';
            target.tick = Game.time;
            target.dDay = undefined;
            log.a(`${roomLink(key)} d-day expired â€” switching to scout.`, 'HIGH COMMAND: ');
            continue;
        }

        switch (type) {
            case 'test':
                continue;

            case 'roomDenial':
                if (target.camping) staleMulti = 9999;
                else staleMulti = 5;

                if (activeSiege > state.SIEGE_LIMIT || !INTEL[key] || FRIENDLIES.includes(INTEL[key].owner) || !warTargetUsers.has(INTEL[key].owner)) {
                    log.a(`Canceling roomDenial in ${roomLink(key)} â€” too many sieges or non-hostile.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeSiege--;
                    if (INTEL[key]) INTEL[key].lastSiege = Game.time;
                    continue;
                }
                break;

            case 'harass':
            case 'remoteDenial':
                if (target.dDay) staleMulti = SAFE_MODE_DURATION;
                if (activeNonSiege > operationLimit) {
                    log.a(`Canceling ${type} in ${roomLink(key)} â€” too many operations.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    if (INTEL[key]) INTEL[key].lastOperation = Game.time;
                    continue;
                }
                if (!INTEL[key] || FRIENDLIES.includes(INTEL[key].owner) || !warTargetUsers.has(INTEL[key].owner)) {
                    log.a(`Canceling ${type} in ${roomLink(key)} â€” not a war target.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    if (INTEL[key]) INTEL[key].lastOperation = Game.time;
                    continue;
                }
                break;

            case 'guard':
                staleMulti *= (target.level + 1);
                if (activeNonSiege > operationLimit) {
                    log.a(`Canceling guard in ${roomLink(key)} â€” too many operations.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    if (INTEL[key]) INTEL[key].lastOperation = Game.time;
                    continue;
                }
                break;

            case 'stronghold':
                staleMulti = 5;
                if (!INTEL[key] || !INTEL[key].invaderCore || INTEL[key].invaderCore < Game.time) {
                    log.a(`Canceling stronghold in ${roomLink(key)} â€” core gone.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    if (INTEL[key]) INTEL[key].lastOperation = Game.time;
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
            log.a(`Canceling operation in ${roomLink(key)} â€” manual non-combat room.`, 'HIGH COMMAND: ');
            continue;
        }

        if (!INTEL[key]) {
            if (Game.rooms[key]) Game.rooms[key].cacheRoomIntel();
            else if (type !== 'scout') {
                log.a(`Canceling operation in ${roomLink(key)} â€” no intel.`, 'HIGH COMMAND: ');
                delete Memory.targetRooms[key];
                continue;
            }
        }

        const owner = intelOwner(INTEL[key]);
        if (!target.manual && owner && userStrength(owner) > (global.MY_STRENGTH || MAX_LEVEL) + 2) {
            log.a(`Canceling operation in ${roomLink(key)} â€” ${owner} too strong.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            INTEL[key].lastOperation = Game.time;
            INTEL[key].lastSiege = Game.time;
            continue;
        }

        const staleTime = target.tick + (CREEP_LIFE_TIME * staleMulti);
        const lastKill = target.lastEnemyKilled;
        if ((staleTime < Game.time && !lastKill) || (lastKill && lastKill.deathTime + (CREEP_LIFE_TIME * staleMulti) < Game.time)) {
            log.a(`Canceling operation in ${roomLink(key)} â€” stale.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            if (INTEL[key]) INTEL[key].lastOperation = Game.time;
            continue;
        }

        if (owner === MY_USERNAME && type !== 'guard') {
            log.a(`Canceling operation in ${roomLink(key)} â€” targeting our own room.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        if (owner && (FRIENDLIES.includes(owner) || checkForNap(owner)) && type !== 'guard') {
            log.a(`Canceling operation in ${roomLink(key)} â€” allied/NAP room.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        if (type !== 'scout' && type !== 'guard' && type !== 'roomDenial' && owner &&
            !THREATS.includes(owner) && findClosestOwnedRoom(key, true) > DEFENSIVE_BUBBLE &&
            !_.pluck(WAR_TARGETS, 'user').includes(owner)) {
            log.a(`Canceling operation in ${roomLink(key)} â€” ${owner} no longer a threat.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            INTEL[key].lastOperation = Game.time;
            INTEL[key].lastSiege = Game.time;
            continue;
        }

        if (target.waves && target.waves >= (target.waveLimit || 8)) {
            log.a(`Canceling operation in ${roomLink(key)} â€” max waves reached.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            if (INTEL[key]) {
                INTEL[key].lastOperation = Game.time;
                INTEL[key].lastSiege = Game.time;
            }
            continue;
        }

        if (target.friendlyDead && target.tick + CREEP_LIFE_TIME < Game.time) {
            const ratio = target.friendlyDead / (target.enemyDead || 100);
            if (ratio > 2 && target.friendlyDead > 5000) {
                log.a(`Canceling operation in ${roomLink(key)} â€” unsustainable casualties (${ratio.toFixed(2)}).`, 'HIGH COMMAND: ');
                delete Memory.targetRooms[key];
                if (INTEL[key]) {
                    INTEL[key].lastOperation = Game.time;
                    INTEL[key].lastSiege = Game.time;
                }
                continue;
            }
        }
    }
}

module.exports = {

    manageMilitary,

};