/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const runNext = {};
const lastClean = {};
const goOverCap = {};
const productionTracker = {};

class LabManager {
    constructor(room) {
        this.primaryLabs = {};
        this.room = room;
        this.hub = this.getLabHub(room);
    }

    run(room) {
        const labs = room.structures.filter(s => s.structureType === STRUCTURE_LAB);
        if (!labs.length) return;
        if (!runNext[room.name] || runNext[room.name] < Game.time) {
            this.manageBoostProduction(room);
            this.manageActiveLabs(room);
            if (!runNext[room.name] || runNext[room.name] < Game.time) runNext[room.name] = Game.time + 15;
        }
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

    manageActiveLabs(room) {
        if (!room.memory.producingBoost || !this.hub) return;

        // Sanity check for broken hub
        for (const lab of this.hub) {
            if (!lab.memory.itemNeeded) return this.stopProduction(room);
        }

        // Visual feedback on what's being produced
        this.hub[0].say(room.memory.producingBoost);

        let secondaryLabs = room.impassibleStructures.filter(lab =>
            !lab.cooldown && lab.structureType === STRUCTURE_LAB &&
            !this.primaryLabs[room.name].includes(lab.id) &&
            (!lab.memory.neededBoost || lab.memory.neededBoost === room.memory.producingBoost) &&
            (!lab.mineralType || lab.mineralType === room.memory.producingBoost)
        );

        for (let target of secondaryLabs) {
            let result = target.runReaction(this.hub[0], this.hub[1]);
            if (result === OK) {
                this.shouldStopProduction(room);
                const coolDown = Game.time + REACTION_TIME[room.memory.producingBoost] - 1;
                if (!runNext[room.name] || runNext[room.name] > coolDown || runNext[room.name] <= Game.time) {
                    runNext[room.name] = coolDown;
                }
                if (!productionTracker[this.room.name]) productionTracker[this.room.name] = Game.time;
            } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                this.shouldStopProduction(room);
            }
        }
    }

    shouldStopProduction(room) {
        if (room.store(room.memory.producingBoost) > this.getProductionCutoff(room.memory.producingBoost)) {
            this.stopProduction(room, 'Boost cap reached.');
        } else if (productionTracker[this.room.name] && productionTracker[this.room.name] + CREEP_LIFE_TIME * 3 < Game.time) {
            this.stopProduction(room, 'Production time exceeded.');
        } else if (this.hub.some(lab => room.store(lab.memory.itemNeeded) < 50)) {
            this.stopProduction(room, 'Not enough resources.');
        }
    }

    stopProduction(room, message) {
        if (productionTracker[this.room.name]) log.a(`${roomLink(room.name)} is halting production of ${room.memory.producingBoost}. ${message || ''}`);
        room.memory.producingBoost = undefined;
        this.primaryLabs[room.name] = undefined;
        goOverCap[this.room.name] = undefined;
        this.hub.forEach(lab => lab.memory = undefined);
    }

    findBoostToProduce(room) {
        const priority = this.tryPriority(room);
        if (priority) return priority;
        let boostList = [...new Set([...BASE_COMPOUNDS, ...TIER_3_BOOSTS, ...TIER_2_BOOSTS, ...TIER_1_BOOSTS])];
        for (const boost of shuffle(boostList)) {
            let cutOff = this.getProductionCutoff(boost);
            if (room.store(boost) >= cutOff) continue;
            if (this.checkForInputs(room, boost)) {
                return boost;
            }
        }
        goOverCap[room.name] = true;
        return null;
    }

    tryPriority(room) {
        const priority = !HOSTILES.length ? LAB_PEACE_PRIORITY : LAB_WAR_PRIORITY;
        for (let boost of priority) {
            let cutOff = this.getProductionCutoff(boost);
            if (getResourceTotal(boost) >= cutOff) continue;
            if (this.checkForInputs(room)) {
                return boost;
            } else {
                const components = BOOST_COMPONENTS[boost];
                if (!components || !components.length) continue;
                for (boost of components) {
                    let cutOff = this.getProductionCutoff(boost);
                    if (room.store(boost) >= cutOff) continue;
                    if (this.checkForInputs(room, boost)) {
                        return boost;
                    } else {
                        const components = BOOST_COMPONENTS[boost];
                        if (!components || !components.length) continue;
                        for (boost of components) {
                            let cutOff = this.getProductionCutoff(boost);
                            if (room.store(boost) >= cutOff) continue;
                            if (this.checkForInputs(room, boost)) {
                                return boost;
                            } else {
                                const components = BOOST_COMPONENTS[boost];
                                if (!components || !components.length) continue;
                                for (boost of components) {
                                    let cutOff = this.getProductionCutoff(boost);
                                    if (room.store(boost) >= cutOff) continue;
                                    if (this.checkForInputs(room, boost)) {
                                        return boost;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    getProductionCutoff(boost) {
        if (boost === RESOURCE_GHODIUM) {
            return (NUKER_GHODIUM_CAPACITY * 2.5) + (SAFE_MODE_COST * 1.5);
        } else if (goOverCap[this.room.name]) {
            return BOOST_AMOUNT(this.room) * 10;
        } else if (LAB_PEACE_PRIORITY.includes(boost) || LAB_WAR_PRIORITY.includes(boost)) {
            return BOOST_AMOUNT(this.room) * 2;
        }
        return BOOST_AMOUNT(this.room);
    }

    checkForInputs(room, boost) {
        let components = BOOST_COMPONENTS[boost];
        if (!components || components.length === 0) return false;
        return components.every(input => room.store(input) >= 50 * room.level);
    }

    setupProduction(hub, boost, room) {
        hub.forEach((lab, i) => {
            lab.memory = {
                itemNeeded: BOOST_COMPONENTS[boost][i],
                room: room.name
            };
        });
        room.memory.producingBoost = boost;
        productionTracker[this.room.name] = Game.time;
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

    getLabHub(room) {
        if (!this.primaryLabs[room.name]) {
            if (!room.memory.labHub) return;
            let labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
            // Clear a bad hub if we have labs but not at the hub
            const labs = room.impassibleStructures.filter((s) => s.my && s.structureType === STRUCTURE_LAB);
            const hubLabs = labs.filter(lab =>
                lab.structureType === STRUCTURE_LAB &&
                ((lab.pos.x === labHub.x && lab.pos.y === labHub.y) ||
                    (lab.pos.x === labHub.x && lab.pos.y === labHub.y + 1))
            );
            if (labs.length && !hubLabs.length) {
                return room.memory.labHub = undefined;
            } else if (hubLabs.length) {
                this.primaryLabs[room.name] = hubLabs.map(lab => lab.id);
            }
        }
        if (this.primaryLabs[room.name]) return this.primaryLabs[room.name].map(id => Game.getObjectById(id));
    }
}

profiler.registerClass(LabManager, 'LabManager');
module.exports = LabManager;