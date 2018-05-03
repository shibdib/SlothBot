/**
 * Created by Bob on 7/1/2017.
 */
const profiler = require('screeps-profiler');
let towers = require('module.towerController');
let shib = require("shibBench");

function controller(room) {
//Claimed Defense
    let towerCpu = Game.cpu.getUsed();
    towers.towerControl(room);
    shib.shibBench('towerController', towerCpu);
    let creeps = room.creeps;
    let structures = room.structures;
    room.invaderCheck();
    room.handleNukeAttack();
    safeModeManager(room);
    //TODO: ramparts up unless ally in room and no enemies near him
    let rampartCpu = Game.cpu.getUsed();
    //rampartManager(room, structures);
    shib.shibBench('rampartManager', rampartCpu);
    // Early Warning System
    //earlyWarning(room);
    if (room.memory.threatLevel >= 4) {
        let coveredSpawns = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.pos.checkForRampart());
        let hostiles = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner));
        if (!coveredSpawns.length && hostiles.length && !room.controller.safeMode) {
            switch (room.controller.activateSafeMode()) {
                case OK:
                    log.a(room.name + ' has entered Safemode.');
                    Game.notify(room.name + ' has entered Safemode.');
                    break;
            }
        }
    }
    if (room.memory.responseNeeded && !room.memory.alertEmail) {
        room.memory.alertEmail = true;
        if (room.memory.threatLevel >= 4) {
            Game.notify(room.name + ' - Enemy detected, room is now in FPCON DELTA.');
            Game.notify(room.memory.numberOfHostiles + ' - Foreign Hostiles Reported');
        }
    }
    if (room.memory.responseNeeded) {
        let playerHostile = _.filter(creeps, (c) => (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && _.includes(FRIENDLIES, c.owner.username) === false && c.owner.username !== 'Invader')[0];
        let tower = _.max(_.filter(structures, (s) => s.structureType === STRUCTURE_TOWER), 'energy');
        let responders = _.filter(creeps, (c) => c.memory && c.memory.role === 'responder' && c.memory.overlord === room.name);
        if (((tower.energy < 10 && !responders.length) || !tower || playerHostile || room.memory.threatLevel >= 4) && !room.controller.safeMode) {
            room.memory.requestingSupport = true;
        }
        if (tower.energy < 10 && !responders.length && room.memory.threatLevel >= 3 && !room.controller.safeMode && !room.controller.safeModeCooldown && room.controller.safeModeAvailable) {
            room.controller.activateSafeMode();
            room.memory.requestingSupport = undefined;
        }
        if (room.controller.level < 4 && !room.controller.safeMode) {
            let alliedMilitary = _.filter(room.creeps, (c) => c.memory && c.memory.military);
            let enemyMilitary = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && c.pos.getRangeTo(c.pos.findClosestByRange(FIND_EXIT)) > 3);
            let spawns = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN);
            if (!spawns.length && !alliedMilitary.length && enemyMilitary.length) {
                abandonOverrun(room);
            }
        }
    } else {
        if (!room.memory.requestingSupport && room.controller.level > 4) {
            let needyRoom = _.filter(Memory.ownedRooms, (r) => r.memory.requestingSupport && Game.map.findRoute(room.name, r.name).length < 9)[0];
            if (needyRoom) {
                if (room.memory.sendingResponse !== needyRoom.name) {
                    room.memory.sendingResponse = needyRoom.name;
                    log.a(room.name + ' is sending remote responders to ' + needyRoom.name);
                }
            } else {
                delete room.memory.sendingResponse;
            }
        }
    }


//TODO: Remote Defense


//TODO: Allied Defense

}

module.exports.controller = profiler.registerFN(controller, 'defenseController');

//Functions

function rampartManager(room, structures) {
    let ramparts = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART);
    let allies = _.filter(room.creeps, (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my);
    if (ramparts.length) {
        if (room.memory.responseNeeded) {
            for (let key in ramparts) {
                let rampart = ramparts[key];
                rampart.setPublic(false)
            }
        }
        if (allies) {
            let enemies = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
            for (let key in ramparts) {
                let rampart = ramparts[key];
                if (rampart.pos.findInRange(allies, 4).length && !rampart.pos.findInRange(enemies, 6).length) {
                    rampart.setPublic(true)
                } else {
                    rampart.setPublic(false)
                }
            }
        }
    }
}

function safeModeManager(room) {
    if (room.controller.safeMode || room.controller.safeModeCooldown || !room.controller.safeModeAvailable) return;
    if (room.controller.level < 3) return room.controller.activateSafeMode();
    let alliedMilitary = _.filter(room.creeps, (c) => c.memory && c.memory.military);
    let enemyMilitary = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && c.pos.getRangeTo(c.pos.findClosestByRange(FIND_EXIT)) > 3);
    if (enemyMilitary.length && !alliedMilitary.length) {
        return room.controller.activateSafeMode();
    }
}

function earlyWarning(room) {
    let earlyWarning;
    if (room.memory.remoteRooms) earlyWarning = _.filter(room.memory.remoteRooms, (r) => Memory.roomCache[r] && Memory.roomCache[r].threatLevel >= 3);
    if (earlyWarning.length) {
        room.memory.responseNeeded = true;
        room.memory.tickDetected = Game.time;
        room.memory.threatLevel = Memory.roomCache[earlyWarning[0]].threatLevel;
    }
}

abandonOverrun = function (room) {
    for (let key in room.creeps) {
        room.creeps[key].suicide();
    }
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room.name);
    for (let key in overlordFor) {
        overlordFor[key].suicide();
    }
    for (let key in room.structures) {
        room.structures[key].destroy();
    }
    for (let key in room.constructionSites) {
        room.constructionSites[key].remove();
    }
    delete room.memory;
    delete Memory.roomCache[room.name];
    room.controller.unclaim();
};