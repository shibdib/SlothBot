let shib = require("shibBench");

module.exports.claimNewRoom = function () {
    let cpu = Game.cpu.getUsed();
    let avoidRooms = _.filter(Memory.roomCache, (r) => r.level);
    let noClaim = Memory.noClaim || [];
    let worthyRooms = _.filter(Memory.roomCache, (r) => r.claimWorthy && !r.level && !_.includes(noClaim, r.name));
    if (!Memory.lastExpansion) Memory.lastExpansion = Game.time;
    if (worthyRooms.length > 0) {
        let possibles = {};
        loop1:
            for (let key in worthyRooms) {
                let worthyName = worthyRooms[key].name;
                // Check if it's near any owned rooms
                for (let key in avoidRooms) {
                    let distance = Game.map.findRoute(worthyName, avoidRooms[key].name).length;
                    if (distance < 2 || (Game.rooms[worthyName] && Game.rooms[worthyName].controller.my)) {
                        continue loop1;
                    }
                }
                // Make sure it has at least 3 local remote sources
                let neighboring = Game.map.describeExits(worthyName);
                let sourceCount = 0;
                let noIntel = true;
                if (neighboring) {
                    if (neighboring['1']) {
                        if (!Memory.roomCache[neighboring['1']]) {
                            sourceCount++;
                        } else if (!Memory.roomCache[neighboring['1']].user) {
                            noIntel = false;
                            sourceCount += Memory.roomCache[neighboring['1']].sources.length;
                        }
                    }
                    if (neighboring['3']) {
                        if (!Memory.roomCache[neighboring['3']]) {
                            sourceCount++;
                        } else if (!Memory.roomCache[neighboring['3']].user) {
                            noIntel = false;
                            sourceCount += Memory.roomCache[neighboring['3']].sources.length;
                        }
                    }
                    if (neighboring['5']) {
                        if (!Memory.roomCache[neighboring['5']]) {
                            sourceCount++;
                        } else if (!Memory.roomCache[neighboring['5']].user) {
                            noIntel = false;
                            sourceCount += Memory.roomCache[neighboring['5']].sources.length;
                        }
                    }
                    if (neighboring['7']) {
                        if (!Memory.roomCache[neighboring['7']]) {
                            sourceCount++;
                        } else if (!Memory.roomCache[neighboring['7']].user) {
                            noIntel = false;
                            sourceCount += Memory.roomCache[neighboring['7']].sources.length;
                        }
                    }
                }
                if (sourceCount < 3 || noIntel) continue;
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
        }
    }
    shib.shibBench('roomClaiming', cpu);
};