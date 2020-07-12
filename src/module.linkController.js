/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.linkControl = function (room) {
    let links = shuffle(_.filter(room.structures, (s) => s.structureType === STRUCTURE_LINK && !s.cooldown && s.energy && s.id !== s.room.memory.controllerLink && s.id !== s.room.memory.hubLink));
    let hubLink = Game.getObjectById(room.memory.hubLink);
    let controllerLink = Game.getObjectById(room.memory.controllerLink);
    if (!controllerLink || !controllerLink.isActive()) delete room.memory.controllerLink;
    if (!hubLink || !hubLink.isActive()) delete room.memory.hubLink;
    for (let link of links) {
        if (!controllerLink) {
            if (_.filter(link.pos.findInRange(room.structures, 2), (s) => s.structureType === STRUCTURE_CONTROLLER).length > 0) {
                link.room.memory.controllerLink = link.id;
                continue;
            }
        }
        if (link.energy < 50) continue;
        let upgrader = _.filter(link.room.creeps, (c) => c.memory && c.memory.role === 'upgrader')[0];
        // Controller link if conditions met
        if (upgrader && ((controllerLink && controllerLink.energy < 50 && Math.random() > 0.5) || (room.energyState && controllerLink && controllerLink.energy < 450))) {
            link.transferEnergy(controllerLink);
        } else if (hubLink && hubLink.energy < 500) {
            link.transferEnergy(hubLink);
        } else if (controllerLink && controllerLink.energy < 300) {
            link.transferEnergy(controllerLink);
        } else if (hubLink && hubLink.energy < 750) {
            link.transferEnergy(hubLink);
        } else if (_.filter(links, (l) => l.id !== link.id && l.energy < l.energyCapacity * 0.5 && l.energy < link.energy)[0]) {
            link.transferEnergy(_.filter(links, (l) => l.id !== link.id && l.energy < l.energyCapacity * 0.5)[0], link.energy * 0.5);
        }
    }
    if (hubLink && controllerLink && hubLink.energy > 100 && controllerLink.energy < 250 && hubLink.room.energyAvailable > hubLink.room.energyCapacityAvailable * 0.95) {
        hubLink.transferEnergy(controllerLink);
    } else if (hubLink && controllerLink && controllerLink.energy > 400 && hubLink.energy < 50 && hubLink.room.energyAvailable < hubLink.room.energyCapacityAvailable * 0.95) {
        controllerLink.transferEnergy(hubLink);
    }
};