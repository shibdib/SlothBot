/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.factoryControl = function (room) {
    // Get factory and see if it has anything in it
    if (room.factory) {
        if (!room.factory.memory.producing && room.energy > ENERGY_AMOUNT * 0.6) {
            if (room.energy > ENERGY_AMOUNT * 1.5) {
                log.a('Producing ' + RESOURCE_BATTERY + ' in ' + roomLink(room.name), ' FACTORY CONTROL:');
                return room.factory.memory.producing = RESOURCE_BATTERY;
            } else {
                for (let commodity of shuffle(ALL_COMMODITIES)) {
                    // If a base continue
                    if (!COMMODITIES[commodity]) continue;
                    if (room.store(commodity) > REACTION_AMOUNT * 1.5 || commodity === RESOURCE_BATTERY || COMMODITIES[commodity].level) continue;
                    let enough;
                    for (let neededResource of Object.keys(COMMODITIES[commodity].components)) {
                        enough = false;
                        if (room.store(neededResource) + room.factory.store[neededResource] < COMMODITIES[commodity].components[neededResource]) break;
                        enough = true;
                    }
                    if (enough) {
                        log.a('Producing ' + commodity + ' in ' + roomLink(room.name), ' FACTORY CONTROL:');
                        return room.factory.memory.producing = commodity;
                    }
                }
            }
        } else if (room.factory.memory.producing) {
            room.factory.say(room.factory.memory.producing);
            if (room.factory && _.sum(room.factory.store) && !room.factory.cooldown) {
                switch (room.factory.produce(room.factory.memory.producing)) {
                    case OK:
                        return;
                }
            }
            // Check if it's still good to produce
            if (room.factory.memory.producing !== RESOURCE_BATTERY) {
                if (room.store(room.factory.memory.producing) >= REACTION_AMOUNT * 2) {
                    log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to hitting the production cap.', ' FACTORY CONTROL:');
                    return delete room.factory.memory.producing;
                }
                if (room.energy < ENERGY_AMOUNT * 0.5) {
                    log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to being low on energy.', ' FACTORY CONTROL:');
                    return delete room.factory.memory.producing;
                }
                if (Math.random() > 0.5) {
                    for (let neededResource of Object.keys(COMMODITIES[room.factory.memory.producing].components)) {
                        if (room.store(neededResource) + room.factory.store[neededResource] < COMMODITIES[room.factory.memory.producing].components[neededResource]) {
                            log.a('No longer producing ' + room.factory.memory.producing + ' in ' + roomLink(room.name) + ' due to a shortage of ' + neededResource, ' FACTORY CONTROL:');
                            return delete room.factory.memory.producing;
                        }
                    }
                }
            } else if (room.energy < ENERGY_AMOUNT) {
                log.a('No longer producing ' + RESOURCE_BATTERY + ' in ' + roomLink(room.name) + ' due to a shortage of ' + RESOURCE_ENERGY, ' FACTORY CONTROL:');
                return delete room.factory.memory.producing;
            }
        }
    }
};