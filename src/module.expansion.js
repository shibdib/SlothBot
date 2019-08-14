/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.claimNewRoom = function () {
    let noClaim = Memory.noClaim || [];
    let worthyRooms = _.filter(Memory.roomCache, (r) => !r.user && r.mineral && r.sources === 2 && r.closestRange <= 12 && !_.includes(noClaim, r));
    if (!Memory.lastExpansion) Memory.lastExpansion = Game.time;
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
                if (sourceCount < 4) continue;
                baseScore += (sourceCount * 70);
                // Swamps suck
                let terrain = new Room.Terrain(name);
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
                let minerals = [];
                Memory.ownedRooms.forEach((r) => minerals.push(r.mineral[0].mineralType));
                if (worthyRooms[key].mineral && !_.includes(minerals, worthyRooms[key].mineral)) baseScore += 450;
                // Check if it's near any owned rooms
                let avoidRooms = _.filter(Memory.roomCache, (r) => r.level);
                for (let key in avoidRooms) {
                    let distance = Game.map.findRoute(key, avoidRooms[key].name).length;
                    if (distance < 2 || (Game.rooms[key] && Game.rooms[key].controller.my)) continue loop1;
                }
                worthyRooms[key].claimValue = baseScore;
                possibles[key] = worthyRooms[key];
            }
        let claimTarget = _.max(possibles, 'claimValue').name;
        if (claimTarget) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[claimTarget] = {
                tick: tick,
                type: 'claimScout',
                priority: 1
            };
            Memory.targetRooms = cache;
            log.a('Claim Scout Mission For ' + claimTarget + ' Initiated.', 'EXPANSION CONTROL: ');
        }
    }
};