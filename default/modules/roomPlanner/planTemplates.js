/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Bunker/core/lab layout templates.
 */

let protectedStructureTypes = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TERMINAL,
    STRUCTURE_TOWER
];

let bunkerTemplate = [
    {
        "structureType": STRUCTURE_SPAWN,
        "pos": [{"x": -1, "y": -1}, {"x": 0, "y": -1}, {"x": 1, "y": -1}]
    },
    {
        "structureType": STRUCTURE_OBSERVER,
        "pos": [{"x": 5, "y": 5}]
    },
    {
        "structureType": STRUCTURE_FACTORY,
        "pos": [{"x": 0, "y": 2}]
    },
    {
        "structureType": STRUCTURE_TERMINAL,
        "pos": [{"x": -1, "y": 0}]
    },
    {
        "structureType": STRUCTURE_STORAGE,
        "pos": [{"x": 1, "y": 0}]
    },
    {
        "structureType": STRUCTURE_POWER_SPAWN,
        "pos": [{"x": -1, "y": 1}]
    },
    {
        "structureType": STRUCTURE_NUKER,
        "pos": [{"x": 1, "y": 1}]
    },
    {
        "structureType": STRUCTURE_LINK,
        "pos": [{"x": 0, "y": 1}]
    },
    {
        "structureType": STRUCTURE_EXTENSION,
        "pos": [{"x": 5, "y": 0}, {"x": -5, "y": 0}, {"x": 2, "y": 0}, {"x": -2, "y": 0},
            {"x": 3, "y": 1}, {"x": 4, "y": 1}, {"x": -3, "y": 1}, {"x": -4, "y": 1},
            {"x": 2, "y": 2}, {"x": 3, "y": 2}, {"x": 5, "y": 2}, {"x": -2, "y": 2}, {"x": -3, "y": 2}, {
                "x": -5,
                "y": 2
            },
            {"x": 1, "y": 3}, {"x": -1, "y": 3}, {"x": 4, "y": 3}, {"x": -4, "y": 3},
            {"x": 1, "y": 4}, {"x": 2, "y": 4}, {"x": 3, "y": 4}, {"x": 5, "y": 4}, {"x": -1, "y": 4}, {
                "x": -2,
                "y": 4
            }, {"x": -3, "y": 4}, {"x": -5, "y": 4},
            {"x": 1, "y": 5}, {"x": 2, "y": 5}, {"x": 4, "y": 5}, {"x": -1, "y": 5}, {"x": -2, "y": 5}, {
                "x": -4,
                "y": 5
            },
            {"x": 3, "y": -1}, {"x": 4, "y": -1}, {"x": -3, "y": -1}, {"x": -4, "y": -1},
            {"x": 2, "y": -2}, {"x": 3, "y": -2}, {"x": 5, "y": -2}, {"x": -2, "y": -2}, {"x": -3, "y": -2}, {
                "x": -5,
                "y": -2
            },
            {"x": 1, "y": -3}, {"x": -1, "y": -3}, {"x": 4, "y": -3}, {"x": -4, "y": -3},
            {"x": 1, "y": -4}, {"x": 2, "y": -4}, {"x": 3, "y": -4}, {"x": 5, "y": -4}, {"x": -1, "y": -4}, {
                "x": -2,
                "y": -4
            }, {"x": -3, "y": -4}, {"x": -5, "y": -4},
            {"x": 1, "y": -5}, {"x": 2, "y": -5}, {"x": 4, "y": -5}, {"x": -1, "y": -5}, {"x": -2, "y": -5}, {
                "x": -4,
                "y": -5
            }]
    },
    {
        "structureType": STRUCTURE_ROAD,
        "pos": [{"x": 3, "y": 0}, {"x": 4, "y": 0}, {"x": -3, "y": 0}, {"x": -4, "y": 0},
            {"x": 2, "y": 1}, {"x": 5, "y": 1}, {"x": -2, "y": 1}, {"x": -5, "y": 1},
            {"x": 1, "y": 2}, {"x": 4, "y": 2}, {"x": -1, "y": 2}, {"x": -4, "y": 2},
            {"x": 0, "y": 3}, {"x": 2, "y": 3}, {"x": 3, "y": 3}, {"x": 5, "y": 3}, {"x": -2, "y": 3}, {
                "x": -3,
                "y": 3
            }, {"x": -5, "y": 3},
            {"x": 0, "y": 4}, {"x": 4, "y": 4}, {"x": -4, "y": 4},
            {"x": 0, "y": 5}, {"x": 3, "y": 5}, {"x": -3, "y": 5},
            {"x": 2, "y": -1}, {"x": 5, "y": -1}, {"x": -2, "y": -1}, {"x": -5, "y": -1},
            {"x": 0, "y": -2}, {"x": 1, "y": -2}, {"x": 4, "y": -2}, {"x": -1, "y": -2}, {"x": -4, "y": -2},
            {"x": 0, "y": -3}, {"x": 2, "y": -3}, {"x": 3, "y": -3}, {"x": 5, "y": -3}, {"x": -2, "y": -3}, {
                "x": -3,
                "y": -3
            }, {"x": -5, "y": -3},
            {"x": 0, "y": -4}, {"x": 4, "y": -4}, {"x": -4, "y": -4},
            {"x": 0, "y": -5}, {"x": 3, "y": -5}, {"x": -3, "y": -5},]
    },
]

let labTemplate = [{"x": 0, "y": 0}, {"x": 0, "y": 1}, {"x": 1, "y": 0}, {"x": -1, "y": 0}, {"x": 0, "y": -1}, {
    "x": 1,
    "y": -1
}, {"x": 1, "y": 1}, {"x": 0, "y": 2}, {"x": -1, "y": 1}, {"x": -1, "y": 2}];

// Reaction input pair only — production also needs ≥1 output lab (see searchLabHubByRing).
const labHubPairTemplate = [labTemplate[0], labTemplate[1]];

/** 8-adjacent collar around labTemplate (18 tiles). labTech is half-move. */
function offsetsAround(tiles) {
    const inner = new Set();
    for (let i = 0; i < tiles.length; i++) inner.add(tiles[i].x + ',' + tiles[i].y);
    const ring = [];
    const seen = new Set();
    for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const x = t.x + dx;
                const y = t.y + dy;
                const key = x + ',' + y;
                if (inner.has(key) || seen.has(key)) continue;
                seen.add(key);
                ring.push({x, y});
            }
        }
    }
    return ring;
}

const labRoadTemplate = offsetsAround(labTemplate);

// Compact core used when the full bunker template cannot fit.
// Extensions, towers, labs, and late-game singles (factory, power spawn, nuker, observer)
// are placed dynamically — see ensureDynamicSpecialStructures (reserved hub ring).
// Hub (0,0) stays empty for the 0-MOVE hubManager; (0,1) is the hub link
// (same offset as the bunker stamp). Observer is a dynamic special.
const hubLinkOffset = {x: 0, y: 1};

const coreTemplate = [
    {structureType: STRUCTURE_SPAWN, pos: [{x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: -1}]},
    {structureType: STRUCTURE_TERMINAL, pos: [{x: -1, y: 0}]},
    {structureType: STRUCTURE_STORAGE, pos: [{x: 1, y: 0}]},
    {structureType: STRUCTURE_LINK, pos: [hubLinkOffset]},
];

function reservedHubTileKeys(hub) {
    if (!hub || hub.x === undefined || hub.y === undefined) return new Set();
    return new Set([
        `${hub.x},${hub.y}`,
        `${hub.x + hubLinkOffset.x},${hub.y + hubLinkOffset.y}`,
    ]);
}

module.exports = {
    bunkerTemplate,
    coreTemplate,
    hubLinkOffset,
    reservedHubTileKeys,
    labTemplate,
    labHubPairTemplate,
    labRoadTemplate,
    protectedStructureTypes,
};