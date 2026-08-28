/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const runNext = {};
const lastClean = {};
const goOverCap = {};
const productionTracker = {};
const INPUT_STOP_RATIO = 0.25;
const STALL_GRACE = CREEP_LIFE_TIME;
const WORKING_STOCK = 6000;
const REACTION_RANGE = 2;

class LabManager {
    constructor(room) {
        this.primaryLabs = {};
        this.room = room;
        this.hub = null;
    }

    run(room) {
        if (!room.labs.length) return;

        const idle = !room.memory.producingBoost && runNext[room.name] && runNext[room.name] > Game.time;
        if (idle && !room.memory.dangerousAttack) {
            if (!lastClean[room.name] || lastClean[room.name] + 100 < Game.time) {
                const idleLabs = room.labs.filter(l => l.isActive());
                if (idleLabs.length) this.cleanLabs(idleLabs);
                lastClean[room.name] = Game.time;
            }
            return;
        }

        const labs = room.labs.filter(l => l.isActive());
        if (!labs.length) return;

        if (!lastClean[room.name] || lastClean[room.name] + 100 < Game.time) {
            this.cleanLabs(labs);
            lastClean[room.name] = Game.time;
        }

        this.hub = this.getLabHub(room);

        if (room.memory.dangerousAttack) {
            this.pauseProduction(room, 'Room under attack.');
            return;
        }
        this.resumeProduction(room);

        if (room.memory.producingBoost) {
            this.retargetIfInvalid(room, labs);
            const stop = this.shouldStopProduction(room, labs);
            if (stop) {
                this.stopProduction(room, stop.reason);
                if (stop.chain) {
                    this.manageBoostProduction(room, labs);
                } else {
                    runNext[room.name] = Game.time + 15;
                    return;
                }
            }
        }

        if (!room.memory.producingBoost) {
            if (!runNext[room.name] || runNext[room.name] < Game.time) {
                this.manageBoostProduction(room, labs);
            }
            if (!room.memory.producingBoost) {
                if (!runNext[room.name] || runNext[room.name] <= Game.time) {
                    runNext[room.name] = Game.time + 15;
                }
                return;
            }
        }

        this.manageActiveLabs(room, labs);
    }

    manageBoostProduction(room, labs) {
        if (!this.hub || this.hub.length < 2) return;
        const hubIds = this.primaryLabs[room.name];
        if (!hubIds) return;

        const secondaryLabs = labs.filter(lab => !hubIds.includes(lab.id));
        if (!secondaryLabs.length) return;

        const boost = this.findBoostToProduce(room);
        if (!boost) return;

        this.setupProduction(this.hub, boost, room);
    }

    manageActiveLabs(room, labs) {
        this.hub = this.getLabHub(room);
        if (!this.hub || this.hub.length < 2) {
            this.stopProduction(room, 'Hub labs missing.');
            return;
        }

        const producingBoost = room.memory.producingBoost;
        const hubIds = this.primaryLabs[room.name];
        const structMem = room.memory._structureMemory;
        for (const lab of this.hub) {
            const mem = lab && structMem && structMem[lab.id];
            if (!mem || !mem.itemNeeded) {
                this.setupProduction(this.hub, producingBoost, room);
                break;
            }
        }

        const secondaryLabs = labs.filter(lab => this.isReadyReactionSecondary(lab, hubIds, structMem, producingBoost));

        for (const target of secondaryLabs) {
            const result = target.runReaction(this.hub[0], this.hub[1]);
            if (result === OK) {
                productionTracker[this.room.name] = Game.time;
            }
        }
    }

    shouldStopProduction(room, labs) {
        const boost = room.memory.producingBoost;
        if (!boost) return null;

        if (room.store(boost) >= this.getProductionCutoff(boost)) {
            return {reason: 'Boost cap reached.', chain: true};
        }

        if (!this.hub || this.hub.length < 2) {
            return {reason: 'Hub labs missing.', chain: false};
        }

        if (!this.inputsStillViable(room, boost)) {
            return {reason: 'Input exhausted.', chain: true};
        }

        if (productionTracker[this.room.name] && productionTracker[this.room.name] + STALL_GRACE < Game.time) {
            if (!this.hasProductionOutput(room, labs)) {
                productionTracker[this.room.name] = Game.time;
                return null;
            }
            return {reason: 'Production stalled — time limit reached.', chain: true};
        }

        return null;
    }

    pauseProduction(room, reason) {
        const boost = room.memory.producingBoost;
        if (!boost) return;
        if (!room.memory.labProductionPaused) {
            room.memory.labProductionPaused = {boost, reason, since: Game.time};
        }
    }

    resumeProduction(room) {
        const paused = room.memory.labProductionPaused;
        if (!paused) return;

        if (!room.memory.producingBoost) {
            room.memory.producingBoost = paused.boost;
            if (this.hub && this.hub.length >= 2) {
                const structMem = room.memory._structureMemory;
                const needsSetup = this.hub.some(lab => {
                    const mem = lab && structMem && structMem[lab.id];
                    return !mem || !mem.itemNeeded;
                });
                if (needsSetup) this.setupProduction(this.hub, paused.boost, room);
            }
            productionTracker[this.room.name] = Game.time;
            delete runNext[room.name];
            log.a(`${roomLink(room.name)} resuming production of ${paused.boost} (${paused.reason || 'paused'}).`);
        }
        delete room.memory.labProductionPaused;
    }

    isValidProductionTarget(room, boost) {
        if (!boost || !BOOST_COMPONENTS[boost]) return false;
        if (room.store(boost) >= this.getProductionCutoff(boost)) return false;
        return this.inputsStillViable(room, boost);
    }

    retargetIfInvalid(room, labs) {
        const current = room.memory.producingBoost;
        if (!current || this.isValidProductionTarget(room, current)) return;

        const hubIds = this.primaryLabs[room.name];
        if (!this.hub || this.hub.length < 2 || !hubIds || !labs.some(lab => !hubIds.includes(lab.id))) return;

        const next = this.findBoostToProduce(room);
        if (!next || next === current) return;

        log.a(`${roomLink(room.name)} retargeting ${current} → ${next} (current target no longer viable).`);
        this.setupProduction(this.hub, next, room);
    }

    stopProduction(room, message) {
        const boost = room.memory.producingBoost;
        log.a(`${roomLink(room.name)} halting ${boost || 'production'}. ${message || ''}`);
        room.memory.producingBoost = undefined;
        this.primaryLabs[room.name] = undefined;
        productionTracker[this.room.name] = undefined;
        delete runNext[room.name];
        delete room.memory.labProductionWaiting;
        delete room.memory.labProductionPaused;
        if (this.hub) {
            for (const lab of this.hub) {
                if (lab) lab.memory = undefined;
            }
        }
    }

    getInputStartThreshold(room, resource) {
        if (BASE_MINERALS.includes(resource)) return REACTION_AMOUNT * 0.1;
        return Math.max(REACTION_AMOUNT * 0.05, 50 * room.level);
    }

    getInputStopThreshold(room, resource) {
        return Math.floor(this.getInputStartThreshold(room, resource) * INPUT_STOP_RATIO);
    }

    getWorkingStock(boost) {
        return Math.min(this.getProductionCutoff(boost), WORKING_STOCK);
    }

    getAvailableInput(room, resource) {
        let amount = room.store(resource) || 0;
        const factory = room.factory;
        if (factory && factory.store) {
            const producing = factory.memory && factory.memory.producing;
            const commodity = producing && COMMODITIES[producing];
            if (commodity && commodity.components[resource]) {
                amount -= factory.store[resource] || 0;
            }
        }
        const structMem = room.memory._structureMemory;
        const labs = room.labs || [];
        for (let i = 0; i < labs.length; i++) {
            const lab = labs[i];
            const mem = structMem && structMem[lab.id];
            if (mem && mem.neededBoost === resource) amount -= lab.store[resource] || 0;
        }
        return Math.max(0, amount);
    }

    hubCanReactNow(room) {
        if (!this.hub || this.hub.length < 2) return false;
        const structMem = room.memory._structureMemory;
        return this.hub.every(lab => {
            const mem = lab && structMem && structMem[lab.id];
            return mem && (lab.store[mem.itemNeeded] || 0) >= LAB_REACTION_MINERAL;
        });
    }

    inReactionRange(lab) {
        if (!lab || !this.hub || this.hub.length < 2) return false;
        return lab.pos.getRangeTo(this.hub[0]) <= REACTION_RANGE
            && lab.pos.getRangeTo(this.hub[1]) <= REACTION_RANGE;
    }

    isProductionOutputLab(lab, hubIds, structMem) {
        if (!lab || hubIds.includes(lab.id) || !this.inReactionRange(lab)) return false;
        const mem = structMem && structMem[lab.id];
        if (mem && (mem.itemNeeded || mem.neededBoost || mem.paused)) return false;
        return true;
    }

    isReadyReactionSecondary(lab, hubIds, structMem, producingBoost) {
        if (!this.isProductionOutputLab(lab, hubIds, structMem)) return false;
        if (lab.cooldown) return false;
        if (lab.mineralType && lab.mineralType !== producingBoost) return false;
        if (lab.store[RESOURCE_ENERGY] < LAB_REACTION_ENERGY) return false;
        const product = lab.store[producingBoost] || 0;
        if (product > 0 && lab.store.getFreeCapacity(producingBoost) < LAB_REACTION_MINERAL) return false;
        return true;
    }

    hasProductionOutput(room, labs) {
        const hubIds = this.primaryLabs[room.name];
        if (!hubIds) return false;
        const structMem = room.memory._structureMemory;
        return labs.some(lab => this.isProductionOutputLab(lab, hubIds, structMem));
    }

    inputsStillViable(room, boost) {
        if (this.hubCanReactNow(room)) return true;
        const components = BOOST_COMPONENTS[boost];
        if (!components || !components.length) return false;
        return components.every(input => this.getAvailableInput(room, input) >= this.getInputStopThreshold(room, input));
    }

    boostDeficitSort(room, a, b) {
        return (this.getProductionCutoff(b) - room.store(b)) - (this.getProductionCutoff(a) - room.store(a));
    }

    findBoostToProduce(room) {
        const priority = this.tryPriority(room);
        if (priority) return priority;
        const boostList = [...new Set([...BASE_COMPOUNDS, ...TIER_3_BOOSTS, ...TIER_2_BOOSTS, ...TIER_1_BOOSTS])]
            .sort((a, b) => this.boostDeficitSort(room, a, b));
        let belowCap = false;
        for (const boost of boostList) {
            const cutOff = this.getProductionCutoff(boost);
            if (room.store(boost) >= cutOff) continue;
            belowCap = true;
            if (this.checkForInputs(room, boost)) return boost;
        }
        if (!belowCap) {
            if (!goOverCap[room.name]) goOverCap[room.name] = 2; else goOverCap[room.name]++;
        }
        return null;
    }

    tryPriority(room) {
        const priority = !HOSTILES.length ? LAB_PEACE_PRIORITY : LAB_WAR_PRIORITY;
        for (const boost of priority) {
            const result = this.findProducible(room, boost, true, true);
            if (result) return result;
        }
        return null;
    }

    findProducible(room, boost, globalCheck = false, isGoal = false) {
        const components = BOOST_COMPONENTS[boost];
        if (!components || !components.length) return null;

        const cutoff = isGoal ? this.getProductionCutoff(boost) : this.getWorkingStock(boost);
        const current = (globalCheck && isGoal) ? getResourceTotal(boost)
            : (isGoal ? room.store(boost) : this.getAvailableInput(room, boost));
        if (current >= cutoff) return null;

        if (this.checkForInputs(room, boost)) return boost;

        for (let i = 0; i < components.length; i++) {
            const result = this.findProducible(room, components[i], false, false);
            if (result) return result;
        }
        return null;
    }

    getProductionCutoff(boost) {
        const base = BOOST_AMOUNT(this.room, boost);
        return goOverCap[this.room.name] ? base * goOverCap[this.room.name] : base;
    }

    checkForInputs(room, boost) {
        const components = BOOST_COMPONENTS[boost];
        if (!components || !components.length) return false;
        return components.every(input => this.getAvailableInput(room, input) >= this.getInputStartThreshold(room, input));
    }

    setupProduction(hub, boost, room) {
        if (!hub || hub.length < 2) return;
        const components = BOOST_COMPONENTS[boost];
        if (!components || components.length < 2) return;
        const already = room.memory.producingBoost === boost;
        hub.forEach((lab, i) => {
            const mem = lab.memory;
            if (!mem || mem.itemNeeded !== components[i]) {
                lab.memory = {itemNeeded: components[i], room: room.name};
            }
        });
        room.memory.producingBoost = boost;
        if (!already) {
            productionTracker[this.room.name] = Game.time;
            log.a(`${roomLink(room.name)} starting production of ${boost} (inputs: ${components.join(', ')})`);
        }
    }

    cleanLabs(labs) {
        labs.forEach(lab => {
            const structMem = lab.room.memory._structureMemory;
            const mem = structMem && structMem[lab.id];
            if (!mem || !mem.neededBoost) return;
            const hasLiveRequestor = mem.requestors && mem.requestors.some(id => Game.getObjectById(id));
            if (hasLiveRequestor) return;
            const hasPreReserve = mem.preReservedFor && mem.preReservedFor.some(n => Game.creeps[n]);
            if (hasPreReserve) {
                mem.requested = Game.time;
                return;
            }
            // Pooled waitFor fill still sitting for a body that hasn't spawned.
            // A 50-part egg is 150 ticks; don't yank the lab mid-spawn.
            if ((mem.amount || 0) > 0) {
                if (!mem.requested || mem.requested + 250 < Game.time) {
                    lab.memory = undefined;
                }
                return;
            }
            if (!mem.requested || mem.requested + 150 < Game.time) {
                lab.memory = undefined;
            }
        });
    }

    getLabHub(room) {
        // C4: plan.anchors.lab first.
        let labXY = null;
        try {
            const res = require('planDoc').getLabHub(room);
            labXY = res && res.hub;
        } catch (e) {
            labXY = room.memory.labHub;
        }
        if (!labXY) {
            this.primaryLabs[room.name] = undefined;
            return null;
        }

        const hubPos = new RoomPosition(labXY.x, labXY.y, room.name);
        const hubLabs = room.labs.filter(lab =>
            lab.isActive() &&
            lab.pos.x === hubPos.x &&
            (lab.pos.y === hubPos.y || lab.pos.y === hubPos.y + 1)
        );

        if (hubLabs.length >= 2) {
            hubLabs.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
            const pair = hubLabs.slice(0, 2);
            this.primaryLabs[room.name] = pair.map(l => l.id);
            return pair;
        }

        const hubSites = room.constructionSites.filter(s =>
            s.structureType === STRUCTURE_LAB &&
            s.pos.x === hubPos.x &&
            (s.pos.y === hubPos.y || s.pos.y === hubPos.y + 1)
        );

        // Hub pair still building — keep anchor to avoid re-running the expensive search.
        if (hubLabs.length + hubSites.length > 0) {
            this.primaryLabs[room.name] = undefined;
            return null;
        }

        // Labs exist elsewhere but not at the anchor — recover a vertical pair if possible.
        if (room.labs.length >= 2) {
            const active = room.labs.filter(l => !l.isActive || l.isActive());
            for (const lab of active) {
                const partner = active.find(l => l.id !== lab.id && l.pos.x === lab.pos.x && l.pos.y === lab.pos.y + 1);
                if (partner) {
                    // C5: commit via plan anchors (no dual-write labHub).
                    try {
                        require('planAnchors').commitLabHub(room, {x: lab.pos.x, y: lab.pos.y}, true);
                    } catch (e) {
                        room.memory.labHub = {x: lab.pos.x, y: lab.pos.y};
                        room.memory.labHubPartial = true;
                    }
                    const pair = [lab, partner].sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
                    this.primaryLabs[room.name] = pair.map(l => l.id);
                    return pair;
                }
            }
        }

        if (room.labs.length) {
            try {
                const plan = room.memory.plan;
                if (plan && plan.anchors) {
                    plan.anchors.lab = null;
                    plan.anchors.labPartial = false;
                }
            } catch (e) { /* ignore */
            }
            delete room.memory.labHub;
            delete room.memory.labHubPartial;
        }
        this.primaryLabs[room.name] = undefined;
        return null;
    }
}

profiler.registerClass(LabManager, 'LabManager');
module.exports = LabManager;
