/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

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
            case 'roomDenial':
                this.creep.denyRoom();
                break;
            case 'harass':
                this.creep.harass();
                break;
            case 'remoteDenial':
                this.creep.remoteDenial();
                break;
        }
    }

    destinationManagement() {
        // Combat handling
        if (this.creep.handleMilitaryCreep()) return;

        // Healing
        if (this.creep.hits < this.creep.hitsMax) {
            if (this.creep.hasActiveBodyparts(HEAL)) {
                this.creep.findDefensivePosition();
                return this.creep.heal(this.creep);
            } else {
                return this.creep.fleeHome();
            }
        }

        if (this.room.name !== this.creep.memory.destination) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22});
        } else {
            if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
        }
    }
}

profiler.registerClass(RoleLongbow, 'Longbow');
module.exports = RoleLongbow;
