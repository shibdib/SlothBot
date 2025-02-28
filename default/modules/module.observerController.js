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

        // Handle the actual observing
        if (observedRooms[roomName]) observer.operationPlanner(Game.rooms[observedRooms[roomName]]);
        observedRooms[roomName] = undefined;

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
            if (Memory.observeRoom === observedRooms[roomName]) {
                log.a(`${roomName} is done observing ${Memory.observeRoom} and will now observe randomly.`);
                Memory.observeRoom = undefined;
                observedRooms[roomName] = undefined;
            } else {
                observedRooms[roomName] = Memory.observeRoom;
                return true;
            }
        }
        return false;
    }

    selectObservationTarget(roomName, currentTime) {
        return this.findStrategicTarget(roomName, currentTime) || this.findRandomTarget(roomName, currentTime);
    }

    findStrategicTarget(roomName, currentTime) {
        return;
        return Object.keys(Memory.targetRooms).find(room =>
            Memory.targetRooms[room] && (Memory.targetRooms[room].type === 'scout' ||
                (!INTEL[room].lastObservation || INTEL[room].lastObservation + 50 < currentTime)) &&
            Game.map.getRoomLinearDistance(roomName, room) <= OBSERVER_RANGE
        );
    }

    findRandomTarget(roomName, currentTime) {
        // Parse base coordinates
        const [, eW, xStr, nS, yStr] = roomName.match(/^([EW])(\d+)([NS])(\d+)$/);
        const baseX = (eW === 'W' ? -1 : 1) * (xStr | 0);
        const baseY = (nS === 'N' ? -1 : 1) * (yStr | 0);
        const RANGE = OBSERVER_RANGE;
        const directions = [
            // Ring 1 (distance 1)
            [1, 0], [0, 1], [-1, 0], [0, -1],  // Cardinals
            [1, 1], [-1, 1], [-1, -1], [1, -1],  // Diagonals
            // Ring 2 (distance 2)
            [2, 0], [0, 2], [-2, 0], [0, -2],  // Cardinals
            [2, 1], [1, 2], [-1, 2], [-2, 1],  // Primary diagonals
            [2, -1], [1, -2], [-1, -2], [-2, -1],  // Secondary diagonals
            // Ring 3 (distance 3)
            [3, 0], [0, 3], [-3, 0], [0, -3],  // Cardinals
            [3, 1], [1, 3], [-1, 3], [-3, 1],  // Primary diagonals
            [3, -1], [1, -3], [-1, -3], [-3, -1],  // Secondary diagonals
            [2, 2], [-2, 2], [-2, -2], [2, -2],  // Corner diagonals
            // Ring 4 (distance 4)
            [4, 0], [0, 4], [-4, 0], [0, -4],  // Cardinals
            [4, 1], [1, 4], [-1, 4], [-4, 1],  // Primary diagonals
            [4, -1], [1, -4], [-1, -4], [-4, -1],  // Secondary diagonals
            // Ring 5 (distance 5)
            [5, 0], [0, 5], [-5, 0], [0, -5],  // Cardinals
            [5, 1], [1, 5], [-1, 5], [-5, 1],  // Primary diagonals
            [5, -1], [1, -5], [-1, -5], [-5, -1],  // Secondary diagonals
            [4, 2], [2, 4], [-2, 4], [-4, 2],  // Intermediate diagonals
            [4, -2], [2, -4], [-2, -4], [-4, -2],  // Intermediate diagonals
            [3, 3], [-3, 3], [-3, -3], [3, -3],  // Corner diagonals
            // Ring 6 (distance 6)
            [6, 0], [0, 6], [-6, 0], [0, -6],  // Cardinals
            [6, 1], [1, 6], [-1, 6], [-6, 1],  // Primary diagonals
            [6, -1], [1, -6], [-1, -6], [-6, -1],  // Secondary diagonals
            [5, 2], [2, 5], [-2, 5], [-5, 2],  // Intermediate diagonals
            [5, -2], [2, -5], [-2, -5], [-5, -2]  // Intermediate diagonals
        ];
        for (let [dx, dy] of directions) {
            if (Math.abs(dx) > RANGE || Math.abs(dy) > RANGE) continue;
            if (dx * dx + dy * dy > RANGE * RANGE) continue;
            const newX = baseX + dx;
            const newY = baseY + dy;
            const target = `${newX >= 0 ? 'E' : 'W'}${Math.abs(newX)}${newY >= 0 ? 'S' : 'N'}${Math.abs(newY)}`;
            if ((!INTEL[target] || INTEL[target].lastObservation + 50 <= currentTime) &&
                roomStatus(target) !== 'closed') {
                return target;
            }
        }
        return null;
    }

    observeRoom(observer, roomName, targetRoom, currentTime) {
        observer.observeRoom(targetRoom);
        observedRooms[roomName] = targetRoom;
    }
}

profiler.registerClass(ObserverControl, 'ObserverControl');
module.exports = ObserverControl;