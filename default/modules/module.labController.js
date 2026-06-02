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
        const labs = room.labs;
        if (!labs.length) return;

        // Periodic lab memory cleanup
        if (!lastClean[room.name] || lastClean[room.name] + 100 < Game.time) {
            this.cleanLabs(labs);
            lastClean[room.name] = Game.time;
        }

        if (!runNext[room.name] || runNext[room.name] < Game.time) {
            this.manageBoostProduction(room, labs);
            this.manageActiveLabs(room, labs);
            if (!runNext[room.name] || runNext[room.name] <= Game.time) runNext[room.name] = Game.time + 15;
        }
    }

    manageBoostProduction(room, labs) {
        if (room.memory.producingBoost) return;
        if (!this.hub || this.hub.length < 2) return;
        const secondaryLabs = labs.filter(lab => !this.primaryLabs[room.name].includes(lab.id));
        if (!secondaryLabs.length) return;
        const boost = this.findBoostToProduce(room);
        if (!boost) return;

        this.setupProduction(this.hub, boost, room);
    }

    manageActiveLabs(room, labs) {
        if (!room.memory.producingBoost || !this.hub) return;

        // Sanity check — if hub labs lost their memory, abort cleanly
        for (const lab of this.hub) {
            if (!lab.memory || !lab.memory.itemNeeded) {
                this.stopProduction(room, 'Hub lab memory lost.');
                return;
            }
        }

        const secondaryLabs = labs.filter(lab =>
            !lab.cooldown &&
            !this.primaryLabs[room.name].includes(lab.id) &&
            (!lab.memory || !lab.memory.paused || lab.memory.neededBoost === room.memory.producingBoost) &&
            (!lab.memory || !lab.memory.neededBoost || lab.memory.neededBoost === room.memory.producingBoost) &&
            (!lab.mineralType || lab.mineralType === room.memory.producingBoost)
        );

        for (const target of secondaryLabs) {
            const result = target.runReaction(this.hub[0], this.hub[1]);
            if (result === OK) {
                runNext[room.name] = Game.time + REACTION_TIME[room.memory.producingBoost] + 1;
                if (!productionTracker[this.room.name]) productionTracker[this.room.name] = Game.time;
            }
        }
        this.shouldStopProduction(room);
    }

    shouldStopProduction(room) {
        if (room.store(room.memory.producingBoost) > this.getProductionCutoff(room.memory.producingBoost)) {
            this.stopProduction(room, 'Boost cap reached.');
        } else if (productionTracker[this.room.name] && productionTracker[this.room.name] + CREEP_LIFE_TIME * 3 < Game.time) {
            this.stopProduction(room, 'Production stalled — time limit reached.');
        } else if (this.hub.some(lab => !lab.memory || room.store(lab.memory.itemNeeded) < 50)) {
            this.stopProduction(room, 'Input exhausted.');
        }
    }

    stopProduction(room, message) {
        const boost = room.memory.producingBoost;
        log.a(`${roomLink(room.name)} halting ${boost || 'production'}. ${message || ''}`);
        room.memory.producingBoost = undefined;
        this.primaryLabs[room.name] = undefined;
        goOverCap[this.room.name] = undefined;
        productionTracker[this.room.name] = undefined;
        if (this.hub) this.hub.forEach(lab => {
            lab.memory = undefined;
        });
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
        // Expand the T3 priority list into [...T1 prereqs, ...T2 prereqs, ...T3s].
        // Why: T1/T2 reactions are much faster than T3, so stockpiling lower tiers across
        // the whole priority list first means we always have *something* usable to boost
        // with, instead of grinding on slow T3 reactions for the first priority entry.
        const t1 = [], t2 = [], t3 = [];
        for (const boost of priority) {
            if (!t3.includes(boost)) t3.push(boost);
            const t2Comp = BOOST_COMPONENTS[boost] && BOOST_COMPONENTS[boost][0];
            if (!t2Comp) continue;
            if (!t2.includes(t2Comp)) t2.push(t2Comp);
            const t1Comp = BOOST_COMPONENTS[t2Comp] && BOOST_COMPONENTS[t2Comp][0];
            if (t1Comp && !t1.includes(t1Comp)) t1.push(t1Comp);
        }
        // Precursors checked room-local (they must be in this room to react); T3s checked empire-wide.
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

    // Recursively find the deepest component we can produce to work toward `boost`.
    // Recurses BEFORE checking inputs: only commit the labs to producing this boost
    // once each component is at its tier-aware cutoff. Prevents the labs from
    // pivoting to a higher tier the instant inputs are minimally available, which
    // leaves T1/T2 stocks chronically thin.
    //
    // globalCheck=true uses getResourceTotal (cross-room) for the top-level boost;
    // component levels use room-local store since they need to be here to react.
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
        return goOverCap[this.room.name] ? base * 2 : base;
    }

    checkForInputs(room, boost) {
        let components = BOOST_COMPONENTS[boost];
        if (!components || components.length === 0) return false;
        return components.every(input => room.store(input) >= 50 * room.level);
    }

    setupProduction(hub, boost, room) {
        const components = BOOST_COMPONENTS[boost];
        hub.forEach((lab, i) => {
            lab.memory = {itemNeeded: components[i], room: room.name};
        });
        room.memory.producingBoost = boost;
        productionTracker[this.room.name] = Game.time;
        log.a(`${roomLink(room.name)} starting production of ${boost} (inputs: ${components.join(', ')})`);
    }

    cleanLabs(labs) {
        labs.forEach(lab => {
            if (!lab.memory || !lab.memory.neededBoost) return;
            // Wipe boost config when no live requestor remains AND the
            // reservation has aged out. claimBoostLab refreshes `requested` on
            // every claim so legitimate multi-creep use keeps the clock fresh;
            // pre-reservation alone isn't enough to keep a lab alive — if the
            // creep never reaches the claim, the lab times out the same way it
            // would under the old singular-requestor model.
            const hasLiveRequestor = lab.memory.requestors && lab.memory.requestors.some(id => Game.getObjectById(id));
            if (hasLiveRequestor) return;
            if (!lab.memory.requested || lab.memory.requested + 150 < Game.time) {
                lab.memory = undefined;
            }
        });
    }

    getLabHub(room) {
        if (!this.primaryLabs[room.name]) {
            if (!room.memory.labHub) return;
            let labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
            // Clear a bad hub if we have labs but not at the hub
            const labs = room.labs;
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