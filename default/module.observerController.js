/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
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
                console.log(`${roomName} is done observing ${Memory.observeRoom} and will now observe randomly.`);
                Memory.observeRoom = undefined;
            }
            observedRooms[roomName] = undefined;
            return true;
        }
        return false;
    }

    selectObservationTarget(roomName, currentTime) {
        // Check for manual observation request
        if (Memory.observeRoom && Game.map.getRoomLinearDistance(roomName, Memory.observeRoom) <= OBSERVER_RANGE) {
            return Memory.observeRoom;
        }

        // Strategic observation
        return this.findStrategicTarget(roomName, currentTime) || this.findRandomTarget(roomName, currentTime);
    }

    findStrategicTarget(roomName, currentTime) {
        return Object.keys(Memory.targetRooms).find(room =>
            (Memory.targetRooms[room].type === 'scout' ||
                (!Memory.targetRooms[room].observerCheck || Memory.targetRooms[room].observerCheck + 50 < currentTime)) &&
            Game.map.getRoomLinearDistance(roomName, room) <= OBSERVER_RANGE
        );
    }

    findRandomTarget(roomName, currentTime) {
        const [x, y] = roomName.match(/\d+/g).map(Number);
        const [eW, nS] = roomName.replace(/[0-9]/g, '').split('');
        for (let attempts = 0; attempts < 10; attempts++) {
            const newX = x + Math.floor(Math.random() * 11) * (Math.random() < 0.5 ? -1 : 1);
            const newY = y + Math.floor(Math.random() * 11) * (Math.random() < 0.5 ? -1 : 1);

            const directionX = newX < 0 ? 'W' : 'E';
            const directionY = newY < 0 ? 'S' : 'N';
            const targetRoom = `${directionX}${Math.abs(newX)}${directionY}${Math.abs(newY)}`;

            if (Game.map.getRoomLinearDistance(roomName, targetRoom) <= OBSERVER_RANGE &&
                (!INTEL[targetRoom] || INTEL[targetRoom].tick > currentTime - 50) &&
                roomStatus(targetRoom) !== 'closed') {
                return targetRoom;
            }
        }
        return null; // No valid random target found
    }

    observeRoom(observer, roomName, targetRoom, currentTime) {
        observer.observeRoom(targetRoom);
        observedRooms[roomName] = targetRoom;
        if (Memory.targetRooms[targetRoom]) {
            Memory.targetRooms[targetRoom].observerCheck = currentTime;
        }
    }
}

module.exports = ObserverControl;