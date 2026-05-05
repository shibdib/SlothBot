/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleAttacker {
    constructor(creep) {
        this.creep = creep;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.creep.memory.operation) {
            this.operationSelection(this.creep);
        } else if (this.creep.memory.misc && this.creep.memory.misc.guardDog) {
            this.guardDog(this.creep);
        } else {
            this.unassignedTasks(this.creep);
        }
    }

    operationSelection(creep) {
        switch (creep.memory.operation) {
            case 'guard':
                creep.guardRoom();
                break;
            case 'roomDenial':
                creep.denyRoom();
                break;
            case 'borderPatrol':
                creep.borderPatrol();
                break;
        }
    }

    guardDog(creep) {
        creep.say('Woof!', true);
        if (creep.canIWin(5) && creep.handleMilitaryCreep()) return;
        if (!creep.memory.leader) {
            const needsDog = _.find(Game.creeps, (c) => c.my && c.memory.leader && c.memory.squadMembers && c.memory.squadMembers.length && (!c.memory.dog || !Game.getObjectById(c.memory.dog)));
            if (needsDog) {
                creep.memory.leader = needsDog.id;
                needsDog.memory.dog = creep.id;
            } else {
                creep.idleFor(5);
            }
            return;
        }
        const leader = Game.getObjectById(creep.memory.leader);
        if (!leader) return creep.memory.leader = undefined;
        if (creep.room.name !== leader.room.name || creep.pos.getRangeTo(leader) > 3) return creep.shibMove(leader, {range: 3});
    }

    unassignedTasks(creep) {
        if (!Game.getObjectById(creep.memory.target) && creep.memory.destination && creep.memory.destination !== creep.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
        }
        if (!creep.handleMilitaryCreep()) {
            if (creep.memory.destination) {
                creep.room.cacheRoomIntel(true);
                creep.memory.destination = undefined;
            }
            creep.findDefensivePosition(creep);
        }
    }
}

profiler.registerClass(RoleAttacker, 'Attacker');
module.exports = RoleAttacker;

