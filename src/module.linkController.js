/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let controllerAlternator;
module.exports.linkControl = function (room) {
    if (room.level < 5) return;
    let links = shuffle(_.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_LINK && !s.cooldown && s.store[RESOURCE_ENERGY] >= 100 && s.id !== s.room.memory.controllerLink && s.id !== s.room.memory.hubLink));
    if (!links.length) return;
    let hubLink = Game.getObjectById(room.memory.hubLink);
    let controllerLink = Game.getObjectById(room.memory.controllerLink);
    if (!controllerLink) {
        delete room.memory.controllerLink;
        let potential = _.find(links, (s) => s.pos.findInRange(room.structures, 2, {filter: (f) => f.structureType === STRUCTURE_CONTROLLER})[0]);
        if (potential) room.memory.controllerLink = potential.id;
    }
    if (!hubLink) delete room.memory.hubLink;
    for (let link of links) {
        // If hublink and room isn't full on energy, send it to the controller link.
        if (link.id === link.room.memory.hubLink && link.room.energyAvailable !== link.room.energyCapacityAvailable) continue;
        let upgrader = _.find(link.room.creeps, (c) => c.memory && c.memory.role === 'upgrader');
        // Controller link if conditions met
        if (hubLink && !hubLink.room.energyState) {
            controllerAlternator = undefined;
            link.transferEnergy(hubLink);
        } else if (upgrader && (controllerLink && ((controllerLink.store[RESOURCE_ENERGY] < 50 && !controllerAlternator) || link.id === link.room.memory.hubLink))) {
            controllerAlternator = true;
            link.transferEnergy(controllerLink);
        } else if (hubLink && hubLink.store[RESOURCE_ENERGY] < 400) {
            controllerAlternator = undefined;
            link.transferEnergy(hubLink);
        } else if (controllerLink && controllerLink.store[RESOURCE_ENERGY] < 200) {
            controllerAlternator = true;
            link.transferEnergy(controllerLink);
        } else if (hubLink && hubLink.store[RESOURCE_ENERGY] < 750) {
            controllerAlternator = undefined;
            link.transferEnergy(hubLink);
        } else if (link.store[RESOURCE_ENERGY] > LINK_CAPACITY * 0.98 && _.find(links, (l) => l.id !== link.id && l.store[RESOURCE_ENERGY] < LINK_CAPACITY * 0.5 && l.store[RESOURCE_ENERGY] < link.store[RESOURCE_ENERGY])) {
            link.transferEnergy(_.filter(links, (l) => l.id !== link.id && l.store.getFreeCapacity(RESOURCE_ENERGY))[0], link.store[RESOURCE_ENERGY] * 0.5);
        }
    }
};