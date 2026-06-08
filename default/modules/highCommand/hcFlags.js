/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Manual flag processing and flag-triggered nukes.

 */


const {getLoadedNukers, pickLauncher, executeNukeLaunch} = require('hcNukes');


function manualAttacks() {
    for (let name in Game.flags) {
        const flag = Game.flags[name];
        const roomName = flag.pos.roomName;
        const operation = name.replace(/[^a-z]/gi, '');
        const tick = Game.time;

        if (operation.toLowerCase() === 'd') continue;

        if (operation.toLowerCase() === 'test') {
            const testRoom = Game.rooms[roomName];
            if (!testRoom) {
                removeFlagAndLog('Test flag removed — room ' + roomLink(roomName) + ' not visible.');
                continue;
            }
            if (!testRoom.memory.testDefense) testRoom.memory.testDefense = true;
            else testRoom.memory.testDefense = undefined;
            removeFlagAndLog('Test operation initiated in ' + roomLink(roomName));
            continue;
        }

        if (operation.includes('nuke')) {
            if (nukeFlag(flag)) {
                removeFlagAndLog('Nuke operation initiated in ' + roomLink(roomName));
            }
            continue;
        }

        if (operation.includes('assign')) {
            if (Memory.targetRooms[roomName]) Memory.targetRooms[roomName].assignedRoom = undefined;
            if (Memory.auxiliaryTargets[roomName]) Memory.auxiliaryTargets[roomName].assignedRoom = undefined;
            removeFlagAndLog('Clearing room assignment for ' + roomLink(roomName));
            continue;
        }

        if (operation.includes('cancel')) {
            delete Memory.targetRooms[roomName];
            delete Memory.auxiliaryTargets[roomName];
            removeFlagAndLog('Canceling operation in ' + roomLink(roomName) + ' at your request.');
            continue;
        }

        if (operation.includes('noRemote')) {
            Memory.avoidRemotes = Memory.avoidRemotes || [];
            if (!Memory.avoidRemotes.includes(roomName)) Memory.avoidRemotes.push(roomName);
            log.a(roomLink(roomName) + ' will not be remote mined.');
            removeFlagAndLog('');
            continue;
        }

        if (operation.includes('avoid')) {
            Memory.avoidRooms = Memory.avoidRooms || [];
            if (!Memory.avoidRooms.includes(roomName)) Memory.avoidRooms.push(roomName);
            log.a(roomLink(roomName) + ' will be avoided.');
            removeFlagAndLog('');
            continue;
        }

        if (operation.includes('ignore')) {
            Memory.nonCombatRooms = Memory.nonCombatRooms || [];
            if (!Memory.nonCombatRooms.includes(roomName)) Memory.nonCombatRooms.push(roomName);
            log.a(roomName + ' added as a non combat target.');
            removeFlagAndLog('');
            continue;
        }

        if (operation.includes('observe')) {
            if (!Memory.observerState) Memory.observerState = {};
            Memory.observerState.manualTarget = roomName;
            delete Memory.observerState.manualHandler;
            delete Memory.observerState.manualHandlerTick;
            Memory.observeRoom = undefined;
            removeFlagAndLog('Observing ' + roomLink(roomName) + ' at your request.');
            continue;
        }

        if (operation.includes('remove')) {
            let removed = false;
            if (Memory.avoidRooms && _.includes(Memory.avoidRooms, roomName)) {
                Memory.avoidRooms = _.filter(Memory.avoidRooms, r => r !== roomName);
                removed = true;
                log.a(roomLink(roomName) + ' will no longer be avoided.');
            } else if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, roomName)) {
                Memory.avoidRemotes = _.filter(Memory.avoidRemotes, r => r !== roomName);
                removed = true;
                log.a(roomLink(roomName) + ' will no longer be avoided.');
            } else if (Memory.nonCombatRooms && _.includes(Memory.nonCombatRooms, roomName)) {
                Memory.nonCombatRooms = _.filter(Memory.nonCombatRooms, r => r !== roomName);
                removed = true;
                log.a(roomLink(roomName) + ' removed as a non combat target.');
            }
            if (!removed) log.a(roomLink(roomName) + ' is not on any avoid lists.');
            removeFlagAndLog('');
            continue;
        }

        if (operation.includes('abandon')) {
            abandonRoom(Game.rooms[roomName]);
            removeFlagAndLog('Abandoning room ' + roomLink(roomName));
            continue;
        }

        if (['clear', 'clean', 'claim', 'rebuild', 'robbery'].includes(operation)) {
            Memory.auxiliaryTargets[roomName] = {tick, type: operation, level: 1, manual: true};
            removeFlagAndLog('Manual ' + operation + ' task in ' + roomLink(roomName) + ' has been initiated.');
        } else {
            Memory.targetRooms[roomName] = {tick, type: operation, level: 1, manual: true};
            removeFlagAndLog('Manual ' + operation + ' task in ' + roomLink(roomName) + ' has been initiated.');
        }

        function removeFlagAndLog(message) {
            log.a(message, 'HIGH COMMAND: ');
            flag.remove();
        }
    }
}

function nukeFlag(flag) {
    const roomName = flag.pos.roomName;
    const nuker = pickLauncher(getLoadedNukers(), roomName);

    if (!nuker) {
        log.a('Nuke request for ' + roomLink(roomName) + ' denied — no nukers in range.');
        return false;
    }

    const intel = INTEL[roomName] || {name: roomName};
    if (!executeNukeLaunch(nuker, intel, {
        targetPos: flag.pos,
        logLabel: 'Manual nuke',
    })) return false;

    log.a('NUCLEAR LAUNCH DETECTED — ' + roomLink(roomName) + ' has a nuke inbound from ' + roomLink(nuker.room.name) + ' (impact in 50,000 ticks).', 'HIGH COMMAND: ');
    return true;
}

module.exports = {

    manualAttacks,

    nukeFlag,

};