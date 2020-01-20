/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.linkControl = function (room) {
    // Get factory and see if it has anything in it
    let factory = _.filter(room.structures, (s) => s.structureType === STRUCTURE_FACTORY && !s.cooldown)[0];
    if (factory && _.sum(factory.store)) {
        for (let compressed of COMPRESSED_COMMODITIES) {
            switch (factory.produce(compressed)) {
                case OK:
                    return;
            }
        }
    }
};