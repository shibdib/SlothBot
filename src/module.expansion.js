/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.claimNewRoom = function () {
    let worthyRooms = _.filter(Memory.roomCache, (r) => (!r.noClaim || r.noClaim + 3000 < Game.time) && r.hubCheck && r.closestRange <= 12);
    if (worthyRooms.length > 0) {
        let possibles = {};
        loop1:
            for (let key in worthyRooms) {
                let name = worthyRooms[key].name;
                // All rooms start at 5000
                let baseScore = 5000;
                // Remote access
                let neighboring = Game.map.describeExits(name);
                if (!neighboring) continue;
                let sourceCount = 0;
                if (neighboring['1'] && Memory.roomCache[neighboring['1']] && !Memory.roomCache[neighboring['1']].user) sourceCount += Memory.roomCache[neighboring['1']].sources;
                if (neighboring['3'] && Memory.roomCache[neighboring['3']] && !Memory.roomCache[neighboring['3']].user) sourceCount += Memory.roomCache[neighboring['3']].sources;
                if (neighboring['5'] && Memory.roomCache[neighboring['5']] && !Memory.roomCache[neighboring['5']].user) sourceCount += Memory.roomCache[neighboring['5']].sources;
                if (neighboring['7'] && Memory.roomCache[neighboring['7']] && !Memory.roomCache[neighboring['7']].user) sourceCount += Memory.roomCache[neighboring['7']].sources;
                baseScore += (sourceCount * 70);
                // Swamps suck
                let terrain = Game.map.getRoomTerrain(name);
                let terrainScore = 0;
                for (let y = 0; y < 50; y++) {
                    for (let x = 0; x < 50; x++) {
                        let tile = terrain.get(x, y);
                        if (tile === TERRAIN_MASK_WALL) terrainScore += 0.5;
                        if (tile === TERRAIN_MASK_SWAMP) terrainScore += 2.5;
                    }
                }
                baseScore -= terrainScore;
                // If it's a new mineral add to the score
                if (worthyRooms[key].mineral && !_.includes(OWNED_MINERALS, worthyRooms[key].mineral)) baseScore += 450;
                // Check if it's near any owned rooms
                let avoidRooms = _.filter(Memory.roomCache, (r) => r.level);
                for (let avoidKey in avoidRooms) {
                    let avoidName = avoidRooms[avoidKey].name;
                    let distance = Game.map.getRoomLinearDistance(name, avoidName);
                    let cutoff = 2;
                    if (_.includes(FRIENDLIES, avoidRooms[avoidKey].owner)) cutoff = 3;
                    if (distance < cutoff) continue loop1;
                }
                // Add points if closer
                baseScore += 500 / worthyRooms[key].closestRange;
                worthyRooms[key].claimValue = baseScore;
                possibles[key] = worthyRooms[key];
            }
        let claimTarget = _.max(possibles, 'claimValue').name;
        if (claimTarget) {
            let cache = Memory.auxiliaryTargets || {};
            let tick = Game.time;
            cache[claimTarget] = {
                tick: tick,
                type: 'claimScout',
                priority: 1
            };
            Memory.auxiliaryTargets = cache;
            log.a('Claim Scout Mission For ' + claimTarget + ' Initiated.', 'EXPANSION CONTROL: ');
        }
    }
};