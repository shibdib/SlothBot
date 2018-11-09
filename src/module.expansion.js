let shib = require("shibBench");

module.exports.claimNewRoom = function () {
    let cpu = Game.cpu.getUsed();
    let avoidRooms = _.filter(Memory.roomCache, (r) => r.owner);
    let worthyRooms = _.filter(Memory.roomCache, (r) => r.claimWorthy && !r.owner);
    if (!Memory.lastExpansion) Memory.lastExpansion = Game.time;
    if (worthyRooms.length > 0) {
        let possibles = {};
        loop1:
            for (let key in worthyRooms) {
                let worthyName = worthyRooms[key].name;
                // Check if it's near any owned rooms
                for (let key in avoidRooms) {
                    let name = avoidRooms[key].name;
                    let distance = Game.map.findRoute(worthyName, name).length;
                    if (distance < 2 || distance > 10 || (Game.rooms[worthyName] && Game.rooms[worthyName].controller.my) || (Memory.noClaim && _.includes(Memory.noClaim, worthyName))) {
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
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'claimScout',
                manual: true,
                priority: 1,
                claim: true
            };
            Memory.targetRooms = cache;
        }
    }
    shib.shibBench('roomClaiming', cpu);
};