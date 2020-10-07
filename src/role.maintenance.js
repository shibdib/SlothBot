/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function role(creep) {
    creep.say('Maintainer', true);
    // Checks
    if (!creep.store[RESOURCE_ENERGY]) {
        creep.memory.working = undefined;
        creep.memory.constructionSite = undefined;
    }
    if (creep.isFull && creep.memory.task !== 'harvest') {
        creep.memory.working = true;
        creep.memory.source = undefined;
        creep.memory.harvest = undefined;
    }
    if (creep.wrongRoom()) return;
    // Work
    if (creep.memory.working === true) {
        if (creep.memory.constructionSite || creep.constructionWork()) {
            creep.builderFunction();
        } else {
            creep.idleFor(15);
        }
    } else {
        creep.memory.task = undefined;
        if (!creep.memory.harvest && (creep.memory.energyDestination || creep.locateEnergy())) {
            creep.withdrawResource();
        } else {
            creep.idleFor(5);
        }
    }
};