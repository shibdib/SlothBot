/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const towers = require('module.towerController');
const {addToMad} = require('hcNukes');
const ROOM_STATE_CACHE = {};
const PLAYER_HOSTILE_PARTS = [ATTACK, RANGED_ATTACK, WORK, CLAIM];

// Re-send an "ongoing attack" reminder at most this often (~3 hours real time)
const ALERT_REMINDER_TICKS = CREEP_LIFE_TIME * 2;
// Email grouping window passed to Game.notify (minutes)
const ALERT_GROUP_MINUTES = 30;
// track attackstate for each room
const ALERT_STATE_TRACKING = {};

class DefenseManager {
    constructor(room) {
        this.room = room;
    }

    run() {
        if (Game.time % 1000 === 0) this._pruneRoomStateCache();

        towers.towerController(this.room);
        this.room.invaderCheck();

        const intel = INTEL[this.room.name];
        const armedHostiles = this.room.hostileCreeps.filter(c =>
            PLAYER_HOSTILE_PARTS.some(p => c.hasActiveBodyparts(p))
        );
        const playerArmed = armedHostiles.filter(c => c.owner && c.owner.username !== 'Invader');
        const underAttack = armedHostiles.length > 0;

        // towerController used to set this â€” labTech, shuttle, terminal, and spawn still read it
        if (underAttack) {
            ALERT_STATE_TRACKING[this.room.name] = Game.time;
            this.room.memory.dangerousAttack = true;
            this.alertHostileAttack();
            if (playerArmed.length) {
                this.safeModeManager();
                if (intel) intel.requestingSupport = true;
            }
        } else {
            // Clear attack state immediately so economy/military response logic (e.g. guard spawns)
            // stops treating the room as threatened once hostiles are gone. Notification timing
            // (reminders + all-clear) is handled separately via ALERT_STATE_TRACKING / _defenseAlerts.
            this.room.memory.dangerousAttack = undefined;
            if (intel) intel.requestingSupport = undefined;
            if (!ALERT_STATE_TRACKING[this.room.name] || Game.time - ALERT_STATE_TRACKING[this.room.name] > ALERT_REMINDER_TICKS) {
                clearHostileAlert(this.room);
                delete ALERT_STATE_TRACKING[this.room.name];
            }
        }

        if (!Memory._rampartsSet || RAMPART_ACCESS) this.rampartManager();

        if (Game.time % 100 === 0) this.handleNukeAttack();

        this.room.memory.earlyWarning = _.some(
            Object.values(Game.map.describeExits(this.room.name)),
            roomName => INTEL[roomName] && INTEL[roomName].threatLevel > 4
        );
    }

    _pruneRoomStateCache() {
        for (const name of Object.keys(ROOM_STATE_CACHE)) {
            if (!Game.rooms[name]) delete ROOM_STATE_CACHE[name];
        }
    }

    rampartManager() {
        const roomName = this.room.name;
        const currentTick = Game.time;

        // Cache room state once per tick
        if (!ROOM_STATE_CACHE[roomName] || ROOM_STATE_CACHE[roomName].tick !== currentTick) {
            const allies = this.room.creeps.filter(c =>
                c.owner && _.includes(FRIENDLIES, c.owner.username) && !c.my
            );
            ROOM_STATE_CACHE[roomName] = {
                ramparts: this.room.ramparts,
                allies,
                hostileCreeps: this.room.hostileCreeps,
                tick: currentTick
            };
        }

        const state = ROOM_STATE_CACHE[roomName];

        if (!RAMPART_ACCESS) {
            Memory._rampartsSet = true;
            for (let rampart of state.ramparts) {
                if (rampart.isPublic) rampart.setPublic(false);
            }
            return;
        }

        Memory._rampartsSet = undefined;

        if (!state.hostileCreeps.length) {
            for (let rampart of state.ramparts) {
                if (!rampart.isPublic) rampart.setPublic(true);
            }
            return;
        }

        if (state.allies.length) {
            for (let rampart of state.ramparts) {
                if (rampart.isPublic) {
                    const closestHostile = rampart.pos.findClosestByRange(state.hostileCreeps);
                    if (closestHostile && rampart.pos.getRangeTo(closestHostile) <= 1) {
                        rampart.setPublic(false);
                    }
                } else {
                    const closestHostile = rampart.pos.findClosestByRange(state.hostileCreeps);
                    if (closestHostile && rampart.pos.getRangeTo(closestHostile) > 1) {
                        rampart.setPublic(true);
                    }
                }
            }
        } else if (state.hostileCreeps.length) {
            for (let rampart of state.ramparts) {
                if (rampart.isPublic) rampart.setPublic(false);
            }
        }

        for (let rampart of state.ramparts) {
            if (rampart.isPublic && rampart.pos.checkForObstacleStructure()) {
                rampart.setPublic(false);
            }
        }
    }

    handleNukeAttack() {
        const currentTick = Game.time;
        const roomName = this.room.name;
        const nukes = this.room.find(FIND_NUKES);
        if (!nukes.length) {
            this.room.memory.nuke = undefined;
            return false;
        }

        this.room.memory.nuke = _.min(nukes, 'timeToLand').timeToLand;

        const launchRoom = nukes[0].launchRoomName;
        const launchIntel = INTEL[launchRoom];
        if (launchIntel && launchIntel.owner) {
            addToMad(launchIntel.owner);
        }

        const criticalStructures = this.room.structures.filter(s => [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN].includes(s.structureType));

        for (let nuke of nukes) {
            if (nuke.timeToLand <= 75) {
                for (let c of this.room.myCreeps) {
                    c.memory.fleeNukeTime = currentTick + nuke.timeToLand + 2;
                    c.memory.fleeNukeRoom = roomName;
                }
                return true;
            }

            const nearbyStructures = [];
            for (let s of criticalStructures) {
                if (nuke.pos.getRangeTo(s.pos) <= 5) nearbyStructures.push(s);
            }

            for (let structure of nearbyStructures) {
                if (structure.pos.checkForConstructionSites() || structure.pos.checkForRampart()) continue;
                structure.pos.createConstructionSite(STRUCTURE_RAMPART);
            }
        }
        return true;
    }

    alertHostileAttack() {
        const playerHostile = this.room.hostileCreeps.filter(c =>
            c.owner &&
            c.owner.username !== 'Invader' &&
            PLAYER_HOSTILE_PARTS.some(p => c.hasActiveBodyparts(p))
        );
        if (!playerHostile.length) return;

        const hostileOwners = _.uniq(playerHostile.map(c => c.owner.username)).sort();
        sendHostileNotification(this.room, hostileOwners);
    }

    safeModeManager() {
        const room = this.room;
        const intel = INTEL[room.name];
        addThreat(room);

        if (room.controller.safeMode) {
            room.memory.defenseCooldown = undefined;
            if (room.controller.safeMode < 750 && room.level >= 5) {
                room.memory.defenseCooldown = Game.time + room.controller.safeMode + CREEP_LIFE_TIME * 0.5;
            }
            return;
        }

        const activeSafemode = MY_ROOMS.find(r => {
            const other = Game.rooms[r];
            return other && other.controller && other.controller.safeMode;
        });

        if (activeSafemode || !room.controller.safeModeAvailable || room.controller.safeModeCooldown) return;

        const criticalTypes = [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN, STRUCTURE_EXTENSION];
        const damagedStructures = room.structures.find(s => criticalTypes.includes(s.structureType) && s.hits < s.hitsMax);
        const spawn = room.spawns[0];

        if (damagedStructures || (room.controller.level >= 6 && !spawn)) {
            room.memory.safeModeInfo = {
                tick: Game.time,
                attackers: intel && intel.hostileOwners,
                level: intel && intel.threatLevel
            };
            activateSafeMode(room);
        }
    }
}

profiler.registerClass(DefenseManager, 'DefenseManager');
module.exports = DefenseManager;

function sendHostileNotification(room, hostileOwners) {
    Memory._defenseAlerts = Memory._defenseAlerts || {};
    const intel = INTEL[room.name] || {};
    const state = Memory._defenseAlerts[room.name];
    const ownersKey = hostileOwners.join(',');
    const threatLevel = intel.threatLevel || 0;
    const hostileCount = intel.numberOfHostiles || 0;
    const hostilePower = intel.hostilePower || 0;
    const friendlyPower = intel.friendlyPower || 0;

    // Decide whether this tick warrants an alert
    let reason;
    if (!state) {
        reason = 'INITIAL';
    } else if (state.ownersKey !== ownersKey) {
        reason = 'NEW ATTACKER';
    } else if (threatLevel > (state.peakThreat || 0)) {
        reason = 'ESCALATION';
    } else if (Game.time - state.lastAlert >= ALERT_REMINDER_TICKS) {
        reason = 'ONGOING';
    }

    // Persist running state regardless of whether we notify (keeps peaks current
    // so the eventual all-clear summary is accurate)
    Memory._defenseAlerts[room.name] = {
        firstAlert: state ? state.firstAlert : Game.time,
        lastAlert: state && !reason ? state.lastAlert : Game.time,
        ownersKey: ownersKey,
        peakThreat: Math.max(threatLevel, (state && state.peakThreat) || 0),
        peakHostiles: Math.max(hostileCount, (state && state.peakHostiles) || 0),
    };

    if (INTEL[room.name]) INTEL[room.name].alertEmail = true;
    if (!reason) return;

    const historyLink = roomHistoryLink(room.name);
    const summary = `${room.name} [${reason}] hostiles=${hostileCount} threat=${threatLevel} power H/F=${hostilePower}/${friendlyPower} owners=${ownersKey}`;

    // Single email with grouping so repeat sends within the window collapse server-side
    Game.notify(summary, ALERT_GROUP_MINUTES);

    log.a(`${historyLink} [${reason}] hostiles=${hostileCount} threat=${threatLevel} power H/F=${hostilePower}/${friendlyPower}`, 'DEFENSE');
    log.a(`owners: ${ownersKey}`, 'DEFENSE');
}

function clearHostileAlert(room) {
    if (!Memory._defenseAlerts || !Memory._defenseAlerts[room.name]) return;
    const state = Memory._defenseAlerts[room.name];
    delete Memory._defenseAlerts[room.name];

    // Only bother announcing all-clear for attacks that were actually meaningful
    if ((state.peakThreat || 0) < 3) return;
    const duration = Game.time - (state.firstAlert || Game.time);
    const summary = `${room.name} [ALL CLEAR] attack ended after ${duration} ticks. peak hostiles=${state.peakHostiles} peak threat=${state.peakThreat} owners=${state.ownersKey}`;
    Game.notify(summary, ALERT_GROUP_MINUTES);
    log.a(`${roomLink(room.name)} all clear after ${duration} ticks. Peak: ${state.peakHostiles} hostiles, threat ${state.peakThreat}, owners ${state.ownersKey}`, 'DEFENSE');
}

function activateSafeMode(room) {
    if (room.controller.activateSafeMode() === OK) {
        let ownerArray = _.uniq(room.hostileCreeps.map(c => c.owner.username));
        log.a(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(ownerArray), 'DEFENSE COMMAND');
        Game.notify(room.name + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(ownerArray));
    }
}

function addThreat(room) {
    const neutrals = _.uniq(room.hostileCreeps
        .filter(c => c.owner && !_.includes(FRIENDLIES, c.owner.username) &&
            c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper')
        .map(c => c.owner.username));
    if (neutrals.length) {
        for (let user of neutrals) {
            if (user === MY_USERNAME || _.includes(FRIENDLIES, user)) continue;
            let cache = Memory._userList || {};
            let standing;
            if (cache[user]) {
                standing = cache[user]['standing'] - 0.25;
            } else if (!cache[user]) {
                standing = 0;
                log.w(roomLink(room.name) + ' has detected a neutral.' + user + ' has now been marked hostile for trespassing.', 'DIPLOMACY:');
            }
            cache[user] = {
                standing: standing,
                lastAction: Game.time,
            };
            Memory._userList = cache;
        }
    }
}
