/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let lastTick = 0;

module.exports.claimNewRoom = function () {
    let worthyRooms;
    if (lastTick + 500 > Game.time || !MY_ROOMS[0]) return;
    lastTick = Game.time;
    // Check for active claims or rebuilds
    let claimInProgress = _.find(Memory.auxiliaryTargets, (t) => t && (t.type === 'claim' || t.type === 'rebuild'));
    if (claimInProgress) return;
    let claimTarget = Memory.nextClaim;
    // Clear claim target if it's not valid
    if (!INTEL[claimTarget] || INTEL[claimTarget].owner || INTEL[claimTarget].reservation || Math.random() > 0.75) {
        Memory.nextClaim = undefined;
        claimTarget = undefined;
    }
    if (!claimTarget) {
        worthyRooms = _.filter(INTEL, (r) => Game.rooms[r.closestRoom] && (!r.noClaim || r.noClaim < Game.time) && !r.obstructions && !r.owner && (!r.reservation || r.reservation === MY_USERNAME) && r.hubCheck &&
            Game.rooms[r.closestRoom].routeSafe(r.name, 500, 1, 12) && Game.map.getRoomStatus(r.name).status === Game.map.getRoomStatus(MY_ROOMS[0]).status);
        if (!worthyRooms.length) return;
        let possibles = {};
        worthy:
            for (let key in worthyRooms) {
                let name = worthyRooms[key].name;
                // All rooms start at 10000
                let baseScore = 10000;
                // Check if we've already failed here, give up after 10 tries otherwise just subtract 1000 per fail
                if (INTEL[name].failedClaim) {
                    if (INTEL[name].failedClaim >= 10) continue;
                    baseScore -= INTEL[name].failedClaim * 1000;
                }
                // Check if it's near any owned friendly rooms
                let friendlyRooms = _.filter(INTEL, (r) => r.level && _.includes(FRIENDLIES, r.owner));
                for (let key in friendlyRooms) {
                    let avoidName = friendlyRooms[key].name;
                    let distance = Game.map.findRoute(name, avoidName).length;
                    if (distance <= 2) continue worthy;
                    if (distance === 3) baseScore += 2000; else if (distance < 7) baseScore += 1000; else if (distance > 20) continue worthy; else baseScore -= 5000;
                    // Sector check for allies
                    if (AVOID_ALLIED_SECTORS && sameSectorCheck(name, avoidName)) baseScore -= 1500;
                }
                // Check if it's near any owned enemy rooms
                let enemyRooms = _.filter(INTEL, (r) => r.level && _.includes(HOSTILES, r.owner));
                for (let key in enemyRooms) {
                    let avoidName = enemyRooms[key].name;
                    let distance = Game.map.getRoomLinearDistance(name, avoidName)
                    if (distance <= 2) distance = Game.map.findRoute(name, avoidName).length;
                    if (distance <= 2) baseScore -= 3000; else if (distance < 6) baseScore -= 1000;
                }
                // Remote access
                let neighboring = _.map(Game.map.describeExits(name));
                let sourceCount = 0;
                neighboring.forEach(function (r) {
                    if (!INTEL[r]) sourceCount++;
                    else if (INTEL[r] && !INTEL[r].user) sourceCount += INTEL[r].sources;
                });
                // No remotes is a big negative
                if (!sourceCount) baseScore -= 2500;
                baseScore += (sourceCount * 250);
                // Swamps suck
                for (let y = 0; y < 50; y++) {
                    for (let x = 0; x < 50; x++) {
                        let tile = Game.map.getRoomTerrain(name).get(x, y);
                        if (tile === TERRAIN_MASK_SWAMP) baseScore -= 50;
                    }
                }
                // If it's a new mineral add to the score
                if (!_.includes(Memory.ownedMinerals, worthyRooms[key].mineral)) {
                    switch (worthyRooms[key].mineral) {
                        case RESOURCE_OXYGEN:
                            baseScore += 1500;
                            break;
                        case RESOURCE_HYDROGEN:
                            baseScore += 1500;
                            break;
                        case RESOURCE_LEMERGIUM:
                            baseScore += 750;
                            break;
                        case RESOURCE_KEANIUM:
                            baseScore += 500;
                            break;
                        default:
                            baseScore += 200;
                            break;
                    }
                } else baseScore -= 1000;
                // Prioritize your sector
                if (sameSectorCheck(name, worthyRooms[key].closestRoom)) baseScore += 2000; else baseScore -= 500;
                worthyRooms[key]["claimValue"] = baseScore;
                possibles[key] = worthyRooms[key];
            }
        claimTarget = _.max(possibles, 'claimValue').name;
    }
    if (claimTarget) {
        let limit = Game.gcl.level;
        // Special novice zone cases
        if (Game.map.getRoomStatus(MY_ROOMS[0]).status === 'novice') limit = 3;
        if (limit <= MY_ROOMS.length || Memory.spawnIn + 7500 > Game.time || MIN_LEVEL < 3) {
            if (Memory.nextClaim !== claimTarget) {
                log.a('Next claim target set to ' + roomLink(claimTarget) + ' once available.', 'EXPANSION CONTROL: ');
                Memory.nextClaim = claimTarget;
            }
        } else if (!Memory.auxiliaryTargets[claimTarget] && INTEL[claimTarget] && !INTEL[claimTarget].hostile) {
            Memory.nextClaim = undefined;
            let cache = Memory.auxiliaryTargets || {};
            let tick = Game.time;
            cache[claimTarget] = {
                tick: tick,
                type: 'claim',
                priority: 1
            };
            Memory.auxiliaryTargets = cache;
            log.a('Claim Mission For ' + roomLink(claimTarget) + ' Initiated.', 'EXPANSION CONTROL: ');
        }
    } else {
        log.a('No claim targets found out of a possible ' + worthyRooms.length + ' rooms.', 'EXPANSION CONTROL: ')
    }
};