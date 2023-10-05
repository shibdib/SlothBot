/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.memory.operation) {
        switch (creep.memory.operation) {
            case 'guard':
                creep.guardRoom();
                break;
            case 'hold':
                creep.holdRoom();
                break;
            case 'borderPatrol':
                creep.borderPatrol();
                break;
        }
    } else {
        if (creep.memory.destination && creep.memory.destination !== creep.room.name) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
        if (!creep.handleMilitaryCreep() && !creep.scorchedEarth()) {
            creep.memory.operation = 'borderPatrol';
            creep.memory.destination = undefined;
            creep.findDefensivePosition(creep);
        }
    }
};
