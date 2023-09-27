/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let lastTick = 0;

module.exports.claimNewRoom = function () {
    let worthyRooms;
    if (lastTick + 500 > Game.time || !MY_ROOMS[0] || _.size(INTEL) < 5) return;
    lastTick = Game.time;
    // Check for active claims or rebuilds
    let claimsInProgress = _.filter(Memory.auxiliaryTargets, (t) => t && (t.type === 'claim' || t.type === 'rebuild'));
    if (claimsInProgress.length > MY_ROOMS.length * 0.25) return;
    let claimTarget = Memory.nextClaim;
    // Clear claim target if it's not valid
    if (!INTEL[claimTarget] || INTEL[claimTarget].owner || INTEL[claimTarget].reservation || INTEL[claimTarget].hostile || Math.random() > 0.75) {
        Memory.nextClaim = undefined;
        claimTarget = undefined;
    }
    if (!claimTarget) {
        worthyRooms = _.filter(INTEL, (r) => (!r.noClaim || r.noClaim < Game.time) && !r.needCleaner && !r.hostile && !r.obstructions && !r.owner && (!r.reservation || r.reservation === MY_USERNAME) && r.hubCheck &&
            Game.map.findRoute(r.name, findClosestOwnedRoom(r.name)).length <= 14 && Game.map.getRoomStatus(r.name).status === Game.map.getRoomStatus(MY_ROOMS[0]).status);
        if (!worthyRooms.length) return;
        let possibles = {};
        worthy:
            for (let key in worthyRooms) {
                let name = worthyRooms[key].name;
                // All rooms start at 10000
                let baseScore = 10000;
                // Check if we've already failed here, give up after 10 tries otherwise just subtract 1000 per fail
                if (INTEL[name].failedClaim) {
                    if (INTEL[name].failedClaim >= 5) continue;
                    baseScore -= INTEL[name].failedClaim * 1000;
                }
                // Check if it's near any owned friendly rooms
                let friendlyRooms = _.filter(INTEL, (r) => r.level && _.includes(FRIENDLIES, r.owner));
                for (let key in friendlyRooms) {
                    let avoidName = friendlyRooms[key].name;
                    let distance = Game.map.findRoute(name, avoidName).length;
                    if (distance <= 2) continue worthy;
                    if (distance === 2) baseScore += 0; else if (distance === 3) baseScore += 2000; else if (distance < 7) baseScore += 1000; else if (distance > 15) continue worthy; else baseScore -= (200 * distance);
                    // Sector check for allies
                    if (AVOID_ALLIED_SECTORS && sameSectorCheck(name, avoidName)) baseScore -= 500;
                }
                // Check if it's near any owned enemy rooms
                let enemyRooms = _.filter(INTEL, (r) => r.level && _.includes(HOSTILES, r.owner));
                for (let key in enemyRooms) {
                    let avoidName = enemyRooms[key].name;
                    let distance = Game.map.getRoomLinearDistance(name, avoidName)
                    if (distance <= 2) distance = Game.map.findRoute(name, avoidName).length;
                    if (distance <= 3) baseScore -= (10000 / distance); else if (distance < 6) baseScore -= 250;
                }
                // Remote access
                let neighboring = _.map(Game.map.describeExits(name));
                let sourceCount = 0;
                neighboring.forEach(function (r) {
                    if (!INTEL[r]) sourceCount++;
                    else if (INTEL[r] && !INTEL[r].user) sourceCount += INTEL[r].sources;
                });
                // No remotes is a big negative
                if (!sourceCount) continue;
                baseScore += (sourceCount * 250);
                // Swamps suck
                for (let y = 0; y < 50; y++) {
                    for (let x = 0; x < 50; x++) {
                        let tile = Game.map.getRoomTerrain(name).get(x, y);
                        if (tile === TERRAIN_MASK_SWAMP) baseScore -= 10;
                    }
                }
                // If it's a new mineral add to the score
                if (!_.includes(MY_MINERALS, worthyRooms[key].mineral)) {
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
                if (sameSectorCheck(name, findClosestOwnedRoom(name))) baseScore += 7000;
                // If negative skip it
                //if (baseScore < 0) continue;
                worthyRooms[key]["claimValue"] = baseScore;
                possibles[key] = worthyRooms[key];
            }
        claimTarget = _.max(possibles, 'claimValue').name;
    }
    if (claimTarget) {
        let limit = Game.gcl.level;
        // Special novice zone cases
        if (Game.map.getRoomStatus(MY_ROOMS[0]).status === 'novice') limit = 3;
        if (limit > MY_ROOMS.length && MAX_LEVEL >= 4 && !Memory.auxiliaryTargets[claimTarget] && INTEL[claimTarget] && !INTEL[claimTarget].hostile) {
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
        } else {
            if (Memory.nextClaim !== claimTarget) {
                log.a('Next claim target set to ' + roomLink(claimTarget) + ' once available.', 'EXPANSION CONTROL: ');
                Memory.nextClaim = claimTarget;
            }
        }
    } else {
        log.a('No claim targets found out of a possible ' + worthyRooms.length + ' rooms.', 'EXPANSION CONTROL: ')
    }
};