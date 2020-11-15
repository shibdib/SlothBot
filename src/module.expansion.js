/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.claimNewRoom = function () {
    let lastRun = Memory.lastExpansionAttemptTick || 0;
    let limit = Game.gcl.level;
    // Special novice/respawn zone cases
    if (Game.map.getRoomStatus(Memory.myRooms[0]).status === 'novice') limit = 3;
    if (Memory.cpuTracking.claimLimiter) limit -= Memory.cpuTracking.claimLimiter;
    if (lastRun + 100 > Game.time || limit <= Memory.myRooms.length || Memory.spawnIn + 7500 > Game.time ||
        _.filter(Memory.myRooms, (r) => Game.rooms[r].memory["buildersNeeded"]).length >= _.filter(Memory.myRooms, (r) => !Game.rooms[r].memory["buildersNeeded"]).length ||
        _.filter(Memory.auxiliaryTargets, (t) => t && (t.type === 'claimScout' || t.type === 'claim'))[0]) return;
    Memory.lastExpansionAttemptTick = Game.time;
    let worthyRooms = _.filter(Memory.roomCache, (r) => (!r.noClaim || r.noClaim + 3000 < Game.time) && r.hubCheck && r.closestRange <= 12 &&
        Game.map.getRoomStatus(r.name).status === Game.map.getRoomStatus(Memory.myRooms[0]).status && !r.obstructions);
    if (worthyRooms.length > 0) {
        let possibles = {};
        worthy:
            for (let key in worthyRooms) {
                let name = worthyRooms[key].name;
                // All rooms start at 5000
                let baseScore = 5000;
                // Check if it's near any owned rooms
                let avoidRooms = _.filter(Memory.roomCache, (r) => r.level);
                for (let avoidKey in avoidRooms) {
                    let avoidName = avoidRooms[avoidKey].name;
                    let distance = Game.map.findRoute(name, avoidName).length;
                    if (distance <= 1) continue worthy; else if (distance < 3) baseScore -= 150; else if (baseScore < 6) baseScore += 100; else baseScore -= 350;
                }
                // Remote access
                let neighboring = Game.map.describeExits(name);
                if (!neighboring) continue;
                let sourceCount = 0;
                if (neighboring['1'] && Memory.roomCache[neighboring['1']] && !Memory.roomCache[neighboring['1']].user) sourceCount += Memory.roomCache[neighboring['1']].sources;
                if (neighboring['3'] && Memory.roomCache[neighboring['3']] && !Memory.roomCache[neighboring['3']].user) sourceCount += Memory.roomCache[neighboring['3']].sources;
                if (neighboring['5'] && Memory.roomCache[neighboring['5']] && !Memory.roomCache[neighboring['5']].user) sourceCount += Memory.roomCache[neighboring['5']].sources;
                if (neighboring['7'] && Memory.roomCache[neighboring['7']] && !Memory.roomCache[neighboring['7']].user) sourceCount += Memory.roomCache[neighboring['7']].sources;
                baseScore += (sourceCount * 200);
                // Swamps suck
                let terrain = Game.map.getRoomTerrain(name);
                let terrainScore = 0;
                for (let y = 0; y < 50; y++) {
                    for (let x = 0; x < 50; x++) {
                        let tile = terrain.get(x, y);
                        if (tile === TERRAIN_MASK_WALL) terrainScore += 0.25;
                        if (tile === TERRAIN_MASK_SWAMP) terrainScore += 25;
                    }
                }
                baseScore -= terrainScore;
                // Source range
                baseScore -= Memory.roomCache[name].sourceRange;
                // If it's a new mineral add to the score
                if (worthyRooms[key].mineral && !_.includes(Memory.ownedMinerals, worthyRooms[key].mineral)) baseScore += 1500;
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