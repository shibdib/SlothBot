/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

class ExpansionControl {
    constructor() {
        this.claimTarget = undefined;
        this.worthyRooms = [];
    }

    run() {
        if (!MY_ROOMS[0] || Object.keys(INTEL).length < 15) return;

        this.findClaimTarget();

        if (this.claimTarget) {
            const rebuildOperations = Memory.auxiliaryTargets.filter((o) => o.type === 'rebuild') || [];
            const claimOperations = Memory.auxiliaryTargets.filter((o) => o.type === 'claim') || [];
            if (rebuildOperations.length + claimOperations.length < 2) {
                this.claimOperation(this.claimTarget);
            }
        } else {
            log.a(`No claim targets found out of ${this.worthyRooms.length} possible rooms.`, 'EXPANSION CONTROL:');
        }
    }

    findClaimTarget() {
        this.claimTarget = Memory.nextClaim;

        if (this.claimTarget) {
            const targetIntel = INTEL[this.claimTarget];
            if (!targetIntel || targetIntel.owner || targetIntel.reservation) {
                Memory.nextClaim = undefined;
                this.claimTarget = undefined;
            } else {
                return; // already have a valid target, proceed to claim operation
            }
        }

        this.filterWorthyRooms();
        if (!this.worthyRooms.length) return;

        // Prioritize rooms within the same sector
        const sameSectorRooms = this.worthyRooms.filter(room => myRoomInSectorCheck(room.name));
        if (sameSectorRooms.length) {
            this.worthyRooms = sameSectorRooms;
        }

        this.scoreRooms();
        const max = _.max(this.worthyRooms, 'claimValue');
        this.claimTarget = max ? max.name : undefined;
    }

    filterWorthyRooms() {
        this.worthyRooms = Object.values(INTEL).filter(room =>
            room.hubCheck &&
            !room.owner &&
            room.cached + 10000 > Game.time &&
            (!room.noClaim || room.noClaim < Game.time) &&
            !room.obstructions &&
            (!room.reservation || room.reservation === MY_USERNAME) &&
            findClosestOwnedRoom(room.name, true) <= 14 &&
            findClosestOwnedRoom(room.name, true) > 1 &&
            roomStatus(room.name) === roomStatus(MY_ROOMS[0])
        );
    }

    findClosestOwnedRoom(roomName) {
        return _.min(MY_ROOMS, r => Game.map.findRoute(roomName, r).length);
    }

    scoreRooms() {
        const friendlyRooms = Object.values(INTEL).filter(r => r.level && FRIENDLIES.includes(r.owner));
        const enemyRooms = Object.values(INTEL).filter(r => r.level && HOSTILES.includes(r.owner));

        for (const room of this.worthyRooms) {
            room.claimValue = this.calculateRoomScore(room, friendlyRooms, enemyRooms);
        }
    }

    calculateRoomScore(room, friendlyRooms, enemyRooms) {
        let score = 10000;

        // Penalize failed claim attempts
        if (room.failedClaim) {
            if (room.failedClaim >= 5) return undefined;
            score -= room.failedClaim * 1000;
        }

        // Adjust score based on proximity to friendly rooms
        for (const fRoom of friendlyRooms) {
            const distance = Game.map.findRoute(room.name, fRoom.name).length;
            if (distance <= 2) return undefined; // Too close to allies
            score += this.friendlyRoomScoreAdjustment(distance);
            if (AVOID_ALLIED_SECTORS && sameSectorCheck(room.name, fRoom.name)) score -= 500;
        }

        // Adjust score based on proximity to enemy rooms
        for (const eRoom of enemyRooms) {
            const distance = Math.min(
                Game.map.getRoomLinearDistance(room.name, eRoom.name),
                Game.map.findRoute(room.name, eRoom.name).length
            );
            if (distance <= 3) score -= 10000 / distance;
            else if (distance < 6) score -= 250;
        }

        // Score based on remote source access
        const neighboring = Object.values(Game.map.describeExits(room.name));
        const sourceCount = neighboring.reduce((sum, r) => {
            if (!INTEL[r]) return sum + 1;
            return INTEL[r].user ? sum : sum + (INTEL[r].sources || 0);
        }, 0);

        if (!sourceCount) return undefined;
        score += sourceCount * 250;

        // Penalize swamp terrain
        const terrain = Game.map.getRoomTerrain(room.name);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) score -= 10;
            }
        }

        // Score based on minerals
        if (!MY_MINERALS[room.mineral]) {
            score += this.getMineralBonus(room.mineral);
        } else {
            score -= 1000;
        }

        // Prioritize rooms in the same sector
        if (myRoomInSectorCheck(room.name)) score += 7000;

        return score;
    }

    friendlyRoomScoreAdjustment(distance) {
        return distance === 3 ? 2000 : distance < 7 ? 100 : distance > 15 ? -Infinity : 1;
    }

    getMineralBonus(mineralType) {
        const bonusTable = {
            [RESOURCE_OXYGEN]: 1500,
            [RESOURCE_HYDROGEN]: 1500,
            [RESOURCE_LEMERGIUM]: 750,
            [RESOURCE_KEANIUM]: 500
        };
        return bonusTable[mineralType] || 200;
    }

    claimOperation(roomName) {
        const limit = roomStatus(MY_ROOMS[0]) === 'novice' ? 3 : Game.gcl.level;

        if (limit > MY_ROOMS.length && MAX_LEVEL >= 4 && !Memory.auxiliaryTargets[roomName] && INTEL[roomName] && !INTEL[roomName].hostile) {
            Memory.nextClaim = undefined;
            Memory.auxiliaryTargets[roomName] = {
                tick: Game.time,
                type: 'claim',
                priority: 1
            };
            log.a(`Claim Mission for ${roomLink(roomName)} initiated.`, 'EXPANSION CONTROL:');
        } else if (Memory.nextClaim !== roomName) {
            log.a(`Next claim target set to ${roomLink(roomName)} once available.`, 'EXPANSION CONTROL:');
            Memory.nextClaim = roomName;
        }
    }
}

module.exports = ExpansionControl;