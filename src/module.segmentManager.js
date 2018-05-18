const profiler = require('screeps-profiler');

function segmentManager() {
//Alliance List Management
    let doNotAggressArray;
    if (!!~['shard0','shard1','shard2'].indexOf(Game.shard.name)) {
        doNotAggressArray = global.LOANlist;
    } else if (Game.shard.name === 'swc') {
        doNotAggressArray = ['Shibdib']
    } else {
        doNotAggressArray = [MY_USERNAME];
    }
    let mainRaw = {
        "api": {
            "version": "v1.0.0",
            "update": 19939494
        },
        "channels": {
            "needs": {
                "protocol": "roomneeds",
                "segments": [50],
                "update": Game.time
            },
        }
    };
    let roomNeeds = {
        "W48S28": {
            "modified": Game.time,
            "energy": true,
            "XGH2O": true
        },
        "W51S25": {
            "modified": Game.time,
            "power": true
        },
        "W46S27": {
            "modified": Game.time,
            "G": true,
            "H": true
        },
    };
    if (JSON.stringify(mainRaw) !== RawMemory.segments[10]) RawMemory.segments[10] = JSON.stringify(mainRaw);
    if (JSON.stringify(roomNeeds) !== RawMemory.segments[50]) RawMemory.segments[50] = JSON.stringify(roomNeeds);
    RawMemory.segments[2] = JSON.stringify(doNotAggressArray);
    RawMemory.setPublicSegments([1, 2, 10, 50]);
    RawMemory.setDefaultPublicSegment(1);
    RawMemory.setActiveSegments([1, 2, 10, 50]);
}
module.exports.segmentManager = profiler.registerFN(segmentManager, 'segmentManager');