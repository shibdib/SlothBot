const profiler = require('screeps-profiler');

function segmentManager() {
//Alliance List Management
    let doNotAggress = [
        {"username": "Shibdib", "status": "alliance"},
        {"username": "PostCrafter", "status": "alliance"},
        {"username": "Rising", "status": "alliance"},
        {"username": "wages123", "status": "alliance"},
        {"username": "SpaceRedleg", "status": "alliance"},
        {"username": "Donat", "status": "alliance"},
        {"username": "KageJ", "status": "alliance"},
        {"username": "BrinkDaDrink", "status": "alliance"},
        {"username": "Tyac", "status": "alliance"},
        {"username": "herghost", "status": "alliance"},
        {"username": "kirk", "status": "alliance"},
        {"username": "arcath", "status": "alliance"},
        {"username": "Smokeman", "status": "alliance"},
        {"username": "Pav234", "status": "alliance"},
        {"username": "Picoplankton", "status": "alliance"},
        {"username": "Troedfach", "status": "alliance"},
        {"username": "KOR_Solidarity", "status": "alliance"},
        {"username": "starking1", "status": "alliance"},
        {"username": "droben", "status": "nap"},
        {"username": "Mashee", "status": "nap"}
    ];
    let doNotAggressArray = [
        'Shibdib',
        'PostCrafter',
        'Rising',
        'wages123',
        'SpaceRedleg',
        'Donat',
        'KageJ',
        'BrinkDaDrink',
        'Tyac',
        'herghost',
        'kirk',
        'arcath',
        'Smokeman',
        'Pav234',
        'Picoplankton',
        'Troedfach',
        'KOR_Solidarity',
        'starking1',
        'droben',
        'Mashee'
    ];
    let mainRaw = {
        "api": {
            "version": "draft",
            "update": 19939494
        },
        "channels": {
            "needs": {
                "protocol": "roomneeds",
                "segments": [50],
                "update": 20155510
            },
        }
    };
    let roomNeeds = {
        "W53N83": {
            "power": true,
            "G": true
        }
    };
    RawMemory.segments[1] = JSON.stringify(doNotAggress);
    RawMemory.segments[2] = JSON.stringify(doNotAggressArray);
    if (JSON.stringify(mainRaw) !== RawMemory.segments[10]) RawMemory.segments[10] = JSON.stringify(mainRaw);
    if (JSON.stringify(roomNeeds) !== RawMemory.segments[50]) RawMemory.segments[50] = JSON.stringify(roomNeeds);
    RawMemory.setPublicSegments([1, 2, 10, 50]);
    RawMemory.setDefaultPublicSegment(1);
    RawMemory.setActiveSegments([1, 2, 10, 50]);
}
module.exports.segmentManager = profiler.registerFN(segmentManager, 'segmentManager');