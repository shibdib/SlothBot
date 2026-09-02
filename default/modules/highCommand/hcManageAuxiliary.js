/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Active auxiliary target lifecycle management.

 */


function powerTeamInRoom(roomName) {
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory || c.memory.destination !== roomName) continue;
        if (c.memory.role === 'powerAttacker' || c.memory.role === 'powerHealer') return true;
    }
    return false;
}

function powerHaulersAssigned(roomName) {
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (c.my && c.memory && c.memory.role === 'powerHauler' && c.memory.destination === roomName) return true;
    }
    return false;
}

function roomHasPowerLoot(room) {
    if (!room) return false;
    const drops = room.droppedResources || [];
    for (let i = 0; i < drops.length; i++) {
        if (drops[i].resourceType === RESOURCE_POWER && drops[i].amount) return true;
    }
    const tombs = room.tombstones || [];
    for (let i = 0; i < tombs.length; i++) {
        if (tombs[i].store[RESOURCE_POWER]) return true;
    }
    const ruins = room.ruins || [];
    for (let i = 0; i < ruins.length; i++) {
        if (ruins[i].store && ruins[i].store[RESOURCE_POWER]) return true;
    }
    return false;
}

function manageAuxiliary() {
    if (!Memory.auxiliaryTargets || !_.size(Memory.auxiliaryTargets)) return;

    for (const key in Memory.auxiliaryTargets) {
        const target = Memory.auxiliaryTargets[key];
        if (!target) continue;

        const type = target.type;

        if (!INTEL[key]) {
            if (Game.rooms[key]) Game.rooms[key].cacheRoomIntel();
            else if (!target.manual) {
                log.a(`Canceling auxiliary op in ${roomLink(key)} â€” no intel.`, 'HIGH COMMAND: ');
                delete Memory.auxiliaryTargets[key];
                continue;
            }
        }

        if (_.includes(Memory.nonCombatRooms, key)) {
            delete Memory.auxiliaryTargets[key];
            log.a(`Canceling auxiliary op in ${roomLink(key)} â€” manual non-combat room.`, 'HIGH COMMAND: ');
            continue;
        }

        switch (type) {
            case 'power':
                if (target.complete) {
                    const vis = Game.rooms[key];
                    const lootLeft = vis && (roomHasPowerLoot(vis) ||
                        vis.impassibleStructures.some(s => s.structureType === STRUCTURE_POWER_BANK));
                    if ((vis && !lootLeft && !powerHaulersAssigned(key)) ||
                        (target.completeTick || target.tick) + CREEP_LIFE_TIME < Game.time) {
                        log.a(`Canceling power mining in ${roomLink(key)} â€” haul complete.`, 'HIGH COMMAND: ');
                        delete Memory.auxiliaryTargets[key];
                    }
                    continue;
                }
                const teamHere = powerTeamInRoom(key);
                if (!INTEL[key] || !INTEL[key].power || INTEL[key].power <= Game.time) {
                    target.complete = true;
                    target.completeTick = Game.time;
                    continue;
                }
                if (INTEL[key].power - 100 < Game.time && !teamHere) {
                    log.a(`Canceling power mining in ${roomLink(key)} â€” expiring.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (INTEL[key].powerMined && !teamHere) {
                    log.a(`Canceling power mining in ${roomLink(key)} â€” already being mined.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (!teamHere && getResourceTotal(RESOURCE_POWER) >= DUMP_AMOUNT) {
                    log.a(`Canceling power mining in ${roomLink(key)} â€” enough power.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'mineral':
                if (!INTEL[key].mineralAmount) {
                    log.a(`Canceling mineral mining in ${roomLink(key)} â€” depleted.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (INTEL[key].user && !FRIENDLIES.includes(INTEL[key].user)) {
                    log.a(`Canceling mineral mining in ${roomLink(key)} â€” occupied.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'rebuild':
                if (!MY_ROOMS.includes(key)) {
                    log.a(`Canceling rebuild in ${roomLink(key)} â€” no longer needed.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (INTEL[key].hostile) {
                    log.a(`Canceling rebuild in ${roomLink(key)} â€” under attack.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (Game.rooms[key] && !Game.rooms[key].memory.buildersNeeded) {
                    log.a(`Canceling rebuild in ${roomLink(key)} â€” rebuilt.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'commodity':
                if (MAX_LEVEL < 4) {
                    log.a(`Canceling commodity mining in ${roomLink(key)} â€” no storage.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (getResourceTotal(INTEL[key].commodity) >= DUMP_AMOUNT) {
                    log.a(`Canceling commodity mining in ${roomLink(key)} â€” enough stock.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'reactor':
                break;

            case 'claim':
            case 'claimClear':
                if (Game.gcl.level === MY_ROOMS.length) {
                    log.a(`Canceling claim in ${roomLink(key)} â€” no GCL.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (MAX_LEVEL < 4) {
                    log.a(`Canceling claim in ${roomLink(key)} â€” no RCL 4+.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;
        }

        if (target.tick + CREEP_LIFE_TIME * 3 < Game.time) {
            delete Memory.auxiliaryTargets[key];
            log.a(`Canceling auxiliary op in ${roomLink(key)} â€” stale.`, 'HIGH COMMAND: ');
        }
    }
}

module.exports = {

    manageAuxiliary,

};