let controllerAlternator;

module.exports.linkControl = function (room) {
    // Retrieve all available links in the room
    let links = getAvailableLinks(room);

    if (!links.length) return;

    let hubLink = Game.getObjectById(room.memory.hubLink);
    let controllerLink = Game.getObjectById(room.memory.controllerLink);

    // Set controller link if not already set
    if (!controllerLink) {
        setControllerLink(room, links);
    }

    // Ensure hub link is valid or delete from memory if not
    if (!hubLink) delete room.memory.hubLink;

    // Process links and handle energy transfer
    links.forEach(link => processLink(link, room, hubLink, controllerLink));
};

// Helper function to get available links in the room
function getAvailableLinks(room) {
    return shuffle(_.filter(room.impassibleStructures, (s) =>
        s.structureType === STRUCTURE_LINK &&
        !s.cooldown &&
        s.store[RESOURCE_ENERGY] >= 100 &&
        s.id !== room.memory.controllerLink &&
        s.id !== room.memory.hubLink
    ));
}

function setControllerLink(room, links) {
    let potential = _.find(links, (s) => s.pos.findInRange(room.structures, 2, {
        filter: (f) => f.structureType === STRUCTURE_CONTROLLER
    })[0]);

    if (potential) {
        room.memory.controllerLink = potential.id;
    }
}

function processLink(link, room, hubLink, controllerLink) {
    // Skip processing if energy transfer is unnecessary
    if (link.id === room.memory.hubLink && link.room.energyAvailable !== link.room.energyCapacityAvailable) return;

    let upgrader = _.find(link.room.creeps, (c) => c.memory && c.memory.role === 'upgrader');

    // Energy transfer logic with better decisions
    if (hubLink && !hubLink.room.energyState) {
        controllerAlternator = undefined;
        link.transferEnergy(hubLink);
    } else if (upgrader && controllerLink && shouldTransferToController(controllerLink, link)) {
        controllerAlternator = true;
        link.transferEnergy(controllerLink);
    } else if (shouldTransferToHubLink(hubLink, link)) {
        controllerAlternator = undefined;
        link.transferEnergy(hubLink);
    } else if (shouldTransferToControllerLink(controllerLink, link)) {
        controllerAlternator = true;
        link.transferEnergy(controllerLink);
    } else if (shouldTransferToHubLinkWhenLow(hubLink, link)) {
        controllerAlternator = undefined;
        link.transferEnergy(hubLink);
    } else {
        transferEnergyBetweenLinks(link, room);
    }
}

// Helper functions for energy transfer conditions
function shouldTransferToController(controllerLink, link) {
    return controllerLink && controllerLink.store[RESOURCE_ENERGY] < 50 && !controllerAlternator;
}

function shouldTransferToHubLink(hubLink, link) {
    return hubLink && hubLink.store[RESOURCE_ENERGY] < 400;
}

function shouldTransferToControllerLink(controllerLink, link) {
    return controllerLink && controllerLink.store[RESOURCE_ENERGY] < 200;
}

function shouldTransferToHubLinkWhenLow(hubLink, link) {
    return hubLink && hubLink.store[RESOURCE_ENERGY] < 750;
}

// Transfer energy between links if one is low
function transferEnergyBetweenLinks(link, room) {
    const lowEnergyLinks = _.filter(room.links, (l) => l.id !== link.id && l.store[RESOURCE_ENERGY] < LINK_CAPACITY * 0.5);
    const targetLink = _.find(lowEnergyLinks, (l) => l.store[RESOURCE_ENERGY] < link.store[RESOURCE_ENERGY]);

    if (link.store[RESOURCE_ENERGY] > LINK_CAPACITY * 0.98 && targetLink) {
        link.transferEnergy(targetLink, link.store[RESOURCE_ENERGY] * 0.5);
    }
}
