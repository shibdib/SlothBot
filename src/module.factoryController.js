/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.factoryControl = function (room) {
    // Check for factory
    if (room.factory && !room.nukes.length) {
        // If factory is set to produce do so
        if (room.factory.memory.producing && !room.factory.cooldown) {
            room.factory.say(room.factory.memory.producing);
            if (room.factory && _.sum(room.factory.store) && !room.factory.cooldown) {
                switch (room.factory.produce(room.factory.memory.producing)) {
                    case OK:
                        return;
                }
            }
            // Check if it's still good to produce
            if (room.factory.memory.producing !== RESOURCE_ENERGY) {
                if (_.includes(BASE_MINERALS, room.factory.memory.producing) && room.store(room.factory.memory.producing) > REACTION_AMOUNT * 0.2) {
                    log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to hitting the production cap.', ' FACTORY CONTROL:');
                    return delete room.factory.memory.producing;
                }
                if (room.energy < FACTORY_CUTOFF * 0.9) {
                    log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to being low on energy.', ' FACTORY CONTROL:');
                    return delete room.factory.memory.producing;
                }
                if (Math.random() > 0.5) {
                    for (let neededResource of Object.keys(COMMODITIES[room.factory.memory.producing].components)) {
                        if (room.store(neededResource) + room.factory.store[neededResource] < COMMODITIES[room.factory.memory.producing].components[neededResource] ||
                            _.includes(BASE_MINERALS, neededResource) && room.store(neededResource) < REACTION_AMOUNT * 0.45) {
                            log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to a shortage of ' + neededResource, ' FACTORY CONTROL:');
                            return delete room.factory.memory.producing;
                        }
                    }
                }
            } else if (room.energy > ENERGY_AMOUNT || room.store(RESOURCE_BATTERY) < 50) {
                return delete room.factory.memory.producing;
            }
        } else if (Game.time % 25 === 0) {
            // If nothing is set to produce, every 25 ticks check and see if anything should be
            if (!room.factory.memory.producing && room.energy > FACTORY_CUTOFF) {
                if (room.energy > ENERGY_AMOUNT * 1.5) {
                    log.a('Producing ' + RESOURCE_BATTERY + ' in ' + roomLink(room.name), ' FACTORY CONTROL:');
                    return room.factory.memory.producing = RESOURCE_BATTERY;
                } else {
                    for (let commodity of shuffle(ALL_COMMODITIES)) {
                        // If a base continue
                        if (!COMMODITIES[commodity] || room.store(commodity) >= DUMP_AMOUNT * 0.9) continue;
                        if (commodity === RESOURCE_BATTERY) continue;
                        // Handle levels
                        if (COMMODITIES[commodity].level) {
                            let powerCreep = _.filter(room.powerCreeps, (p) => p.my && p.powers[PWR_OPERATE_FACTORY] && p.powers[PWR_OPERATE_FACTORY].level === COMMODITIES[commodity].level)[0];
                            if (!powerCreep) continue;
                        }
                        let enough;
                        for (let neededResource of Object.keys(COMMODITIES[commodity].components)) {
                            enough = false;
                            if (room.store(neededResource) + room.factory.store[neededResource] < COMMODITIES[commodity].components[neededResource]) break;
                            if (_.includes(BASE_MINERALS, neededResource) && room.store(neededResource) < REACTION_AMOUNT * 0.5) break;
                            enough = true;
                        }
                        if (enough) {
                            log.a('Producing ' + commodity + ' in ' + roomLink(room.name), ' FACTORY CONTROL:');
                            return room.factory.memory.producing = commodity;
                        }
                    }
                    // De-compress
                    if (room.name === Memory.saleTerminal.room) {
                        for (let mineral of shuffle(BASE_MINERALS)) {
                            if (!COMMODITIES[mineral] || room.store(mineral) >= REACTION_AMOUNT * 0.05) continue;
                            let enough;
                            for (let neededResource of Object.keys(COMMODITIES[mineral].components)) {
                                enough = false;
                                if (room.store(neededResource) + room.factory.store[neededResource] < COMMODITIES[mineral].components[neededResource]) break;
                                enough = true;
                            }
                            if (enough) {
                                log.a('De-compressing ' + mineral + ' in ' + roomLink(room.name), ' FACTORY CONTROL:');
                                return room.factory.memory.producing = mineral;
                            }
                        }
                    }
                }
            } else if (!room.factory.memory.producing && room.energy < FACTORY_CUTOFF && room.store(RESOURCE_BATTERY) >= 50) {
                log.a('Converting ' + RESOURCE_BATTERY + ' to ENERGY in ' + roomLink(room.name), ' FACTORY CONTROL:');
                return room.factory.memory.producing = RESOURCE_ENERGY;
            }
        }
    }
};