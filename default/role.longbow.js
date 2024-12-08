/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleLongbow {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.creep.memory.operation) {
            this.operationManagement();
        } else if (this.creep.memory.destination) {
            this.destinationManagement();
        }
    }

    operationManagement() {
        switch (this.creep.memory.operation) {
            case 'borderPatrol':
                this.creep.borderPatrol();
                break;
            case 'guard':
                this.creep.guardRoom();
                break;
            case 'hold':
                this.creep.holdRoom();
                break;
            case 'harass':
                this.creep.harass();
                break;
            case 'denial':
                this.creep.roomDenial();
                break;
        }
    }

    destinationManagement() {
        if (this.room.name !== this.creep.memory.destination) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22});
        } else {
            if (!this.creep.handleMilitaryCreep() && !this.creep.scorchedEarth() && !this.creep.healCreeps()) this.creep.findDefensivePosition();
        }
    }
}

profiler.registerClass(RoleLongbow, 'Longbow');
module.exports = RoleLongbow;
