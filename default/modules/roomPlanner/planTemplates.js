/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Bunker/core/lab layout templates.
 */

let protectedStructureTypes = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TERMINAL,
];

let bunkerTemplate = [
    {
        "structureType": STRUCTURE_SPAWN,
        "pos": [{"x": -1, "y": -1}, {"x": 0, "y": -1}, {"x": 1, "y": -1}]
    },
    {
        "structureType": STRUCTURE_OBSERVER,
        "pos": [{"x": 0, "y": 0}]
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

// Reaction input pair only — production also needs ≥1 output lab (see searchLabHubAnchorsMinProduction).
const labHubPairTemplate = [labTemplate[0], labTemplate[1]];

// Compact core used when the full bunker template cannot fit.
// Only the structures needed from RCL1 onward — extensions, towers, and late-game
// structures (factory, nuker, power spawn) are placed dynamically or wherever they fit.
const coreTemplate = [
    {structureType: STRUCTURE_SPAWN, pos: [{x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: -1}]},
    {structureType: STRUCTURE_OBSERVER, pos: [{x: 0, y: 0}]},
    {structureType: STRUCTURE_TERMINAL, pos: [{x: -1, y: 0}]},
    {structureType: STRUCTURE_STORAGE, pos: [{x: 1, y: 0}]},
];

module.exports = {
    bunkerTemplate,
    coreTemplate,
    labTemplate,
    labHubPairTemplate,
    protectedStructureTypes,
};