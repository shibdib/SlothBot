/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
let observedRooms = {};

class ObserverControl {
    constructor() {
    }

    run(room) {
        const observer = room.impassibleStructures.find(s => s.structureType === STRUCTURE_OBSERVER);
        if (!observer) return;

        const roomName = room.name;
        const currentTime = Game.time;

        // Handle manual observation
        if (this.handleManualObservation(roomName, observer, currentTime)) return;

        // Select target for observation
        const targetRoom = this.selectObservationTarget(roomName, currentTime);

        // Observe if a target is selected
        if (targetRoom) {
            this.observeRoom(observer, roomName, targetRoom, currentTime);
        }
    }

    handleManualObservation(roomName, observer, currentTime) {
        if (Memory.observeRoom && Memory.observeRoom === observedRooms[roomName] && Game.rooms[Memory.observeRoom]) {
            Game.rooms[Memory.observeRoom].cacheRoomIntel(true);
            if (Memory.targetRooms[Memory.observeRoom]) {
                observer.operationPlanner(Game.rooms[Memory.observeRoom]);
            }
            if (Memory.observeRoom === observedRooms[roomName]) {
                log.a(`${roomName} is done observing ${Memory.observeRoom} and will now observe randomly.`);
                Memory.observeRoom = undefined;
            }
            observedRooms[roomName] = undefined;
            return true;
        }
        return false;
    }

    selectObservationTarget(roomName, currentTime) {
        // Strategic observation
        return this.findStrategicTarget(roomName, currentTime) || this.findRandomTarget(roomName, currentTime);
    }

    findStrategicTarget(roomName, currentTime) {
        return Object.keys(Memory.targetRooms).find(room =>
            Memory.targetRooms[room] && (Memory.targetRooms[room].type === 'scout' ||
                (!Memory.targetRooms[room].observerCheck || Memory.targetRooms[room].observerCheck + 50 < currentTime)) &&
            Game.map.getRoomLinearDistance(roomName, room) <= OBSERVER_RANGE
        );
    }

    findRandomTarget(roomName, currentTime) {
        const [, eW, xStr, nS, yStr] = roomName.match(/^([EW])(\d+)([NS])(\d+)$/);
        const x = (eW === 'W' ? -1 : 1) * (xStr | 0);
        const y = (nS === 'N' ? -1 : 1) * (yStr | 0);
        const timeThreshold = currentTime - 50;
        let validCount = 0;
        const len = VALID_OFFSETS.length;
        const validIndices = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            const [dx, dy] = VALID_OFFSETS[i];
            const newX = x + dx;
            const newY = y + dy;
            const room = `${DIRS.x[newX >= 0]}${Math.abs(newX)}${DIRS.y[newY >= 0]}${Math.abs(newY)}`;

            const intel = INTEL[room];
            if ((!intel || intel.tick <= timeThreshold) && roomStatus(room) !== 'closed') {
                validIndices[validCount++] = i;
            }
        }
        if (validCount === 0) return null;
        const chosenIdx = validIndices[Math.random() * validCount | 0];
        const [dx, dy] = VALID_OFFSETS[chosenIdx];
        const newX = x + dx;
        const newY = y + dy;
        return `${DIRS.x[newX >= 0]}${Math.abs(newX)}${DIRS.y[newY >= 0]}${Math.abs(newY)}`;
    }

    observeRoom(observer, roomName, targetRoom, currentTime) {
        observer.observeRoom(targetRoom);
        observedRooms[roomName] = targetRoom;
        if (Memory.targetRooms[targetRoom]) {
            Memory.targetRooms[targetRoom].observerCheck = currentTime;
        }
    }
}

const DIRS = {
    x: {true: 'E', false: 'W'},
    y: {true: 'S', false: 'N'}
};

const VALID_OFFSETS = [];
for (let dx = -OBSERVER_RANGE; dx <= OBSERVER_RANGE; dx++) {
    for (let dy = -OBSERVER_RANGE; dy <= OBSERVER_RANGE; dy++) {
        if (dx * dx + dy * dy <= OBSERVER_RANGE * OBSERVER_RANGE) {
            VALID_OFFSETS.push([dx, dy]);
        }
    }
}

profiler.registerClass(ObserverControl, 'ObserverControl');
module.exports = ObserverControl;