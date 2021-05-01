/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');
module.exports.role = function (creep) {
    // Swarm
    if (creep.memory.operation) {
        switch (creep.memory.operation) {
            case 'swarm':
                creep.swarmRoom();
                return;
        }
    }
    // Hud
    hud(creep);
    // Set visited
    if (!creep.memory.other.visited) creep.memory.other.visited = [];
    // Attack in range
    creep.attackInRange();
    // Handle healing
    creep.healInRange();
    // Handle flee
    if (creep.memory.runCooldown || (!creep.getActiveBodyparts(RANGED_ATTACK) && !creep.getActiveBodyparts(ATTACK))) return creep.fleeHome(true);
    // Move if needed
    if (creep.memory.other.destination && creep.room.name !== creep.memory.other.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.other.destination), {range: 22});
    if (creep.room.name === creep.memory.other.destination || !creep.memory.other.destination) {
        Memory.roomCache[creep.room.name].lastMarauder = Game.time;
        if ((!creep.room.hostileCreeps.length && !creep.room.hostileStructures.length) || !creep.canIWin(15) || !creep.handleMilitaryCreep()) {
            highCommand.generateThreat(creep);
            if (creep.canIWin(15) && creep.scorchedEarth()) return;
            if (!creep.memory.other.onScene) creep.memory.other.onScene = Game.time;
            // If on target and cant win find a new target
            if (creep.memory.other.onScene + 25 < Game.time || !creep.canIWin()) {
                creep.memory.other.visited.push(creep.memory.other.destination);
                creep.memory.other.destination = undefined;
                creep.memory.other.onScene = undefined;
                creep.memory.awaitingTarget = true;
            }
            if (!creep.shibKite()) creep.findDefensivePosition();
        }
    }
};

function hud(creep) {
    try {
        let response = creep.memory.other.destination || creep.room.name;
        Game.map.visual.text('Poker', new RoomPosition(17, 3, response), {
            color: '#d68000',
            fontSize: 3,
            align: 'left'
        });
        if (response !== creep.room.name && creep.memory._shibMove && creep.memory._shibMove.route) {
            let route = [];
            for (let routeRoom of creep.memory._shibMove.route) {
                if (routeRoom === creep.room.name) route.push(new RoomPosition(creep.pos.x, creep.pos.y, routeRoom));
                else route.push(new RoomPosition(25, 25, routeRoom));
            }
            for (let posNumber = 0; posNumber++; posNumber < route.length) {
                Game.map.visual.line(route[posNumber], route[posNumber + 1])
            }
        }
    } catch (e) {
    }
}
