/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleSiegeDuo {
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
        if (this.creep.tryToBoost()) return true;
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
        if (!this.creep.memory.partner && this.creep.hasActiveBodyparts(ATTACK)) {
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
        const isReady = this.hasFullSquad(this.creep) && this.isPartnerNearby(partner, this.creep);

        if (isReady) {
            if (!this.creep.memory.initialFormUp) this.creep.memory.initialFormUp = true;
            if (this.creep.memory.operation) this.operationManagement(); else if (this.creep.memory.destination) this.destinationManagement();
            else this.creep.handleMilitaryCreep();
        } else {
            this.creep.findDefensivePosition();
        }
    }

    handleFollower() {
        const partner = Game.getObjectById(this.creep.memory.partner);
        this.creep.shibMove(partner, {range: 0});
        if (!partner) {
            return this.creep.memory.partner = undefined;
        }
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

    hasFullSquad(creep) {
        if (creep.memory.initialFormUp) return true;
        // Check if any squadmember needs to renew
        const partner = Game.getObjectById(this.creep.memory.partner);
        if (!partner.memory.boostAttempt) return false;
        return !!partner;
    }

    isPartnerNearby(partner, leader) {
        if (!partner || partner.pos.roomName !== partner.pos.roomName || partner.pos.roomName !== leader.pos.roomName) return true;
        if (!partner.room.hostileCreeps.length && !partner.room.hostileStructures.length && !this.nearDestination(leader)) return true;
        if (partner.pos.x <= 0 || partner.pos.x >= 49 || partner.pos.y <= 0 || partner.pos.y >= 49) return true;
        if (!partner.pos.isNearTo(leader.pos) && (!this.nearDestination(leader) || partner.pos.roomName === leader.pos.roomName) && !partner.pos.checkIfOutOfBounds()) return false
        return true
    }

    nearDestination(leader) {
        if (!leader.memory.destination) return false;
        return Game.map.getRoomLinearDistance(this.creep.room.name, leader.memory.destination) <= 1;
    }
}

profiler.registerClass(RoleSiegeDuo, 'siegeDuo');
module.exports = RoleSiegeDuo;
