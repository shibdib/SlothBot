/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const towers = require('module.towerController');
let structureCount = {};

class DefenseManager {
    constructor(room) {
        this.room = room;
    }

    run() {
        // Handle tracking structure count
        this.resetStructureCount();

        // Manage towers
        towers.towerControl(this.room);

        // Invader check
        this.room.invaderCheck();

        // Manage ramparts
        if (!Memory._rampartsSet || RAMPART_ACCESS) this.rampartManager();

        // Periodic Nuke Defense Check
        if (Game.time % 100 === 0) this.handleNukeAttack();

        // Manage room attacks
        if (INTEL[this.room.name].threatLevel > 2 || this.room.controller.safeMode) {
            this.alertHostileAttack(this.room);
            this.safeModeManager(this.room);
            INTEL[this.room.name].requestingSupport = true;
        }

        // Check surrounding rooms for high threat
        this.room.memory.earlyWarning = _.some(Game.map.describeExits(this.room.name), roomName => INTEL[roomName] && INTEL[roomName].threatLevel > 2);
    }

    resetStructureCount() {
        if (!structureCount[this.room.name] || structureCount[this.room.name].tick + CREEP_LIFE_TIME < Game.time || structureCount[this.room.name].level !== this.room.level) {
            structureCount[this.room.name] = undefined;
            const criticalStructures = _.filter(this.room.structures, (s) =>
                [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_TERMINAL, STRUCTURE_STORAGE, STRUCTURE_RAMPART].includes(s.structureType));
            structureCount[this.room.name] = {
                tick: Game.time,
                count: criticalStructures.length,
                level: this.room.level
            };
        }
    }

    rampartManager() {
        // Exit early if rampart access is disabled
        if (!RAMPART_ACCESS) {
            Memory._rampartsSet = true;
            _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic).forEach((rampart) => rampart.setPublic(false));
            return;
        }

        // Reset rampartsSet flag when rampart access is allowed
        Memory._rampartsSet = undefined;

        // Open all ramparts if there are no hostile creeps
        if (!this.room.room.hostileCreeps.length) {
            _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic).forEach((rampart) => rampart.setPublic(true));
            return;
        }

        // Handle ramparts based on the presence of friendly or hostile creeps
        const allies = _.filter(this.room.creeps, (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my);
        const hostileCreeps = this.room.hostileCreeps;

        // If there are allies in the room
        if (allies.length) {
            // Close ramparts near enemies
            _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic)
                .forEach((rampart) => {
                    const closestHostile = rampart.pos.findClosestByRange(hostileCreeps);
                    if (closestHostile && rampart.pos.getRangeTo(closestHostile) <= 1) {
                        rampart.setPublic(false);
                    }
                });

            // Open ramparts that are not too close to enemies
            _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic)
                .forEach((rampart) => {
                    const closestHostile = rampart.pos.findClosestByRange(hostileCreeps);
                    if (closestHostile && rampart.pos.getRangeTo(closestHostile) > 1) {
                        rampart.setPublic(true);
                    }
                });
        }
        // If no allies but hostile creeps are present
        else if (hostileCreeps.length) {
            // Close public ramparts that are exposed to enemies
            _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic)
                .forEach((rampart) => rampart.setPublic(false));
        }

        // Close ramparts that are protecting structures or are in the way
        _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic && s.pos.checkForObstacleStructure())
            .forEach((rampart) => rampart.setPublic(false));
    }

    handleNukeAttack() {
        // Find all nukes in the room
        let nukes = this.room.find(FIND_NUKES);
        if (!nukes.length) {
            this.room.memory.nuke = undefined;
            return false;
        }

        // Determine when the closest nuke will land
        this.room.memory.nuke = _.min(nukes, 'timeToLand').timeToLand;

        // Identify the launch room and track its owner for MAD (Mutually Assured Destruction) purposes
        let launchRoom = _.sample(nukes).launchRoomName;
        if (INTEL[launchRoom] && INTEL[launchRoom].owner) {
            let nukeTargets = Memory.MAD || [];
            nukeTargets.push(INTEL[launchRoom].owner);
            Memory.MAD = _.uniq(nukeTargets);
        }

        // If the nuke is landing in less than 75 ticks, order the creeps to flee
        for (let nuke of nukes) {
            if (nuke.timeToLand <= 75) {
                // Fleeing logic: assign a time to flee and the room to flee to
                for (let c of nuke.room.myCreeps) {
                    c.memory.fleeNukeTime = Game.time + nuke.timeToLand + 2;
                    c.memory.fleeNukeRoom = nuke.room.name;
                }
                return true;
            }

            // Protect important structures by creating ramparts around them
            let structures = nuke.pos.findInRange(nuke.room.structures, 5, {
                filter: (s) => [
                    STRUCTURE_SPAWN,
                    STRUCTURE_STORAGE,
                    STRUCTURE_TERMINAL,
                    STRUCTURE_FACTORY,
                    STRUCTURE_POWER_SPAWN
                ].includes(s.structureType)
            });

            // Create ramparts if they don't exist
            for (let structure of structures) {
                if (structure.pos.checkForConstructionSites() || structure.pos.checkForRampart()) continue;
                structure.pos.createConstructionSite(STRUCTURE_RAMPART);
            }
        }
        return true;
    }

    alertHostileAttack() {
        if (!INTEL[this.room.name].alertEmail) {
            INTEL[this.room.name].alertEmail = true;

            // Filter hostile creeps that are not Invaders
            let playerHostile = _.filter(this.room.hostileCreeps, (c) => (
                (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(CLAIM)) &&
                c.owner.username !== 'Invader'
            ));

            if (!playerHostile || !playerHostile.length) return;

            let hostileOwners = _.uniq(playerHostile.map(hostile => hostile.owner.username));

            // Send notification and log the alert
            sendHostileNotification(this.room, hostileOwners);
        }
    }

    safeModeManager() {
        // Ensure camping enemies continue to gain threat even if no creeps present.
        addThreat(this.room);

        // Handle an active safemode
        if (this.room.controller.safeMode) {
            this.room.memory.defenseCooldown = undefined;

            // Setup defense cooldown based on when safemode ends
            if (this.room.controller.safeMode < 750 && this.room.level >= 5) {
                let endingTick = Game.time + this.room.controller.safeMode;
                this.room.memory.defenseCooldown = endingTick + CREEP_LIFE_TIME * 0.5;
            }
            return;
        }

        // Check for available SafeMode
        const activeSafemode = _.find(MY_ROOMS, (r) => Game.rooms[r].controller.safeMode);
        if (activeSafemode || !this.room.controller.safeModeAvailable || this.room.controller.safeModeCooldown) return;

        // Get critical structures
        const criticalStructures = _.filter(this.room.structures, (s) =>
            [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_TERMINAL, STRUCTURE_STORAGE, STRUCTURE_RAMPART].includes(s.structureType));

        // If attack events happened last tick, react to them
        if (criticalStructures.length < structureCount[this.room.name].count && this.room.memory.dangerousAttack) {
            activateSafeMode(this.room);
        }
    }
}

profiler.registerClass(DefenseManager, 'DefenseManager');
module.exports = DefenseManager;

function sendHostileNotification(room, hostileOwners) {
    const historyLink = roomHistoryLink(room.name);
    Game.notify('----------------------');
    Game.notify(`${historyLink} - Enemy detected, room is now in FPCON DELTA.`);
    Game.notify('----------------------');
    Game.notify(`${INTEL[room.name].numberOfHostiles} - Foreign Hostiles Reported`);
    Game.notify('----------------------');
    Game.notify(`Hostile Owners - ${JSON.stringify(hostileOwners)}`);
    Game.notify('----------------------');

    log.a('----------------------');
    log.a(`${roomLink(room.name)} - Enemy detected, room is now in FPCON DELTA.`);
    log.a('----------------------');
    log.a(`${INTEL[room.name].numberOfHostiles} - Foreign Hostiles Reported`);
    log.a('----------------------');
    log.a(`Hostile Owners - ${JSON.stringify(hostileOwners)}`);
    log.a('----------------------');
}

function activateSafeMode(room) {
    if (room.controller.activateSafeMode() === OK) {
        let ownerArray = _.uniq(room.hostileCreeps.map(c => c.owner.username));
        log.a(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(ownerArray), 'DEFENSE COMMAND');
        Game.notify(room.name + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(ownerArray));
    }
}

function addThreat(room) {
    let neutrals = _.uniq(_.pluck(_.filter(room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper'), 'owner.username'));
    if (neutrals.length) {
        for (let user of neutrals) {
            if (user === MY_USERNAME || _.includes(FRIENDLIES, user)) continue;
            let cache = Memory._userList || {};
            let standing;
            if (cache[user]) {
                standing = cache[user]['standing'] + 0.25;
                if (standing >= 1500) standing = 1500;
            } else if (!cache[user]) {
                standing = 25;
                log.e(roomLink(room.name) + ' has detected a neutral.' + user + ' has now been marked hostile for trespassing.', 'DIPLOMACY:');
            }
            cache[user] = {
                standing: standing,
                lastAction: Game.time,
            };
            Memory._userList = cache;
        }
    }
}