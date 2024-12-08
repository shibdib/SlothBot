/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

module.exports.claimNewRoom = function () {
    if (!MY_ROOMS[0] || _.size(INTEL) < 5) return;

    // Check for active claims or rebuilds
    const claimsInProgress = _.filter(Memory.auxiliaryTargets, t => t && (t.type === 'claim' || t.type === 'rebuild'));
    if (claimsInProgress.length > MY_ROOMS.length * 0.25) return;

    let claimTarget = Memory.nextClaim;

    // Clear claim target if invalid
    const targetIntel = INTEL[claimTarget];
    if (!targetIntel || targetIntel.owner || targetIntel.reservation || targetIntel.hostile || Math.random() > 0.75) {
        Memory.nextClaim = undefined;
        claimTarget = undefined;
    }

    if (!claimTarget) {
        const worthyRooms = _.filter(INTEL, room => (
            (!room.noClaim || room.noClaim < Game.time) &&
            !room.obstacles &&
            !room.hostile &&
            !room.obstructions &&
            !room.owner &&
            (!room.reservation || room.reservation === MY_USERNAME) &&
            room.hubCheck &&
            Game.map.findRoute(room.name, findClosestOwnedRoom(room.name)).length <= 14 &&
            roomStatus(room.name) === roomStatus(MY_ROOMS[0])
        ));

        if (!worthyRooms.length) return;

        const possibles = {};
        for (const key in worthyRooms) {
            const room = worthyRooms[key];
            const name = room.name;

            let baseScore = 10000;

            // Penalize failed claim attempts
            if (room.failedClaim) {
                if (room.failedClaim >= 5) continue;
                baseScore -= room.failedClaim * 1000;
            }

            // Adjust score based on proximity to friendly rooms
            const friendlyRooms = _.filter(INTEL, r => r.level && _.includes(FRIENDLIES, r.owner));
            if (friendlyRooms.some(fRoom => Game.map.findRoute(name, fRoom.name).length <= 2)) continue;

            friendlyRooms.forEach(fRoom => {
                const distance = Game.map.findRoute(name, fRoom.name).length;
                baseScore += distance === 3 ? 2000 : distance < 7 ? 1000 : distance > 15 ? -Infinity : -200 * distance;

                // Sector check for allies
                if (AVOID_ALLIED_SECTORS && sameSectorCheck(name, fRoom.name)) baseScore -= 500;
            });

            // Adjust score based on proximity to enemy rooms
            const enemyRooms = _.filter(INTEL, r => r.level && _.includes(HOSTILES, r.owner));
            enemyRooms.forEach(eRoom => {
                const distance = Math.min(
                    Game.map.getRoomLinearDistance(name, eRoom.name),
                    Game.map.findRoute(name, eRoom.name).length
                );
                if (distance <= 3) baseScore -= 10000 / distance;
                else if (distance < 6) baseScore -= 250;
            });

            // Score based on remote source access
            const neighboring = _.map(Game.map.describeExits(name));
            const sourceCount = neighboring.reduce((sum, r) => {
                if (!INTEL[r]) return sum + 1;
                if (!INTEL[r].user) return sum + INTEL[r].sources;
                return sum;
            }, 0);

            if (!sourceCount) continue;
            baseScore += sourceCount * 250;

            // Penalize swamp terrain
            const terrain = Game.map.getRoomTerrain(name);
            for (let y = 0; y < 50; y++) {
                for (let x = 0; x < 50; x++) {
                    if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) baseScore -= 10;
                }
            }

            // Score based on minerals
            if (!_.includes(MY_MINERALS, room.mineral)) {
                baseScore += {
                    [RESOURCE_OXYGEN]: 1500,
                    [RESOURCE_HYDROGEN]: 1500,
                    [RESOURCE_LEMERGIUM]: 750,
                    [RESOURCE_KEANIUM]: 500
                }[room.mineral] || 200;
            } else {
                baseScore -= 1000;
            }

            // Prioritize rooms in the same sector
            if (myRoomInSectorCheck(name)) baseScore += 7000;

            room.claimValue = baseScore;
            possibles[key] = room;
        }
        const max = _.max(possibles, 'claimValue');
        if (max) claimTarget = max.name;
    }

    if (claimTarget) {
        const limit = roomStatus(MY_ROOMS[0]) === 'novice' ? 3 : Game.gcl.level;

        if (limit > MY_ROOMS.length && MAX_LEVEL >= 4 && !Memory.auxiliaryTargets[claimTarget] && INTEL[claimTarget] && !INTEL[claimTarget].hostile) {
            Memory.nextClaim = undefined;
            Memory.auxiliaryTargets = {
                ...Memory.auxiliaryTargets,
                [claimTarget]: {
                    tick: Game.time,
                    type: 'claim',
                    priority: 1
                }
            };
            log.a(`Claim Mission for ${roomLink(claimTarget)} initiated.`, 'EXPANSION CONTROL:');
        } else if (Memory.nextClaim !== claimTarget) {
            log.a(`Next claim target set to ${roomLink(claimTarget)} once available.`, 'EXPANSION CONTROL:');
            Memory.nextClaim = claimTarget;
        }
    } else {
        log.a(`No claim targets found out of ${worthyRooms.length} possible rooms.`, 'EXPANSION CONTROL:');
    }
};
