/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Smarter Stockpiling
 *
 * CPU Wins:
 * - Per-tick caching of labs, hub, and secondary labs
 * - Reduced redundant filtering and shuffling
 * - Smarter early exits in production logic
 *
 * Smarter Production:
 * - Strong T1/T2 priority before T3
 * - Only starts T3 when we have healthy T1/T2 stockpile
 * - Dynamic cutoffs per tier
 * - Bottom-up production (build precursors first)
 */

const profiler = require("tools.profiler");

const runNext = {};
const lastClean = {};
const productionTracker = {};

class LabManager {
    constructor(room) {
        this.room = room;
        this._tickCache = {};
    }

    run(room) {
        const labs = room.labs;
        if (!labs.length) return;

        // Periodic cleanup
        if (!lastClean[room.name] || lastClean[room.name] + 100 < Game.time) {
            this.cleanLabs(labs);
            lastClean[room.name] = Game.time;
        }

        if (!runNext[room.name] || runNext[room.name] < Game.time) {
            this.manageBoostProduction(room, labs);
            this.manageActiveLabs(room, labs);
            runNext[room.name] = Game.time + 15;
        }
    }

    // === CACHED GETTERS ===
    getHub() {
        if (!this._tickCache.hub || this._tickCache.hub.ts !== Game.time) {
            if (!this.room.memory.labHub) {
                this._tickCache.hub = {data: null, ts: Game.time};
                return null;
            }
            const pos = new RoomPosition(this.room.memory.labHub.x, this.room.memory.labHub.y, this.room.name);
            const hubLabs = this.room.labs.filter(l =>
                (l.pos.x === pos.x && l.pos.y === pos.y) ||
                (l.pos.x === pos.x && l.pos.y === pos.y + 1)
            );
            this._tickCache.hub = {data: hubLabs.length === 2 ? hubLabs : null, ts: Game.time};
        }
        return this._tickCache.hub.data;
    }

    getSecondaryLabs() {
        if (!this._tickCache.secondary || this._tickCache.secondary.ts !== Game.time) {
            const hub = this.getHub();
            if (!hub) {
                this._tickCache.secondary = {data: [], ts: Game.time};
                return [];
            }
            const hubIds = new Set(hub.map(l => l.id));
            const secondary = this.room.labs.filter(l => !hubIds.has(l.id) && !l.cooldown);
            this._tickCache.secondary = {data: secondary, ts: Game.time};
        }
        return this._tickCache.secondary.data;
    }

    manageBoostProduction(room, labs) {
        if (room.memory.producingBoost) return;

        const hub = this.getHub();
        if (!hub || hub.length < 2) return;

        const boost = this.findBoostToProduce(room);
        if (!boost) return;

        this.setupProduction(hub, boost, room);
    }

    manageActiveLabs(room, labs) {
        if (!room.memory.producingBoost) return;

        const hub = this.getHub();
        if (!hub || hub.some(l => !l.memory?.itemNeeded)) {
            this.stopProduction(room, 'Hub lab memory lost.');
            return;
        }

        const secondary = this.getSecondaryLabs().filter(lab =>
            (!lab.memory?.paused || lab.memory.neededBoost === room.memory.producingBoost) &&
            (!lab.memory?.neededBoost || lab.memory.neededBoost === room.memory.producingBoost) &&
            (!lab.mineralType || lab.mineralType === room.memory.producingBoost)
        );

        for (const target of secondary) {
            const result = target.runReaction(hub[0], hub[1]);
            if (result === OK) {
                const cooldown = Game.time + REACTION_TIME[room.memory.producingBoost] - 1;
                if (!runNext[room.name] || runNext[room.name] > cooldown) {
                    runNext[room.name] = cooldown;
                }
                if (!productionTracker[room.name]) productionTracker[room.name] = Game.time;
            }
        }

        this.shouldStopProduction(room);
    }

    shouldStopProduction(room) {
        const boost = room.memory.producingBoost;
        const cutoff = this.getProductionCutoff(boost);

        if (room.store(boost) > cutoff) {
            this.stopProduction(room, 'Boost cap reached.');
        } else if (productionTracker[room.name] && productionTracker[room.name] + CREEP_LIFE_TIME * 3 < Game.time) {
            this.stopProduction(room, 'Production stalled.');
        } else if (this.getHub().some(lab => room.store(lab.memory.itemNeeded) < 50)) {
            this.stopProduction(room, 'Input exhausted.');
        }
    }

    stopProduction(room, message = '') {
        const boost = room.memory.producingBoost;
        log.a(`${roomLink(room.name)} halting ${boost || 'production'}. ${message}`);
        room.memory.producingBoost = undefined;
        productionTracker[room.name] = undefined;

        const hub = this.getHub();
        if (hub) hub.forEach(lab => lab.memory = undefined);
    }

    // === SMARTER PRODUCTION LOGIC ===
    findBoostToProduce(room) {
        // 1. Try priority list (with stockpile-first logic)
        const priorityBoost = this.tryPriority(room);
        if (priorityBoost) return priorityBoost;

        // 2. Fallback: any boost we can make
        const boostList = [...new Set([...BASE_COMPOUNDS, ...TIER_3_BOOSTS, ...TIER_2_BOOSTS, ...TIER_1_BOOSTS])];
        for (const boost of shuffle(boostList)) {
            if (room.store(boost) >= this.getProductionCutoff(boost)) continue;
            if (this.checkForInputs(room, boost)) return boost;
        }
        return null;
    }

    tryPriority(room) {
        const priority = !HOSTILES.length ? LAB_PEACE_PRIORITY : LAB_WAR_PRIORITY;

        // Build tiered lists
        const t1 = [], t2 = [], t3 = [];
        for (const boost of priority) {
            if (!t3.includes(boost)) t3.push(boost);
            const t2Comp = BOOST_COMPONENTS[boost]?.[0];
            if (t2Comp && !t2.includes(t2Comp)) t2.push(t2Comp);
            const t1Comp = t2Comp && BOOST_COMPONENTS[t2Comp]?.[0];
            if (t1Comp && !t1.includes(t1Comp)) t1.push(t1Comp);
        }

        // Stockpile-first strategy:
        // - Produce T1 until we have good stock
        // - Then T2
        // - Only then allow T3
        for (const boost of t1) {
            const result = this.findProducible(room, boost);
            if (result) return result;
        }
        for (const boost of t2) {
            const result = this.findProducible(room, boost);
            if (result) return result;
        }
        for (const boost of t3) {
            // Only start T3 if we have healthy T1/T2 stockpile
            if (this.hasHealthyLowerTierStockpile(boost)) {
                const result = this.findProducible(room, boost);
                if (result) return result;
            }
        }
        return null;
    }

    // Bottom-up production: only return a boost when all its components are sufficiently stocked
    findProducible(room, boost) {
        const cutoff = this.getProductionCutoff(boost);
        if (room.store(boost) >= cutoff) return null;

        const components = BOOST_COMPONENTS[boost];
        if (components?.length) {
            for (const comp of components) {
                const result = this.findProducible(room, comp);
                if (result) return result;
            }
        }

        if (this.checkForInputs(room, boost)) return boost;
        return null;
    }

    // Check if we have enough lower-tier stock before allowing T3 production
    hasHealthyLowerTierStockpile(t3Boost) {
        const t2 = BOOST_COMPONENTS[t3Boost]?.[0];
        const t1 = t2 && BOOST_COMPONENTS[t2]?.[0];

        const t2Cutoff = this.getProductionCutoff(t2) * 1.5;
        const t1Cutoff = this.getProductionCutoff(t1) * 1.5;

        return (!t2 || this.room.store(t2) >= t2Cutoff) &&
            (!t1 || this.room.store(t1) >= t1Cutoff);
    }

    getProductionCutoff(boost) {
        const base = BOOST_AMOUNT(this.room, boost);
        // Lower tiers get higher stockpile targets
        if (TIER_1_BOOSTS.includes(boost)) return base * 3;
        if (TIER_2_BOOSTS.includes(boost)) return base * 2.5;
        return base * 2; // T3 and others
    }

    checkForInputs(room, boost) {
        const components = BOOST_COMPONENTS[boost];
        if (!components?.length) return false;
        return components.every(input => room.store(input) >= 50 * room.level);
    }

    setupProduction(hub, boost, room) {
        const components = BOOST_COMPONENTS[boost];
        hub.forEach((lab, i) => {
            lab.memory = {itemNeeded: components[i], room: room.name};
        });
        room.memory.producingBoost = boost;
        productionTracker[room.name] = Game.time;
        log.a(`${roomLink(room.name)} starting production of ${boost} (inputs: ${components.join(', ')})`);
    }

    cleanLabs(labs) {
        labs.forEach(lab => {
            if (lab.memory?.neededBoost) {
                if (!lab.memory.requested || lab.memory.requested + 150 < Game.time || !Game.getObjectById(lab.memory.requestor)) {
                    lab.memory = undefined;
                }
            }
        });
    }
}

profiler.registerClass(LabManager, 'LabManager');
module.exports = LabManager;