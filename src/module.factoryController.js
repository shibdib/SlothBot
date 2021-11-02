/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let tickTracker = {};

module.exports.factoryControl = function (room) {
    if (!room.factory) return;
    // Say what is being produced
    if (room.factory.memory.producing) {
        room.factory.say(_.capitalize(room.factory.memory.producing));
    }
    let lastRun = tickTracker[room.name] || 0;
    if (lastRun + 25 > Game.time) return;
    tickTracker[room.name] = Game.time;
    // Check for factory
    if (room.factory && !room.nukes.length && !room.memory.lowPower) {
        // If factory is set to produce do so
        if (room.factory.memory.producing && !room.factory.cooldown) {
            switch (room.factory.produce(room.factory.memory.producing)) {
                case OK:
                    // Check if it's still good to produce
                    if (room.factory.memory.producing !== RESOURCE_ENERGY) {
                        if (room.factory.memory.producing === RESOURCE_BATTERY && room.energyState < 2) {
                            log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to falling below the energy target.', ' FACTORY CONTROL:');
                            return delete room.factory.memory.producing;
                        } else if (!_.includes(COMPRESSED_COMMODITIES, room.factory.memory.producing) && room.store(room.factory.memory.producing) > REACTION_AMOUNT) {
                            log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to hitting the production cap.', ' FACTORY CONTROL:');
                            return delete room.factory.memory.producing;
                        } else if (_.includes(COMPRESSED_COMMODITIES, room.factory.memory.producing)) {
                            for (let neededResource of Object.keys(COMMODITIES[room.factory.memory.producing].components)) {
                                if (BASE_MINERALS.includes(neededResource) && room.store(neededResource) < REACTION_AMOUNT * 0.5) {
                                    log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' because ' + neededResource + ' fell below the reaction amount.', ' FACTORY CONTROL:');
                                    return delete room.factory.memory.producing;
                                }
                            }
                        } else if (room.energy < FACTORY_CUTOFF * 0.8) {
                            log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to being low on energy.', ' FACTORY CONTROL:');
                            return delete room.factory.memory.producing;
                        }
                    } else if (room.store(RESOURCE_ENERGY) > ENERGY_AMOUNT[room.level] * 1.5) {
                        return delete room.factory.memory.producing;
                    }
                    return;
                case -4:
                case -7:
                    // Handle level issues
                    log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to not having the required factory level.', ' FACTORY CONTROL:');
                    return delete room.factory.memory.producing;
                case -6:
                    // Handle resource issues
                    for (let neededResource of Object.keys(COMMODITIES[room.factory.memory.producing].components)) {
                        if (room.store(neededResource) < COMMODITIES[room.factory.memory.producing].components[neededResource]) {
                            log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to a shortage of ' + neededResource, ' FACTORY CONTROL:');
                            return delete room.factory.memory.producing;
                        }
                    }
                    return;
            }
        } else if (!room.factory.memory.producing && !room.energyState && room.store(RESOURCE_BATTERY) >= 50) {
            log.a('Converting ' + RESOURCE_BATTERY + ' to ENERGY in ' + roomLink(room.name), ' FACTORY CONTROL:');
            return room.factory.memory.producing = RESOURCE_ENERGY;
        } else {
            // If nothing is set to produce, every 25 ticks check and see if anything should be
            if (!room.factory.memory.producing) {
                if (room.energyState > 1) {
                    log.a('Producing ' + RESOURCE_BATTERY + ' in ' + roomLink(room.name), ' FACTORY CONTROL:');
                    return room.factory.memory.producing = RESOURCE_BATTERY;
                } else {
                    // De-compress
                    for (let mineral of shuffle(BASE_MINERALS)) {
                        if (!COMMODITIES[mineral] || room.store(mineral) >= REACTION_AMOUNT * 0.5) continue;
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
                    for (let commodity of shuffle(ALL_COMMODITIES)) {
                        // If a base continue
                        if (!COMMODITIES[commodity] || (room.store(commodity) >= DUMP_AMOUNT * 0.9 && !_.includes(COMPRESSED_COMMODITIES, commodity))) continue;
                        if (commodity === RESOURCE_BATTERY) continue;
                        // Handle levels
                        let factoryLevel = room.factory.level || 0;
                        if (!room.factory.effects || !room.factory.effects.length) factoryLevel = 0;
                        if (COMMODITIES[commodity].level && factoryLevel !== COMMODITIES[commodity].level) continue;
                        let enough;
                        for (let neededResource of Object.keys(COMMODITIES[commodity].components)) {
                            enough = false;
                            if (room.store(neededResource) < COMMODITIES[commodity].components[neededResource]) break;
                            // Don't compress below the reaction amount for labs
                            if (COMPRESSED_COMMODITIES.includes(commodity) && room.store(neededResource) < REACTION_AMOUNT * 1.1) break;
                            enough = true;
                        }
                        if (enough) {
                            log.a('Producing ' + commodity + ' in ' + roomLink(room.name), ' FACTORY CONTROL:');
                            return room.factory.memory.producing = commodity;
                        }
                    }
                }
            }
        }
    }
};