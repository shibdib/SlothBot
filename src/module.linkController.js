/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.linkControl = function (room) {
    if (room.level < 5) return;
    let links = shuffle(_.filter(room.structures, (s) => s.structureType === STRUCTURE_LINK && !s.cooldown && s.energy >= 100 && s.id !== s.room.memory.controllerLink && s.id !== s.room.memory.hubLink));
    let hubLink = Game.getObjectById(room.memory.hubLink);
    let controllerLink = Game.getObjectById(room.memory.controllerLink);
    if (!controllerLink) {
        delete room.memory.controllerLink;
        let potential = _.filter(links, (s) => s.pos.findInRange(room.structures, 2, {filter: (f) => f.structureType === STRUCTURE_CONTROLLER})[0])[0];
        if (potential) room.memory.controllerLink = potential.id;
    }
    if (!hubLink) delete room.memory.hubLink;
    for (let link of links) {
        let upgrader = _.filter(link.room.creeps, (c) => c.memory && c.memory.role === 'upgrader')[0];
        // Controller link if conditions met
        if (upgrader && ((controllerLink && controllerLink.energy < 50 && Math.random() > 0.5) || (room.energyState && controllerLink && controllerLink.energy < 350))) {
            link.transferEnergy(controllerLink);
        } else if (hubLink && hubLink.energy < 400) {
            link.transferEnergy(hubLink);
        } else if (controllerLink && controllerLink.energy < 200) {
            link.transferEnergy(controllerLink);
        } else if (hubLink && hubLink.energy < 750) {
            link.transferEnergy(hubLink);
        } else if (_.filter(links, (l) => l.id !== link.id && l.energy < l.energyCapacity * 0.5 && l.energy < link.energy)[0]) {
            link.transferEnergy(_.filter(links, (l) => l.id !== link.id && l.energy < l.energyCapacity * 0.5)[0], link.energy * 0.5);
        }
    }
};