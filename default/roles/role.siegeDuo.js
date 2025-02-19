/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleLongbowSquad {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        // If partner set
        if (this.creep.memory.partner) {
            if (this.creep.memory.leader) {
                this.handleLeader();
            } else {
                this.handleFollower();
            }
        } else {
            this.handleSolo();
        }
    }

    housekeeping() {
        // Boosting
        if (this.creep.tryToBoost([WORK, HEAL])) return true;
        // Blinky mode
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            this.creep.healInRange(true);
        } else {
            this.creep.healInRange();
        }
        // Check and set partner
        if (!Game.getObjectById(this.creep.memory.partner)) {
            this.creep.memory.leader = undefined;
            this.creep.memory.partner = undefined;
        }
        if (!this.creep.memory.partner && this.creep.hasActiveBodyparts(WORK)) {
            const availablePartner = _.find(Game.creeps, (c) => c.id !== this.creep.id && c.my && !c.spawning
                && c.memory.role === this.creep.memory.role && c.hasActiveBodyparts(HEAL) && !c.memory.partner
                && c.memory.destination === this.creep.memory.destination);
            if (availablePartner) {
                this.creep.memory.leader = true;
                this.creep.memory.partner = availablePartner.id;
                availablePartner.memory.partner = this.creep.id;
            }
        }
    }

    handleLeader() {
        const partner = Game.getObjectById(this.creep.memory.partner);
        if (!this.creep.pos.isNearTo(partner) || partner.fatigue) {
            if (partner.room.name === this.room.name) this.creep.shibMove(partner); else this.handleSolo();
        } else {
            if (this.creep.memory.operation) {
                this.operationManagement();
            } else if (this.creep.memory.destination) {
                this.destinationManagement();
            }
        }
    }

    handleFollower() {
        const partner = Game.getObjectById(this.creep.memory.partner);
        this.creep.shibMove(partner, {range: 0});
        if (partner.memory.idle) {
            this.creep.memory.idle = partner.memory.idle;
        }
    }

    handleSolo() {
        if (this.creep.handleMilitaryCreep()) return;
        if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
    }

    operationManagement() {
        switch (this.creep.memory.operation) {
            case 'stronghold':
                this.creep.strongholdAttack();
                break;
            case 'roomDenial':
                this.creep.denyRoom();
                break;
        }
    }

    destinationManagement() {
        if (this.room.name !== this.creep.memory.destination) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22});
        } else {
            // If we can't get to the controller or sources, clear a path
            if (!this.creep.scorchedEarth()) {
                this.room.cacheRoomIntel(true);
                this.creep.recycleCreep();
            }
        }
    }
}

profiler.registerClass(RoleLongbowSquad, 'longbowSquad');
module.exports = RoleLongbowSquad;
