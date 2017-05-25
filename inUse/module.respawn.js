/**
 * Created by rober on 5/16/2017.
 */

const respawnCreeps = {
    /**   *
     * @param spawnName
     */
    run: function (spawnName) {

////////////////////////////////////////////Vars//////////////////////////////////////////////////

        //Number generator
        const generatedNumber = Math.floor((Math.random() * 100000) + 1);

//Total creeps
        const totalCreeps = _.filter(Game.creeps, (creep) => creep.memory.role !== null && creep.room === Game.spawns[spawnName].room);

//Peasant Creeps
        const peasants = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasant' && creep.room === Game.spawns[spawnName].room);
        const peasantBuilders = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasantBuilder' && creep.room === Game.spawns[spawnName].room);
        const peasantUpgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasantUpgrader' && creep.room === Game.spawns[spawnName].room);

//Stationary Creeps
        const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
        const stationaryBuilders = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryBuilder' && creep.room === Game.spawns[spawnName].room);

//Worker Creeps
        const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.room === Game.spawns[spawnName].room);
        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.room === Game.spawns[spawnName].room);
        const wallRepairers = _.filter(Game.creeps, (creep) => creep.memory.role === 'wallRepairer' && creep.room === Game.spawns[spawnName].room);
        const remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHarvester');
        const roadBuilders = _.filter(Game.creeps, (creep) => creep.memory.role === 'roadBuilder' && creep.room === Game.spawns[spawnName].room);

//Hauling Creeps
        const haulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.room === Game.spawns[spawnName].room);
        const dumpTrucks = _.filter(Game.creeps, (creep) => creep.memory.role === 'dumpTruck' && creep.room === Game.spawns[spawnName].room);
        const remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHauler');
        const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'basicHauler' && creep.room === Game.spawns[spawnName].room);

//Combat Creeps
        const sentry = _.filter(Game.creeps, (creep) => creep.memory.role === 'sentry' && creep.room === Game.spawns[spawnName].room);
        const defenders = _.filter(Game.creeps, (creep) => creep.memory.role === 'defender' && creep.room === Game.spawns[spawnName].room);
        const scout = _.filter(Game.creeps, (creep) => creep.memory.role === 'scout' && creep.room === Game.spawns[spawnName].room);
        const attackers = _.filter(Game.creeps, (creep) => creep.memory.role === 'attacker' && creep.room === Game.spawns[spawnName].room);

//MISC
        const sourceCount = Game.spawns[spawnName].room.find(FIND_SOURCES).length;
        const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
        const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
            filter: {structureType: STRUCTURE_CONTAINER}
        });
        const ramparts = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
            filter: {structureType: STRUCTURE_RAMPART}
        });
        let sentryRamparts = [];
        for (i = 0; i < ramparts.length; i++) {
            const nearbyRamparts = ramparts[i].pos.findInRange(FIND_MY_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
            if (nearbyRamparts.length <= 1) {
                sentryRamparts.push(ramparts[i]);
            }
        }
        const roomEnergyCapacity = Game.spawns[spawnName].room.energyCapacityAvailable;
        const roomEnergy = Game.spawns[spawnName].room.energyAvailable;

        ///////////////////////////////////////////////COUNT TO CONSOLE///////////////////////////////////////

        /**console.log('Creep Count');
         console.log('Harvesters: ' + stationaryHarvester.length);
         console.log('Remote Harvesters: ' + remoteHarvester.length);
         console.log('Remote Haulers: ' + remoteHauler.length);
         console.log('Builders: ' + stationaryBuilders.length);
         console.log('Workers: ' + worker.length);
         console.log('Road Builders: ' + roadBuilders.length);
         console.log('Upgraders: ' + upgraders.length);
         console.log('Haulers: ' + haulers.length);
         console.log('Expediters: ' + expediters.length);
         console.log('Dump Trucks: ' + dumpTrucks.length);
         console.log('Basic Hauler: ' + basicHauler.length);
         console.log('Peasants: ' + peasants.length);
         console.log('Peasant Builders: ' + peasantBuilders.length);
         console.log('Peasant Upgraders: ' + peasantUpgraders.length);**/

        ////////////////////////////////////////////Respawns//////////////////////////////////////////////////
        if (Game.spawns[spawnName].room.find(FIND_MY_SPAWNS)) {
            if (!Game.spawns[spawnName].spawning) {
                let creep = Game.spawns[spawnName].pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => c.ticksToLive < 125 && c.memory.renew === true});
                if (creep !== null && creep !== undefined) {
                    Game.spawns[spawnName].renewCreep(creep);
                    creep.memory.renew = false;
                    return;
                }
                /** else {
                        let creep = Game.spawns[spawnName].pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => c.memory.recycle === true});
                        if (creep !== null && creep !== undefined) {
                            Game.spawns[spawnName].recycleCreep(creep);
                            return;
                        }
                    }**/
                if (roomEnergyCapacity >= 800) {
                    //ATTACK RESPAWNS
                    for (let i = 0; i < 10; i++) {
                        let attack = 'attack' + i;
                        if (Game.flags[attack]) {
                            let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                            if (attackers.length < (i * 2) && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'attacker') === OK) {
                                Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'attacker', {
                                    role: 'attacker',
                                    attackTarget: Game.flags[attack].name,
                                    waitFor: (i * 2)
                                });
                                console.log('Spawning a attacker');
                                return;
                            }
                        }
                    }

                    //SENTRY RESPAWNS
                    if (Game.flags.sentryBuild && stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < sentryRamparts.length; i++) {
                            let sentry = _.filter(Game.creeps, (creep) => creep.memory.assignedRampart === sentryRamparts[i].id && creep.memory.role === 'sentry');
                            if (sentry.length === 0 && Game.spawns[spawnName].canCreateCreep([RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE], generatedNumber + 'sentry') === OK) {
                                Game.spawns[spawnName].createCreep([RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE], generatedNumber + 'sentry', {
                                    role: 'sentry',
                                    assignedRampart: sentryRamparts[i].id
                                });
                                console.log('Spawning a sentry');
                                return;
                            }
                        }
                    }

                    //HAULER RESPAWNS
                    if (Game.flags.haulerBuild && stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < containers.length; i++) {
                            let hauler = _.filter(Game.creeps, (creep) => creep.memory.assignedContainer === containers[i].id && creep.memory.role === 'hauler');
                            if (hauler.length === 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'hauler') === OK) {
                                Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                                    role: 'hauler',
                                    assignedContainer: containers[i].id
                                });
                                console.log('Spawning a hauler');
                                return;
                            }
                        }
                    }

                    //MISC HAULER RESPAWNS
                    if (Game.flags.haulerBuild && stationaryHarvester.length >= sourceCount) {
                        if (dumpTrucks.length < 2 && stationaryHarvester.length >= 1 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'dumpTruck') === OK) {
                            Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'dumpTruck', {role: 'dumpTruck'});
                            console.log('Spawning a dumpTruck');
                            return;
                        } else if (basicHauler.length < 1 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'basicHauler') === OK) {
                            Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'basicHauler', {role: 'basicHauler'});
                            console.log('Spawning a basicHauler');
                            return;
                        }
                    }

                    //HARVESTER RESPAWNS
                    if (Game.flags.harvesterBuild) {
                        for (let i = 0; i < sources.length; i++) {
                            let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                            if (harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
                                Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], generatedNumber + 'stationaryHarvester', {
                                    role: 'stationaryHarvester',
                                    assignedSource: sources[i].id
                                });
                                console.log('Spawning a stationaryHarvester');
                                return;
                            }
                        }
                    }

                    //WORKER RESPAWNS
                    if (Game.flags.workerBuild && stationaryHarvester.length >= sourceCount) {
                        if (worker.length < 3 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'worker') === OK) {
                            Game.spawns[spawnName].createCreep([CARRY, WORK, WORK, MOVE, MOVE, MOVE], generatedNumber + 'worker', {role: 'worker'});
                            console.log('Spawning a worker');
                            return;
                        }/** else if (upgraders.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'upgrader') === OK) {
                            Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'upgrader', {role: 'upgrader'});
                            console.log('Spawning a upgrader');
                            return;
                        }**/ else if (wallRepairers.length < 1 && Game.spawns[spawnName].canCreateCreep([CARRY, WORK, WORK, MOVE, MOVE, MOVE], generatedNumber + 'wallRepairer') === OK) {
                            Game.spawns[spawnName].createCreep([CARRY, WORK, WORK, MOVE, MOVE, MOVE], generatedNumber + 'wallRepairer', {role: 'wallRepairer'});
                            console.log('Spawning a wallRepairer');
                            return;
                        }
                    }

                    //REMOTE RESPAWN
                    if (Game.flags.remoteBuild && stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let remote = 'remote' + i;
                            if (Game.flags[remote]) {
                                let harvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                                let longRoadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'longRoadBuilder');
                                let reserver = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'reserver');
                                let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                                if (harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'remoteHarvester') === OK && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE])) {
                                    Game.spawns[spawnName].createCreep([WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'remoteHarvester', {
                                        role: 'remoteHarvester',
                                        destination: remote
                                    });
                                    console.log('Spawning a remoteHarvester');
                                    return;
                                } else if (remoteHauler.length < 2 && harvester.length > 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler') === OK) {
                                    Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler', {
                                        role: 'remoteHauler',
                                        destination: remote
                                    });
                                    console.log('Spawning a remoteHauler');
                                    return;
                                } else if (reserver.length < 2 && Game.spawns[spawnName].canCreateCreep([CLAIM, MOVE, MOVE], generatedNumber + 'reserver') === OK) {
                                    Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'reserver', {
                                        role: 'reserver',
                                        destination: remote
                                    });
                                    console.log('Spawning a reserver');
                                    return;
                                }
                            }
                        }
                    } else if (Game.spawns[spawnName].spawning) {
                        let spawningCreep = Game.creeps[Game.spawns[spawnName].spawning.name];
                        Game.spawns[spawnName].room.visual.text(
                            spawningCreep.memory.role,
                            Game.spawns[spawnName].pos.x + 1,
                            Game.spawns[spawnName].pos.y,
                            {align: 'left', opacity: 0.8});
                    }
                }
            }
        }
    }
};
module.exports = respawnCreeps;
