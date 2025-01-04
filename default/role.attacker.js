/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleAttacker {
    constructor(creep) {
        this.creep = creep;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.creep.memory.operation) {
            this.operationSelection(this.creep);
        } else {
            this.unassignedTasks(this.creep);
        }
    }

    operationSelection(creep) {
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
    }

    unassignedTasks(creep) {
        if (creep.memory.destination && creep.memory.destination !== creep.room.name) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
        if (!creep.handleMilitaryCreep()) {
            creep.room.cacheRoomIntel(true);
            creep.memory.operation = 'borderPatrol';
            creep.memory.destination = undefined;
            creep.findDefensivePosition(creep);
        }
    }
}

profiler.registerClass(RoleAttacker, 'Attacker');
module.exports = RoleAttacker;

