/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const {empireOpsPaused} = require('hcReadiness');
const {getInboundPlannedAmount} = require('termMarket');
const runNext = {};
const lastClean = {};
const goOverCap = {};
const productionTracker = {};
const INPUT_STOP_RATIO = 0.25;
const STALL_GRACE = CREEP_LIFE_TIME * 3;

class LabManager {
    constructor(room) {
        this.primaryLabs = {};
        this.room = room;
        this.hub = null;
    }

    run(room) {
        if (!room.labs.length) return;

        const idle = !room.memory.producingBoost && runNext[room.name] && runNext[room.name] > Game.time;
        if (idle && !room.memory.dangerousAttack && !empireOpsPaused()) {
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

        const opsPaused = empireOpsPaused();
        if (room.memory.dangerousAttack || opsPaused) {
            this.pauseProduction(room, opsPaused ? 'Empire ops paused.' : 'Room under attack.');
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
                if (!runNext[room.name] || runNext[room.name] <= Game.time) {
                    runNext[room.name] = Game.time + 15;
                }
            }
            return;
        }

        if (!runNext[room.name] || runNext[room.name] < Game.time) {
            this.manageActiveLabs(room, labs);
            if (!runNext[room.name] || runNext[room.name] <= Game.time) {
                runNext[room.name] = Game.time + 15;
            }
        }
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

        const secondaryLabs = labs.filter(lab => this.isViableReactionSecondary(lab, hubIds, structMem, producingBoost));

        for (const target of secondaryLabs) {
            const result = target.runReaction(this.hub[0], this.hub[1]);
            if (result === OK) {
                runNext[room.name] = Game.time + REACTION_TIME[room.memory.producingBoost] + 1;
                productionTracker[this.room.name] = Game.time;
            }
        }

        if (this.hasAnySecondaryLab(room, labs) && !this.hasReactionSecondary(room, labs, producingBoost)) {
            room.memory.labProductionWaiting = Game.time;
        } else {
            delete room.memory.labProductionWaiting;
        }
    }

    shouldStopProduction(room, labs) {
        const boost = room.memory.producingBoost;
        if (!boost) return null;

        if (room.store(boost) >= this.getProductionCutoff(boost)) {
            if (goOverCap[room.name]) goOverCap[room.name]--;
            return {reason: 'Boost cap reached.', chain: true};
        }

        if (productionTracker[this.room.name] && productionTracker[this.room.name] + STALL_GRACE < Game.time) {
            if (room.memory.labProductionWaiting) {
                productionTracker[this.room.name] = Game.time;
                return null;
            }
            if (this.inputsStillViable(room, boost, labs)) {
                productionTracker[this.room.name] = Game.time;
                return null;
            }
            if (this.waitingForReactionSecondary(room, labs, boost)) {
                productionTracker[this.room.name] = Game.time;
                return null;
            }
            return {reason: 'Production stalled — time limit reached.', chain: false};
        }

        if (!this.hub || this.hub.length < 2 || this.inputsExhausted(room, boost)) {
            if (this.inputsStillViable(room, boost, labs)) return null;
            return {reason: 'Input exhausted.', chain: true};
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

    isValidProductionTarget(room, boost, labs) {
        if (!boost || !BOOST_COMPONENTS[boost]) return false;
        if (room.store(boost) >= this.getProductionCutoff(boost)) return false;
        if (this.hubCanReactNow(room)) return true;
        return this.inputsStillViable(room, boost, labs);
    }

    retargetIfInvalid(room, labs) {
        const current = room.memory.producingBoost;
        if (!current || this.isValidProductionTarget(room, current, labs)) return;

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

    getAvailableInput(room, resource) {
        return room.store(resource) + getInboundPlannedAmount(room.name, resource);
    }

    hubCanReactNow(room) {
        if (!this.hub || this.hub.length < 2) return false;
        const structMem = room.memory._structureMemory;
        return this.hub.every(lab => {
            const mem = lab && structMem && structMem[lab.id];
            return mem && (lab.store[mem.itemNeeded] || 0) >= LAB_REACTION_MINERAL;
        });
    }

    isViableReactionSecondary(lab, hubIds, structMem, producingBoost) {
        if (!lab || hubIds.includes(lab.id) || lab.cooldown) return false;
        const mem = structMem && structMem[lab.id];
        if (mem && (mem.itemNeeded || mem.neededBoost || mem.paused)) return false;
        if (lab.mineralType && lab.mineralType !== producingBoost) return false;
        if (lab.store[RESOURCE_ENERGY] < LAB_REACTION_ENERGY) return false;
        const product = lab.store[producingBoost] || 0;
        if (product > 0 && lab.store.getFreeCapacity(producingBoost) < LAB_REACTION_MINERAL) return false;
        return true;
    }

    hasReactionSecondary(room, labs, producingBoost) {
        const hubIds = this.primaryLabs[room.name];
        if (!hubIds) return false;
        const structMem = room.memory._structureMemory;
        return labs.some(lab => this.isViableReactionSecondary(lab, hubIds, structMem, producingBoost));
    }

    hasAnySecondaryLab(room, labs) {
        const hubIds = this.primaryLabs[room.name];
        return !!hubIds && labs.some(lab => !hubIds.includes(lab.id));
    }

    waitingForReactionSecondary(room, labs, producingBoost) {
        if (!this.hasAnySecondaryLab(room, labs)) return false;
        if (this.hasReactionSecondary(room, labs, producingBoost)) return false;
        const components = BOOST_COMPONENTS[producingBoost];
        if (!components || !components.length) return false;
        return this.hubCanReactNow(room)
            || components.some(c => this.getAvailableInput(room, c) >= this.getInputStopThreshold(room, c));
    }

    inputsExhausted(room, boost) {
        if (this.hubCanReactNow(room)) return false;
        const components = BOOST_COMPONENTS[boost];
        if (!components || !components.length) return true;
        return components.every(input => this.getAvailableInput(room, input) < this.getInputStopThreshold(room, input));
    }

    inputsStillViable(room, boost, labs) {
        if (this.hubCanReactNow(room) && this.hasReactionSecondary(room, labs, boost)) return true;
        const components = BOOST_COMPONENTS[boost];
        if (!components || !components.length) return false;
        const hasInputs = components.some(input => this.getAvailableInput(room, input) >= this.getInputStopThreshold(room, input));
        return hasInputs && this.hasReactionSecondary(room, labs, boost);
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
        const t1 = [], t2 = [], t3 = [];
        for (const boost of priority) {
            if (!t3.includes(boost)) t3.push(boost);
            const t2Comp = BOOST_COMPONENTS[boost] && BOOST_COMPONENTS[boost][0];
            if (!t2Comp) continue;
            if (!t2.includes(t2Comp)) t2.push(t2Comp);
            const t1Comp = BOOST_COMPONENTS[t2Comp] && BOOST_COMPONENTS[t2Comp][0];
            if (t1Comp && !t1.includes(t1Comp)) t1.push(t1Comp);
        }
        for (const boost of t1) {
            const result = this.findProducible(room, boost, false);
            if (result) return result;
        }
        for (const boost of t2) {
            const result = this.findProducible(room, boost, false);
            if (result) return result;
        }
        for (const boost of t3) {
            const result = this.findProducible(room, boost, true);
            if (result) return result;
        }
        return null;
    }

    findProducible(room, boost, globalCheck = false) {
        const cutoff = this.getProductionCutoff(boost);
        const current = globalCheck ? getResourceTotal(boost) : room.store(boost);
        if (current >= cutoff) return null;

        const components = BOOST_COMPONENTS[boost];
        if (components && components.length) {
            for (const component of components) {
                const result = this.findProducible(room, component, false);
                if (result) return result;
            }
        }
        if (this.checkForInputs(room, boost)) return boost;
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
        hub.forEach((lab, i) => {
            lab.memory = {itemNeeded: components[i], room: room.name};
        });
        room.memory.producingBoost = boost;
        productionTracker[this.room.name] = Game.time;
        delete goOverCap[room.name];
        log.a(`${roomLink(room.name)} starting production of ${boost} (inputs: ${components.join(', ')})`);
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
                    return this.getLabHub(room);
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