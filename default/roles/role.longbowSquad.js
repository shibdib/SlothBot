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
        // Handle rampart fighting
        if (this.creep.fightFromRampart()) return true;
        // Group
        this.creep.formSquad();
        // Boosting
        if (this.creep.tryToBoost()) return true;
        // Blinky mode
        this.creep.healInRange(this.room.hostileCreeps.length || this.room.hostileStructures.length);
    }

    handleLeader() {
        const creep = this.creep;

        // RMA beats single-target rangedAttack when 2+ hostile creeps are in range
        const creepTargetsInRange = this.room.hostileCreeps.filter(c => creep.pos.getRangeTo(c) <= 3);
        if (creepTargetsInRange.length >= 2) {
            creep.rangedMassAttack();
        } else {
            creep.attackInRange();
        }

        // Keep formation in-bounds by orienting followers away from nearby edges
        this.updateOrientation(creep);

        // Resolve squad once before any method that needs it (squadRenewal, retreat check, readiness)
        this.squad = [];
        const liveIds = [];
        for (const id of creep.memory.squadMembers) {
            const m = Game.getObjectById(id);
            if (m) {
                this.squad.push(m);
                liveIds.push(id);
            }
        }
        if (liveIds.length !== creep.memory.squadMembers.length) creep.memory.squadMembers = liveIds;

        // Check squad members
        if (this.squadRenewal(creep)) return true;

        // Tactical retreat: disengage as a unit when 2+ members are critically low
        const criticalCount = this.squad.concat(creep).filter(c => c.hits < c.hitsMax * 0.35).length;
        if (criticalCount >= 2) {
            creep.fleeHome(true);
            return;
        }

        // Formation is only needed when there are active threats or the squad is close to its target.
        // During safe transit, skip the expensive isQuadPacked check and let members move freely.
        const needsFormation = !!(this.room.hostileCreeps.length || this.room.hostileStructures.length || this.nearDestination(creep));

        if (needsFormation) {
            this.broadcastSlotAssignments();
            const isReady = this.hasFullSquad(creep) && this.isQuadPacked(this.squad.concat(creep), creep);
            if (isReady) {
                if (!creep.memory.initialFormUp) creep.memory.initialFormUp = true;
                if (creep.memory.operation) this.operationManagement(); else if (creep.memory.destination) this.destinationManagement();
                else creep.handleMilitaryCreep();
            } else {
                creep.memory.waitingToAssemble = true;
                // Stay put if the current position already accommodates the 2x2 — moving while
                // followers try to converge creates a moving-target problem.
                if (!this.isCurrentPosViable(creep)) {
                    const stagingTarget = this.findStaging(creep);
                    if (stagingTarget) creep.shibMove(stagingTarget, {range: 0, forceSolo: true});
                }
            }
        } else {
            // Safe transit — move freely toward destination, followers will loose-follow
            creep.memory.waitingToAssemble = false;
            if (creep.memory.operation) this.operationManagement();
            else if (creep.memory.destination) this.creep.shibSquadMovement(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
            else creep.handleMilitaryCreep();
        }
    }

    handleFollower() {
        const leader = Game.getObjectById(this.creep.memory.groupLeader);
        if (!leader) {
            this.creep.memory.grouped = undefined;
            this.creep.memory.groupLeader = undefined;
            this.handleSolo();
            return;
        }
        // Set destination to leaders
        this.creep.memory.destination = leader.memory.destination;
        // Double check that you're in the squad
        if (!leader.memory.squadMembers.includes(this.creep.id)) leader.memory.squadMembers.push(this.creep.id);
        // Get in position — skip tight formation during safe transit
        const needsFormation = !!(this.room.hostileCreeps.length || this.room.hostileStructures.length || this.nearDestination(leader));
        if (needsFormation) {
            this.getInPosition(this.creep, leader);
        } else {
            this.creep.shibMove(leader, {range: 2, forceSolo: true});
        }
        // Attack — smarter logic runs first so attackInRange() doesn't consume the action prematurely
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            const hostilesInRange = this.room.hostileCreeps.filter(c => this.creep.pos.getRangeTo(c) <= 3);
            if (hostilesInRange.length >= 2) {
                this.creep.rangedMassAttack();
            } else {
                const partnerTarget = Game.getObjectById(leader.memory.target);
                if (partnerTarget && this.creep.pos.getRangeTo(partnerTarget) <= 3) {
                    this.creep.rangedAttack(partnerTarget);
                } else {
                    this.creep.attackInRange();
                }
            }
        }
    }

    handleSolo() {
        if (!this.creep.handleMilitaryCreep()) this.creep.fleeHome();
    }

    broadcastSlotAssignments() {
        const leader = this.creep;
        const squadOrientation = leader.memory.squadOrientation || 0;
        const offsets = squadOrientation === 0
            ? [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}]
            : [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}];
        const {x: lx, y: ly, roomName} = leader.pos;
        const slots = offsets.map(({dx, dy}) => {
            const nx = lx + dx, ny = ly + dy;
            return (nx >= 0 && nx <= 49 && ny >= 0 && ny <= 49) ? new RoomPosition(nx, ny, roomName) : null;
        });

        const followers = this.squad.filter(f => f && f.pos.roomName === roomName);
        if (!followers.length) return;

        // Try all 6 permutations of slot assignment and pick the one with minimum total travel.
        // This naturally "slides" each follower into the nearest viable slot with no deadlocks.
        const n = Math.min(followers.length, 3);
        const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
        let best = perms[0], bestCost = Infinity;
        for (const perm of perms) {
            let cost = 0, valid = true;
            for (let i = 0; i < n; i++) {
                const slot = slots[perm[i]];
                if (!slot) {
                    valid = false;
                    break;
                }
                cost += followers[i].pos.getRangeTo(slot);
            }
            if (valid && cost < bestCost) {
                bestCost = cost;
                best = perm;
            }
        }

        const assignments = {};
        for (let i = 0; i < n; i++) assignments[followers[i].id] = best[i];
        leader.memory.slotAssignments = assignments;
    }

    getInPosition(creep, leader) {
        if (!leader || !leader.pos || !creep || !creep.pos) return false;
        if (leader.room.name !== creep.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 22, forceSolo: true});
        }
        const squadOrientation = leader.memory.squadOrientation || 0;
        const offsets = squadOrientation === 0
            ? [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}]
            : [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}];
        const {x: lx, y: ly, roomName} = leader.pos;

        // Read the optimal slot assignment broadcast by the leader each tick.
        // Falls back to roster-index if no broadcast exists yet (first tick in formation).
        const assignments = leader.memory.slotAssignments;
        const mySlotIdx = (assignments && assignments[creep.id] !== undefined)
            ? assignments[creep.id]
            : Math.max(0, leader.memory.squadMembers.indexOf(creep.id)) % offsets.length;

        let {dx, dy} = offsets[mySlotIdx];
        let nx = lx + dx, ny = ly + dy;

        // If the assigned slot is out of bounds, mirror to the opposite orientation
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) {
            const alt = squadOrientation === 0
                ? [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}]
                : [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}];
            ({dx, dy} = alt[mySlotIdx]);
            nx = lx + dx;
            ny = ly + dy;
        }

        const targetPos = new RoomPosition(nx, ny, roomName);
        if (creep.pos.isEqualTo(targetPos)) return true;
        return creep.shibMove(targetPos, {range: 0, forceSolo: true}) === OK;
    }

    isCurrentPosViable(creep) {
        const squadOrientation = creep.memory.squadOrientation || 0;
        const offsets = squadOrientation === 0
            ? [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}]
            : [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}];
        const {x, y, roomName} = creep.pos;
        const terrain = creep.room.getTerrain();
        for (const {dx, dy} of offsets) {
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) return false;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) return false;
            if (new RoomPosition(nx, ny, roomName).checkForImpassible(false, true)) return false;
        }
        return true;
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
            // Combat handling — reuse cached squad from handleLeader
            const squad = this.squad || this.creep.memory.squadMembers.map(id => Game.getObjectById(id));
            const isReady = this.hasFullSquad(this.creep) && this.isQuadPacked(squad.concat(this.creep), this.creep);
            // Handle staging
            if (this.creep.memory.misc && this.creep.memory.misc.stagingRoom && this.creep.memory.misc.stagingRoom === this.room.name) return this.creep.memory.misc.staged = true;
            if (isReady) {
                if (this.creep.handleMilitaryCreep()) return;
                if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
            } else {
                if (!this.isCurrentPosViable(this.creep)) {
                    const stagingTarget = this.findStaging(this.creep);
                    if (stagingTarget) this.creep.shibMove(stagingTarget, {range: 0, forceSolo: true});
                }
            }
        }
    }

    hasFullSquad(creep) {
        // Check if the op no longer exists
        if (creep.memory.destination && !['borderPatrol', 'guard'].includes(creep.memory.operation) && !Memory.targetRooms[creep.memory.destination]) {
            creep.memory.operation = HARASSMENT_OPERATIONS ? 'harass' : 'borderPatrol';
            creep.memory.misc = {waitFor: 0};
        }
        if (creep.memory.initialFormUp || !creep.memory.misc || !creep.memory.misc.waitFor) return true;
        // Check if any squadmember needs to renew
        const squad = this.squad || creep.memory.squadMembers.map(id => Game.getObjectById(id));
        if (squad.some(c => !c.memory.boostAttempt)) return false;
        return creep.memory.misc.waitFor <= creep.memory.squadMembers.length + 1;
    }

    isQuadPacked(creeps, leader) {
        const nearDest = this.nearDestination(leader);
        const leaderRoomName = leader.pos.roomName;
        const hasHostiles = leader.room && (leader.room.hostileCreeps.length || leader.room.hostileStructures.length);
        for (let i = 0; i < creeps.length; i++) {
            if (!creeps[i] || creeps[i].pos.roomName !== leaderRoomName) continue;
            if (!hasHostiles && !nearDest) continue;
            const iPos = creeps[i].pos;
            if (iPos.x <= 0 || iPos.x >= 49 || iPos.y <= 0 || iPos.y >= 49) continue;
            for (let j = i + 1; j < creeps.length; j++) {
                if (!creeps[j] || creeps[j].pos.roomName !== leaderRoomName) continue;
                if (!iPos.isNearTo(creeps[j].pos)) return false;
            }
        }
        return true;
    }

    updateOrientation(creep) {
        const {x, y} = creep.pos;
        let o = creep.memory.squadOrientation || 0;

        // Orient toward the nearest threat so followers extend toward the target (range 2-3),
        // not away from it (range 4 = out of attack range).
        // Rule: if target is southeast of leader (dx+dy >= 0) extend southeast (orientation 0);
        //       if target is northwest (dx+dy < 0) extend northwest (orientation 1).
        const knownTarget = Game.getObjectById(creep.memory.target);
        const nearestThreat = knownTarget || _.min(
            this.room.hostileCreeps.concat(this.room.hostileStructures),
            t => creep.pos.getRangeTo(t)
        );
        if (nearestThreat && nearestThreat.pos) {
            const dx = nearestThreat.pos.x - x;
            const dy = nearestThreat.pos.y - y;
            o = (dx + dy >= 0) ? 0 : 1;
        }

        // Wall proximity overrides combat orientation — followers must stay in-bounds
        if (x >= 44 || y >= 44) o = 1;
        else if (x <= 5 || y <= 5) o = 0;

        if (o !== creep.memory.squadOrientation) creep.memory.squadOrientation = o;
    }

    nearDestination(leader) {
        if (!leader.memory.destination) return false;
        return Game.map.getRoomLinearDistance(this.creep.room.name, leader.memory.destination) <= 1;
    }

    squadRenewal(creep) {
        if (creep.memory.initialFormUp || creep.room.level < 7) return;
        if (!creep.memory.hasBoosted && !creep.boostAttempt && creep.handleRenewing(CREEP_LIFE_TIME * 0.8)) return creep.handleRenewing(CREEP_LIFE_TIME * 0.8);
        const squad = this.squad || creep.memory.squadMembers.map(id => Game.getObjectById(id));
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

        const prevStaging = stagingPos[room.name];
        const maxRange = 30;
        for (let range = 0; range <= maxRange; range++) {
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    if (Math.abs(dx) < range && Math.abs(dy) < range) continue;
                    const x = pos.x + dx;
                    const y = pos.y + dy;
                    // Ensure 2x2 block fits within [1,48]
                    if (x < 1 || x + 1 > 48 || y < 1 || y + 1 > 48) continue;
                    // Skip the previously used staging position (check once, not per-offset)
                    if (prevStaging && prevStaging.x === x && prevStaging.y === y) continue;
                    let isClear = true;
                    for (const offset of offsets) {
                        const checkX = x + offset.x;
                        const checkY = y + offset.y;
                        // Bounds already guaranteed by outer check; skip checkIfOutOfBounds()
                        if (terrain.get(checkX, checkY) === TERRAIN_MASK_WALL) {
                            isClear = false;
                            break;
                        }
                        const posToCheck = new RoomPosition(checkX, checkY, room.name);
                        const creepAtPos = posToCheck.checkForCreep();
                        if (posToCheck.checkForImpassible(false, true) ||
                            (creepAtPos && !creep.memory.squadMembers.includes(creepAtPos.id))) {
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


profiler.registerClass(RoleLongbowSquad, 'longbowSquad');
module.exports = RoleLongbowSquad;
