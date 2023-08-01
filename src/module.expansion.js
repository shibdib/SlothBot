/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let lastTick = 0;

module.exports.claimNewRoom = function () {
    return;
    let worthyRooms;
    if (lastTick + 5000 > Game.time) return;
    lastTick = Game.time;
    let claimInProgress = _.find(Memory.auxiliaryTargets, (t) => t && (t.type === 'claimScout' || t.type === 'claim'));
    if (claimInProgress) return;
    let claimTarget = Memory.nextClaim;
    if (Math.random() > 0.75) claimTarget = undefined;
    if (!claimTarget) {
        worthyRooms = _.filter(Memory.roomCache, (r) => Game.rooms[r.closestRoom] && (!r.noClaim || r.noClaim < Game.time) && !r.obstructions && !r.owner && (!r.reservation || r.reservation === MY_USERNAME) && r.hubCheck &&
            Game.rooms[r.closestRoom].routeSafe(r.name, 500, 1, 12) && Game.map.getRoomStatus(r.name).status === Game.map.getRoomStatus(Memory.myRooms[0]).status);
        if (!worthyRooms.length) return;
        let possibles = {};
        worthy:
            for (let key in worthyRooms) {
                let name = worthyRooms[key].name;
                // All rooms start at 10000
                let baseScore = 10000;
                // Check if it's near any owned friendly rooms
                let friendlyRooms = _.filter(Memory.roomCache, (r) => r.level && _.includes(FRIENDLIES, r.owner));
                for (let key in friendlyRooms) {
                    let avoidName = friendlyRooms[key].name;
                    let distance = Game.map.findRoute(name, avoidName).length;
                    if (distance <= 2) continue worthy;
                    if (distance === 3) baseScore += 2000; else if (distance < 7) baseScore += 1000; else if (distance > 20) continue worthy; else baseScore -= 5000;
                    // Sector check for allies
                    if (AVOID_ALLIED_SECTORS && sameSectorCheck(name, avoidName)) baseScore -= 1500;
                }
                // Check if it's near any owned enemy rooms
                let enemyRooms = _.filter(Memory.roomCache, (r) => r.level && _.includes(HOSTILES, r.owner));
                for (let key in enemyRooms) {
                    let avoidName = enemyRooms[key].name;
                    let distance = Game.map.getRoomLinearDistance(name, avoidName)
                    if (distance <= 2) distance = Game.map.findRoute(name, avoidName).length;
                    if (distance <= 2) baseScore -= 5000; else if (distance < 6) baseScore -= 1000;
                }
                // Remote access
                let neighboring = _.map(Game.map.describeExits(name));
                let sourceCount = 0;
                neighboring.forEach(function (r) {
                    if (!Memory.roomCache[r]) sourceCount++;
                    else if (Memory.roomCache[r] && !Memory.roomCache[r].user) sourceCount += Memory.roomCache[r].sources;
                });
                // No remotes is a big negative
                if (!sourceCount) continue;
                baseScore += (sourceCount * 250);
                // Swamps suck
                let terrain = Game.map.getRoomTerrain(name);
                let terrainScore = 0;
                for (let y = 0; y < 50; y++) {
                    for (let x = 0; x < 50; x++) {
                        let tile = terrain.get(x, y);
                        if (tile === TERRAIN_MASK_SWAMP) terrainScore += 50;
                    }
                }
                baseScore -= terrainScore;
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
                } else baseScore -= 500;
                // Season stuff
                if (Game.shard.name === 'shardSeason') {
                    // Season 2
                    /**
                     let symbolAccess = _.uniq(_.pluck(_.filter(Memory.roomCache, (r) => r.owner && _.includes(FRIENDLIES, r.owner) && r.closestRange < 15), 'seasonDecoder'));
                     if (_.includes(symbolAccess, worthyRooms[key].seasonDecoder)) continue;
                     **/
                    // Season 4
                    if (!Memory.roomCache[name].seasonResource) continue;
                }
                // Prioritize your sector
                if (sameSectorCheck(name, worthyRooms[key].closestRoom)) baseScore += 2000; else baseScore -= 500;
                worthyRooms[key]["claimValue"] = baseScore;
                possibles[key] = worthyRooms[key];
            }
        claimTarget = _.max(possibles, 'claimValue').name;
    }
    if (claimTarget) {
        let limit = Game.gcl.level;
        // Special novice/respawn zone cases
        if (Game.map.getRoomStatus(Memory.myRooms[0]).status === 'novice') limit = 3;
        if (limit <= Memory.myRooms.length || Memory.spawnIn + 7500 > Game.time || Memory.minLevel < 3 || claimInProgress) {
            if (Memory.nextClaim !== claimTarget) {
                log.a('Next claim target set to ' + roomLink(claimTarget) + ' once available.', 'EXPANSION CONTROL: ');
                Memory.nextClaim = claimTarget;
            } else if (!Memory.roomCache[claimTarget] || Memory.roomCache[claimTarget].owner) Memory.nextClaim = undefined;
        } else if (!Memory.auxiliaryTargets[claimTarget] && Memory.roomCache[claimTarget] && !Memory.roomCache[claimTarget].hostile) {
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