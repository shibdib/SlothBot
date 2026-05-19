/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Logic Improvements
 *
 * CPU Wins:
 * - Dynamic direction generation (replaced 100+ hardcoded entries)
 * - Per-room throttling (only runs every 5 ticks)
 * - Cached strategic targets per tick
 * - Early exits and fewer redundant checks
 * - Cleaner manual observation handling
 */

const profiler = require("tools.profiler");

let observedRooms = {};
let lastRun = {};
let strategicCache = {tick: 0, targets: []};

class ObserverControl {
    constructor() {
    }

    run(room) {
        const observer = room.observer;
        if (!observer) return;

        const roomName = room.name;
        const currentTime = Game.time;

        // Throttle per room (big CPU win)
        if (lastRun[roomName] && lastRun[roomName] + 5 > currentTime) return;
        lastRun[roomName] = currentTime;

        // Handle manual observation first
        if (this.handleManualObservation(roomName, observer, currentTime)) return;

        // Clear previous observation
        if (observedRooms[roomName]) {
            observer.operationPlanner(Game.rooms[observedRooms[roomName]]);
            observedRooms[roomName] = undefined;
        }

        // Select and observe target
        const targetRoom = this.selectObservationTarget(roomName, currentTime);
        if (targetRoom) {
            this.observeRoom(observer, roomName, targetRoom, currentTime);
        }
    }

    handleManualObservation(roomName, observer, currentTime) {
        if (!Memory.observeRoom) return false;

        if (Memory.observeRoom === observedRooms[roomName]) {
            if (Game.rooms[Memory.observeRoom]) {
                log.a(`${roomName} finished observing ${Memory.observeRoom} — resuming random mode.`);
                Memory.observeRoom = undefined;
                observedRooms[roomName] = undefined;
            }
            return true;
        }

        // Start manual observation
        observedRooms[roomName] = Memory.observeRoom;
        observer.observeRoom(Memory.observeRoom);
        return true;
    }

    selectObservationTarget(roomName, currentTime) {
        // Try strategic targets first (cached per tick)
        const strategic = this.getStrategicTargets(currentTime);
        for (const target of strategic) {
            if (Game.map.getRoomLinearDistance(roomName, target) <= OBSERVER_RANGE) {
                return target;
            }
        }

        // Fall back to random
        return this.findRandomTarget(roomName, currentTime);
    }

    getStrategicTargets(currentTime) {
        if (strategicCache.tick === currentTime) {
            return strategicCache.targets;
        }

        const targets = Object.keys(Memory.targetRooms || {}).filter(room => {
            const op = Memory.targetRooms[room];
            if (!op) return false;
            return op.type === 'scout' ||
                (!INTEL[room] || !INTEL[room].lastObservation || INTEL[room].lastObservation + 50 < currentTime);
        });

        strategicCache = {tick: currentTime, targets};
        return targets;
    }

    findRandomTarget(roomName, currentTime) {
        const [, eW, xStr, nS, yStr] = roomName.match(/^([EW])(\d+)([NS])(\d+)$/);
        const baseX = (eW === 'W' ? -1 : 1) * (xStr | 0);
        const baseY = (nS === 'N' ? -1 : 1) * (yStr | 0);
        const RANGE = OBSERVER_RANGE;

        // Generate directions dynamically (much faster than hardcoded list)
        const directions = this.generateDirections(RANGE);

        for (const [dx, dy] of directions) {
            const newX = baseX + dx;
            const newY = baseY + dy;
            const target = `${newX >= 0 ? 'E' : 'W'}${Math.abs(newX)}${newY >= 0 ? 'S' : 'N'}${Math.abs(newY)}`;

            if (roomStatus(target) === 'closed') continue;

            const intel = INTEL[target];
            if (!intel || intel.lastObservation + 50 <= currentTime) {
                return target;
            }
        }

        return null;
    }

    generateDirections(maxRange) {
        const dirs = [];
        for (let r = 1; r <= maxRange; r++) {
            // Cardinals
            dirs.push([r, 0], [-r, 0], [0, r], [0, -r]);

            // Diagonals and intermediates
            for (let i = 1; i < r; i++) {
                dirs.push([r, i], [r, -i], [-r, i], [-r, -i]);
                dirs.push([i, r], [-i, r], [i, -r], [-i, -r]);
            }

            // Corner diagonals
            if (r > 1) {
                dirs.push([r, r], [-r, r], [-r, -r], [r, -r]);
            }
        }
        return dirs;
    }

    observeRoom(observer, roomName, targetRoom, currentTime) {
        observer.observeRoom(targetRoom);
        observedRooms[roomName] = targetRoom;

        // Mark last observation time
        if (!INTEL[targetRoom]) INTEL[targetRoom] = {};
        INTEL[targetRoom].lastObservation = currentTime;
    }
}

profiler.registerClass(ObserverControl, 'ObserverControl');
module.exports = ObserverControl;