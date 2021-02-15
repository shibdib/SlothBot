/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.claimNewRoom = function () {
    if (Memory.tickCooldowns.expansionTick + 150 > Game.time) return;
    Memory.tickCooldowns.expansionTick = Game.time;
    let limit = Game.gcl.level;
    // Special novice/respawn zone cases
    if (Game.map.getRoomStatus(Memory.myRooms[0]).status === 'novice') limit = 3;
    if (limit <= Memory.myRooms.length || Memory.spawnIn + 7500 > Game.time || Memory.minLevel < 3 || _.filter(Memory.auxiliaryTargets, (t) => t && (t.type === 'claimScout' || t.type === 'claim'))[0]) return;
    let worthyRooms = _.filter(Memory.roomCache, (r) => (!r.noClaim || r.noClaim + 3000 < Game.time) && r.hubCheck && r.closestRange <= 12 &&
        Game.map.getRoomStatus(r.name).status === Game.map.getRoomStatus(Memory.myRooms[0]).status && !r.obstructions);
    if (worthyRooms.length > 0) {
        let possibles = {};
        worthy:
            for (let key in worthyRooms) {
                let name = worthyRooms[key].name;
                // All rooms start at 10000
                let baseScore = 10000;
                // Check if it's near any owned rooms
                let avoidRooms = _.filter(Memory.roomCache, (r) => r.level && _.includes(FRIENDLIES, r.owner));
                for (let avoidKey in avoidRooms) {
                    let avoidName = avoidRooms[avoidKey].name;
                    let distance = Game.map.getRoomLinearDistance(name, avoidName)
                    if (distance <= 2) distance = Game.map.findRoute(name, avoidName).length;
                    if (distance <= 2) continue worthy; else if (distance === 3) baseScore += 1000; else if (distance < 6) baseScore += 100; else if (distance > 20) continue worthy; else baseScore -= 1000;
                }
                // Remote access
                let neighboring = Game.map.describeExits(name);
                if (!neighboring) continue;
                let sourceCount = 0;
                if (neighboring['1'] && Memory.roomCache[neighboring['1']] && !Memory.roomCache[neighboring['1']].user) sourceCount += Memory.roomCache[neighboring['1']].sources;
                if (neighboring['3'] && Memory.roomCache[neighboring['3']] && !Memory.roomCache[neighboring['3']].user) sourceCount += Memory.roomCache[neighboring['3']].sources;
                if (neighboring['5'] && Memory.roomCache[neighboring['5']] && !Memory.roomCache[neighboring['5']].user) sourceCount += Memory.roomCache[neighboring['5']].sources;
                if (neighboring['7'] && Memory.roomCache[neighboring['7']] && !Memory.roomCache[neighboring['7']].user) sourceCount += Memory.roomCache[neighboring['7']].sources;
                baseScore += (sourceCount * 250);
                // Prioritize fortress rooms if enemies exist
                if (Memory._enemies && Memory._enemies.length && _.size(Game.map.describeExits(name) < 2)) baseScore += 1000;
                // Swamps suck
                let terrain = Game.map.getRoomTerrain(name);
                let terrainScore = 0;
                for (let y = 0; y < 50; y++) {
                    for (let x = 0; x < 50; x++) {
                        let tile = terrain.get(x, y);
                        if (tile === TERRAIN_MASK_SWAMP) terrainScore += 25;
                    }
                }
                baseScore -= terrainScore;
                // Source range
                baseScore -= Memory.roomCache[name].sourceRange * 10;
                // If it's a new mineral add to the score
                if (worthyRooms[key].mineral && !_.includes(Memory.ownedMinerals, worthyRooms[key].mineral)) {
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
                // Prioritize your sector
                if (sameSectorCheck(name, worthyRooms[key].closestRoom)) baseScore += 2000; else baseScore -= 500;
                worthyRooms[key]["claimValue"] = baseScore;
                possibles[key] = worthyRooms[key];
            }
        let claimTarget = _.max(possibles, 'claimValue').name;
        if (claimTarget) {
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
    }
};