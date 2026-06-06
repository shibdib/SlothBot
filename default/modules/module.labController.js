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
        this.hub = null;
    }

    run(room) {
        const labs = room.labs.filter(l => l.isActive());
        if (!labs.length) return;

        if (!lastClean[room.name] || lastClean[room.name] + 100 < Game.time) {
            this.cleanLabs(labs);
            lastClean[room.name] = Game.time;
        }

        this.hub = this.getLabHub(room);

        if (room.memory.producingBoost) {
            this.shouldStopProduction(room);
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

        const hubIds = this.primaryLabs[room.name];
        for (const lab of this.hub) {
            if (!lab || !lab.memory || !lab.memory.itemNeeded) {
                this.stopProduction(room, 'Hub lab memory lost.');
                return;
            }
        }

        const secondaryLabs = labs.filter(lab =>
            !lab.cooldown &&
            !hubIds.includes(lab.id) &&
            (!lab.memory || !lab.memory.paused || lab.memory.neededBoost === room.memory.producingBoost) &&
            (!lab.memory || !lab.memory.neededBoost || lab.memory.neededBoost === room.memory.producingBoost) &&
            (!lab.mineralType || lab.mineralType === room.memory.producingBoost)
        );

        for (const target of secondaryLabs) {
            const result = target.runReaction(this.hub[0], this.hub[1]);
            if (result === OK) {
                runNext[room.name] = Game.time + REACTION_TIME[room.memory.producingBoost] + 1;
                productionTracker[this.room.name] = Game.time;
            }
        }
    }

    shouldStopProduction(room) {
        const boost = room.memory.producingBoost;
        if (!boost) return;

        if (room.store(boost) >= this.getProductionCutoff(boost)) {
            if (goOverCap[room.name]) goOverCap[room.name]--;
            this.stopProduction(room, 'Boost cap reached.');
        } else if (productionTracker[this.room.name] && productionTracker[this.room.name] + CREEP_LIFE_TIME * 3 < Game.time) {
            this.stopProduction(room, 'Production stalled — time limit reached.');
        } else if (!this.hub || this.hub.length < 2 ||
            this.hub.some(lab => !lab || !lab.memory || room.store(lab.memory.itemNeeded) < 50)) {
            this.stopProduction(room, 'Input exhausted.');
        }
    }

    stopProduction(room, message) {
        const boost = room.memory.producingBoost;
        log.a(`${roomLink(room.name)} halting ${boost || 'production'}. ${message || ''}`);
        room.memory.producingBoost = undefined;
        this.primaryLabs[room.name] = undefined;
        productionTracker[this.room.name] = undefined;
        if (this.hub) {
            for (const lab of this.hub) {
                if (lab) lab.memory = undefined;
            }
        }
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
        if (!goOverCap[room.name]) goOverCap[room.name] = 2; else goOverCap[room.name]++;
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
        let components = BOOST_COMPONENTS[boost];
        if (!components || components.length === 0) return false;
        return components.every(input => room.store(input) >= 50 * room.level);
    }

    setupProduction(hub, boost, room) {
        if (!hub || hub.length < 2) return;
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
            const hasLiveRequestor = lab.memory.requestors && lab.memory.requestors.some(id => Game.getObjectById(id));
            if (hasLiveRequestor) return;
            if (!lab.memory.requested || lab.memory.requested + 150 < Game.time) {
                lab.memory = undefined;
            }
        });
    }

    getLabHub(room) {
        if (!room.memory.labHub) {
            this.primaryLabs[room.name] = undefined;
            return null;
        }

        const hubPos = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
        const hubLabs = room.labs.filter(lab =>
            lab.isActive() &&
            lab.pos.x === hubPos.x &&
            (lab.pos.y === hubPos.y || lab.pos.y === hubPos.y + 1)
        );

        if (room.labs.length && hubLabs.length < 2) {
            delete room.memory.labHub;
            this.primaryLabs[room.name] = undefined;
            return null;
        }

        if (hubLabs.length < 2) {
            this.primaryLabs[room.name] = undefined;
            return null;
        }

        const pair = hubLabs.slice(0, 2);
        this.primaryLabs[room.name] = pair.map(l => l.id);
        return pair;
    }
}

profiler.registerClass(LabManager, 'LabManager');
module.exports = LabManager;