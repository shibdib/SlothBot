/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.tryToBoost(['ranged', 'heal'])) return;
    // Responder Mode
    if (creep.memory.operation) {
        switch (creep.memory.operation) {
            case 'borderPatrol':
                creep.borderPatrol();
                break;
            case 'guard':
                creep.guardRoom();
                break;
            case 'hold':
                creep.holdRoom();
                break;
            case 'harass':
                creep.harass();
                break;
            case 'siegeGroup':
                creep.siegeGroupRoom();
                break;
        }
    } else if (creep.memory.destination) {
        if (creep.room.name !== creep.memory.destination) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
        } else {
            // Handle combat
            if (this.canIWin(50)) {
                if (!this.handleMilitaryCreep() && !this.scorchedEarth()) this.findDefensivePosition();
            } else {
                this.shibKite();
            }
        }
    }
};
