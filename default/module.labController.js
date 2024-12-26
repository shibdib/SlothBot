/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
let lastRun = {};
let lastClean = {};

class LabManager {
    constructor() {
        this.primaryLabs = {};
    }

    run(room) {
        const labs = room.structures.filter(s => s.structureType === STRUCTURE_LAB);
        if (!labs.length) return;
        if (!lastClean[room.name] || lastClean[room.name] + 2000 < Game.time) {
            lastClean[room.name] = Game.time;
            this.cleanLabs(labs);
        }
        if (!lastRun[room.name] || lastRun[room.name] + 5 < Game.time) {
            lastRun[room.name] = Game.time;
            if (this.shouldManageBoostProduction(room)) this.manageBoostProduction(room);
            this.manageActiveLabs(room);
        }
    }

    shouldManageBoostProduction(room) {
        return Game.time % 100 === 0 || !this.primaryLabs[room.name] || !room.memory.producingBoost;
    }

    manageActiveLabs(room) {
        if (!room.memory.producingBoost) return;
        let hub = this.getLabHub(room);

        if (!hub) return;

        // Sanity check for broken hub
        for (const lab of hub) {
            if (!lab.memory.itemNeeded) return this.stopProduction(room, hub);
        }

        // Visual feedback on what's being produced
        hub[0].say(room.memory.producingBoost);

        let secondaryLabs = room.impassibleStructures.filter(lab =>
            !lab.cooldown && lab.structureType === STRUCTURE_LAB &&
            !this.primaryLabs[room.name].includes(lab.id) &&
            (!lab.memory.neededBoost || lab.memory.neededBoost === room.memory.producingBoost) &&
            (!lab.mineralType || lab.mineralType === room.memory.producingBoost)
        );

        for (let target of secondaryLabs) {
            let result = target.runReaction(hub[0], hub[1]);
            if (result === OK) {
                if (this.shouldStopProduction(room)) {
                    this.stopProduction(room, hub);
                    break;
                }
            } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                if (this.checkResourceShortage(room, hub)) {
                    this.stopProduction(room, hub);
                    break;
                }
            }
        }
    }

    shouldStopProduction(room) {
        let cutOff = this.getProductionCutoff(room);
        return Math.random() > 0.8 && room.store(room.memory.producingBoost) > cutOff;
    }

    getProductionCutoff(room) {
        let baseCutoff = BOOST_AMOUNT * 1.5;
        if (room.memory.producingBoost === RESOURCE_GHODIUM) {
            return (NUKER_GHODIUM_CAPACITY * 5) + (SAFE_MODE_COST * 3);
        }
        if (LAB_PRIORITY.includes(room.memory.producingBoost)) {
            return baseCutoff * 2; // Increased cutoff for priority boosts
        }
        return baseCutoff;
    }

    checkResourceShortage(room, hub) {
        return hub.some(lab => room.store(lab.memory.itemNeeded) < 50);
    }

    stopProduction(room, hub) {
        log.a(roomLink(room.name) + ' is no longer producing ' + room.memory.producingBoost + ' due to production conditions.');
        room.memory.producingBoost = undefined;
        this.primaryLabs[room.name] = undefined;
        hub.forEach(lab => lab.memory = undefined);
    }

    manageBoostProduction(room) {
        if (room.memory.producingBoost) return;
        let hub = this.getLabHub(room);
        if (!hub) return;

        let secondaryLabs = room.impassibleStructures.filter(lab =>
            lab.structureType === STRUCTURE_LAB && !this.primaryLabs[room.name].includes(lab.id)
        );

        if (secondaryLabs.length < 1 || hub.length < 2) return;

        let boost = this.findBoostToProduce(room, secondaryLabs);
        if (!boost) return;

        this.setupProduction(hub, boost, room);

    }

    getLabHub(room) {
        if (!this.primaryLabs[room.name]) {
            let labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
            let labs = room.impassibleStructures.filter(lab =>
                lab.structureType === STRUCTURE_LAB &&
                ((lab.pos.x === labHub.x && lab.pos.y === labHub.y) ||
                    (lab.pos.x === labHub.x && lab.pos.y === labHub.y + 1))
            );
            this.primaryLabs[room.name] = labs.map(lab => lab.id);
        }
        return this.primaryLabs[room.name].map(id => Game.getObjectById(id));
    }

    findBoostToProduce(room, secondaryLabs) {
        let boostList = [...new Set([...LAB_PRIORITY, ...BASE_COMPOUNDS, ...TIER_3_BOOSTS, ...TIER_2_BOOSTS, ...TIER_1_BOOSTS])];
        for (let boost of boostList) {
            let cutOff = this.getProductionCutoffForInit(boost);
            if (room.store(boost) >= cutOff) continue;
            if (this.checkForInputs(room, boost)) {
                return boost;
            }
        }
        return null;
    }

    getProductionCutoffForInit(boost) {
        if (boost === RESOURCE_GHODIUM) {
            return (NUKER_GHODIUM_CAPACITY * 2.5) + (SAFE_MODE_COST * 1.5);
        }
        if (LAB_PRIORITY.includes(boost)) {
            return BOOST_AMOUNT * 1.5;
        }
        return BOOST_AMOUNT;
    }

    checkForInputs(room, boost) {
        let components = BOOST_COMPONENTS[boost];
        if (!components || components.length === 0) return false;
        return components.every(input => room.store(input, true) >= 150);
    }

    setupProduction(hub, boost, room) {
        hub.forEach((lab, i) => {
            lab.memory = {
                itemNeeded: BOOST_COMPONENTS[boost][i],
                room: room.name
            };
        });
        room.memory.producingBoost = boost;
        log.a(roomLink(room.name) + ' queued ' + boost + ' for creation.');
    }

    cleanLabs(labs) {
        labs.forEach(lab => {
            if (lab.memory.neededBoost) {
                if (!lab.memory.requested || lab.memory.requested + 150 < Game.time || !Game.getObjectById(lab.memory.requestor)) {
                    lab.memory = undefined;
                }
            }
        });
    }
}

module.exports = LabManager;