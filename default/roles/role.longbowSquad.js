/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const stagingPos = {};

class RoleLongbowSquad {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        // If partner set
        if (this.creep.memory.grouped || this.creep.memory.leader) {
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
        // Group
        this.creep.formSquad();
        // Boosting
        if (this.creep.tryToBoost([HEAL])) return true;
        // Blinky mode
        this.creep.healInRange(this.room.hostileCreeps.length || this.room.hostileStructures.length);
    }

    handleLeader() {
        const creep = this.creep;
        creep.attackInRange();

        // Check squad members
        if (this.squadRenewal(creep)) return true;

        for (const member of creep.memory.squadMembers) {
            const memberCreep = Game.getObjectById(member);
            if (!memberCreep) creep.memory.squadMembers = creep.memory.squadMembers.filter((c) => c !== member);
        }

        // Squad readiness check
        const squad = creep.memory.squadMembers.map(id => Game.getObjectById(id));
        const isReady = this.hasFullSquad(creep) && this.isQuadPacked(squad.concat(creep), creep);

        if (isReady) {
            if (!creep.memory.initialFormUp) creep.memory.initialFormUp = true;
            if (creep.memory.operation) this.operationManagement(); else if (creep.memory.destination) this.destinationManagement();
            else creep.handleMilitaryCreep();
        } else {
            creep.shibMove(this.findStaging(creep), {range: 0, forceSolo: true})
        }
    }

    handleFollower() {
        this.creep.attackInRange();
        const leader = Game.getObjectById(this.creep.memory.groupLeader);
        if (!leader) {
            this.creep.memory.grouped = undefined;
            this.creep.memory.groupLeader = undefined;
            this.handleSolo();
        } else {
            // Set destination to leaders
            this.creep.memory.destination = leader.memory.destination;
            // Double check that you're in the squad
            if (!leader.memory.squadMembers.includes(this.creep.id)) leader.memory.squadMembers.push(this.creep.id);
            // Get in position
            this.getInPosition(this.creep, leader);
            // Attack target
            if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
                const partnerTarget = Game.getObjectById(leader.memory.target);
                if (partnerTarget && this.creep.pos.getRangeTo(partnerTarget) <= 3) {
                    if (this.creep.pos.isNearTo(partnerTarget)) this.creep.rangedMassAttack(); else this.creep.rangedAttack(partnerTarget);
                }
            }
        }
    }

    handleSolo() {
        if (!this.creep.handleMilitaryCreep()) this.creep.fleeHome();
    }

    getInPosition(creep, leader) {
        if (!leader || !leader.pos || !creep || !creep.pos) return false;
        const squadOrientation = leader.memory.squadOrientation || 0;
        const squadPositions = squadOrientation === 0
            ? [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}]
            : [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}];
        const leaderPos = leader.pos;
        const absolutePositions = squadPositions.map(offset => {
            const pos = new RoomPosition(Math.min(49, leaderPos.x + offset.dx), Math.min(49, leaderPos.y + offset.dy), leaderPos.roomName);
            return (pos.x < 0 || pos.x > 49 || pos.y < 0 || pos.y > 49) ? null : pos;
        }).filter(pos => pos);
        const creepPos = creep.pos;
        if (absolutePositions.some(pos => pos && pos.isEqualTo(creepPos))) return true;
        const occupiedPositions = creep.room.find(FIND_MY_CREEPS)
            .filter(c => c.id !== creep.id)
            .map(c => c.pos);
        const availablePositions = absolutePositions.filter(pos =>
            pos && !occupiedPositions.some(occ => occ && occ.isEqualTo(pos))
        );
        const nearestSquadDistance = Math.min(...absolutePositions.map(pos => pos ? creepPos.getRangeTo(pos) : Infinity));
        if (nearestSquadDistance === 1) {
            const slidePos = trySlide(creep, absolutePositions, occupiedPositions, leader);
            if (slidePos) return creep.move(creepPos.getDirectionTo(slidePos)) === OK;
        }
        const closest = availablePositions.length
            ? creepPos.findClosestByPath(availablePositions, {range: 0, ignoreCreeps: false})
            : null;
        const target = closest || leaderPos;
        return target && !creepPos.isEqualTo(target)
            ? creep.moveTo(target, {range: closest ? 0 : 1}) === OK
            : false;
    }

    operationManagement() {
        switch (this.creep.memory.operation) {
            case 'borderPatrol':
                this.creep.borderPatrol();
                break;
            case 'guard':
                this.creep.guardRoom();
                break;
            case 'stronghold':
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
        let destination = this.creep.memory.misc && this.creep.memory.misc.stagingRoom && !this.creep.memory.misc.staged ? this.creep.memory.misc.stagingRoom : this.creep.memory.destination;
        if (this.room.name !== destination) {
            return this.creep.shibSquadMovement(new RoomPosition(25, 25, destination), {range: 22});
        } else {
            // Combat handling
            const squad = this.creep.memory.squadMembers.map(id => Game.getObjectById(id));
            const isReady = this.hasFullSquad(this.creep) && this.isQuadPacked(squad.concat(this.creep), this.creep);
            // Handle staging
            if (this.creep.memory.misc && this.creep.memory.misc.stagingRoom && this.creep.memory.misc.stagingRoom === this.room.name) return this.creep.memory.misc.staged = true;
            if (isReady) {
                if (this.creep.handleMilitaryCreep()) return;
                if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
            } else {
                this.creep.shibMove(this.findStaging(this.creep), {range: 0, forceSolo: true});
            }
        }
    }

    hasFullSquad(creep) {
        if (creep.memory.initialFormUp || !creep.memory.misc || !creep.memory.misc.waitFor) return true;
        // Check if any squadmember needs to renew
        const squad = creep.memory.squadMembers.map(id => Game.getObjectById(id));
        if (squad.some(c => !c.memory.boostAttempt)) return false;
        return creep.memory.misc.waitFor <= creep.memory.squadMembers.length + 1;
    }

    isQuadPacked(creeps, leader) {
        for (let i = 0; i < creeps.length; i++) {
            for (let j = i + 1; j < creeps.length; j++) {
                if (!creeps[i] || creeps[i].pos.roomName !== creeps[j].pos.roomName || creeps[i].pos.roomName !== leader.pos.roomName) continue;
                if (!creeps[i].room.hostileCreeps.length && !creeps[i].room.hostileStructures.length && !this.nearDestination(leader)) continue;
                if (creeps[i].pos.x <= 0 || creeps[i].pos.x >= 49 || creeps[i].pos.y <= 0 || creeps[i].pos.y >= 49) continue;
                if (!creeps[i].pos.isNearTo(creeps[j].pos) && (!this.nearDestination(leader) || creeps[i].pos.roomName === leader.pos.roomName) && !creeps[i].pos.checkIfOutOfBounds()) return false
            }
        }
        return true
    }

    nearDestination(leader) {
        if (!leader.memory.destination) return false;
        return Game.map.getRoomLinearDistance(this.creep.room.name, leader.memory.destination) <= 1;
    }

    squadRenewal(creep) {
        if (creep.memory.initialFormUp || creep.room.level < 7) return;
        if (!creep.memory.hasBoosted && !creep.boostAttempt && creep.handleRenewing(CREEP_LIFE_TIME * 0.8)) return creep.handleRenewing(CREEP_LIFE_TIME * 0.8);
        const squad = creep.memory.squadMembers.map(id => Game.getObjectById(id));
        if (squad.some(c => c && !c.memory.hasBoosted && !c.memory.boostAttempt && c.handleRenewing(CREEP_LIFE_TIME * 0.8))) return _.min(squad, c => c.ticksToLive).handleRenewing(CREEP_LIFE_TIME * 0.8);
    }

    findStaging(creep) {
        const room = creep.room;
        const pos = creep.pos;
        if (stagingPos[room.name] && stagingPos[room.name].tick + 20 > Game.time) {
            return new RoomPosition(stagingPos[room.name].x, stagingPos[room.name].y, room.name);
        }
        const terrain = room.getTerrain();

        const offsets = [
            {x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 0}, {x: 1, y: 1}
        ];

        const maxRange = 30;
        for (let range = 0; range <= maxRange; range++) {
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    if (Math.abs(dx) < range && Math.abs(dy) < range) continue;
                    const x = pos.x + dx;
                    const y = pos.y + dy;
                    if (x < 1 || x + 1 > 48 || y < 1 || y + 1 > 48) continue;
                    let isClear = true;
                    for (const offset of offsets) {
                        const checkX = x + offset.x;
                        const checkY = y + offset.y;
                        // Dont reuse
                        if (stagingPos[room.name] && stagingPos[room.name].x === checkX && stagingPos[room.name].y === checkY) {
                            isClear = false;
                            break;
                        }
                        const posToCheck = new RoomPosition(checkX, checkY, room.name);
                        if (posToCheck.checkIfOutOfBounds() || [TERRAIN_MASK_WALL].includes(terrain.get(checkX, checkY))) {
                            isClear = false;
                            break;
                        }
                        if (posToCheck.checkForImpassible(false, true) ||
                            (posToCheck.checkForCreep() && !creep.memory.squadMembers.includes(posToCheck.checkForCreep().id))) {
                            isClear = false;
                            break;
                        }
                    }
                    if (isClear) {
                        stagingPos[room.name] = {x: x, y: y, tick: Game.time};
                        return new RoomPosition(x, y, room.name);
                    }
                }
            }
        }
        return null;
    }
}

// Helper function to attempt sliding to an adjacent squad position
function trySlide(creep, squadPositions, occupiedPositions, leader) {
    const creepPos = creep.pos;
    const adjacentSquad = squadPositions.filter(pos => pos && creepPos.getRangeTo(pos) === 1);
    for (const target of adjacentSquad) {
        if (!target) continue;
        if (occupiedPositions.some(occ => occ && occ.isEqualTo(target))) {
            const alternatives = adjacentSquad.filter(alt =>
                alt &&
                alt.getRangeTo(target) === 1 &&
                !occupiedPositions.some(occ => occ && occ.isEqualTo(alt)) &&
                creep.room.getTerrain().get(alt.x, alt.y) !== TERRAIN_MASK_WALL
            );
            if (alternatives.length) return alternatives[0];
        }
    }
    return null;
}

profiler.registerClass(RoleLongbowSquad, 'longbowSquad');
module.exports = RoleLongbowSquad;
