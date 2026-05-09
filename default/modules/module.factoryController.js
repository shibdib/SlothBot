/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
let tickTracker = {};
let cooldownTracker = {};

class FactoryControl {
    constructor() {
    }

    run(room) {
        const factory = room.factory;
        if (!factory || room.nukes.length) return;

        const currentTime = Game.time;
        const lastRun = tickTracker[room.name] || 0;
        const coolDown = cooldownTracker[room.name] || 10;

        if (lastRun + coolDown > currentTime) return;
        tickTracker[room.name] = currentTime;

        if (factory.cooldown) {
            cooldownTracker[room.name] = factory.cooldown + 1;
            return;
        }

        const energyStored = room.store(RESOURCE_ENERGY, true);
        const factoryLevel = factory.level || 0;

        // Stop current production if conditions are met
        if (factory.memory.producing && this.shouldStopProduction(room, factory)) {
            delete factory.memory.producing;
        }

        // Decide on new production if not currently producing
        if (!factory.memory.producing) {
            this.decideProduction(room, factory, energyStored, factoryLevel);
        }

        // Attempt production only if we have a valid target
        if (factory.memory.producing && this.isValidProductionTarget(factory.memory.producing, room, factoryLevel)) {
            const result = factory.produce(factory.memory.producing);
            if (result === OK) {
                cooldownTracker[room.name] = COMMODITIES[factory.memory.producing].cooldown + 1;
            } else {
                // Unexpected failure — clear target and re-evaluate next cycle
                log.a(`${roomLink(room.name)} factory produce() failed for ${factory.memory.producing} (${result}), re-evaluating.`, 'FACTORY CONTROL:');
                delete factory.memory.producing;
                cooldownTracker[room.name] = 10;
            }
        } else if (factory.memory.producing) {
            log.a(`${roomLink(room.name)} clearing invalid production target ${factory.memory.producing}.`, 'FACTORY CONTROL:');
            delete factory.memory.producing;
        }
    }

    setProduction(factory, resource, reason) {
        factory.memory.producing = resource;
        const commodity = COMMODITIES[resource];
        const inputs = commodity ? Object.keys(commodity.components).map(c => `${commodity.components[c]}×${c}`).join(', ') : '';
        log.a(`${roomLink(factory.room.name)} producing ${resource}${inputs ? ` (${inputs})` : ''} — ${reason}`, 'FACTORY CONTROL:');
    }

    shouldStopProduction(room, factory) {
        const producing = factory.memory.producing;
        const commodity = COMMODITIES[producing];
        const batteryStored = room.store(RESOURCE_BATTERY);
        const batteryCost = commodity && commodity.components[RESOURCE_BATTERY] ? commodity.components[RESOURCE_BATTERY] : 0;

        if (producing === RESOURCE_BATTERY && room.energyState < 2) {
            log.a(`${roomLink(room.name)} stopping battery production — low energy.`, 'FACTORY CONTROL:');
            return true;
        }
        if (producing === RESOURCE_ENERGY) {
            if (room.energyState > 1) {
                log.a(`${roomLink(room.name)} stopping battery→energy — energy restored.`, 'FACTORY CONTROL:');
                return true;
            }
            if (batteryStored < batteryCost) {
                log.a(`${roomLink(room.name)} stopping battery→energy — batteries exhausted.`, 'FACTORY CONTROL:');
                return true;
            }
            return false;
        }
        if (!COMPRESSED_COMMODITIES.includes(producing)) {
            const threshold = BASE_MINERALS.includes(producing) ? REACTION_AMOUNT : DUMP_AMOUNT * 0.9;
            if (room.store(producing) >= threshold) {
                log.a(`${roomLink(room.name)} stopping ${producing} — cap reached.`, 'FACTORY CONTROL:');
                return true;
            }
            return false;
        }
        // Compressed commodity: stop if any non-energy input is running low
        if (Object.keys(commodity.components).some(r => r !== RESOURCE_ENERGY && room.store(r) < REACTION_AMOUNT * 0.5)) {
            log.a(`${roomLink(room.name)} stopping ${producing} — input running low.`, 'FACTORY CONTROL:');
            return true;
        }
        if (commodity.components[RESOURCE_ENERGY] && !room.energyState) {
            log.a(`${roomLink(room.name)} stopping ${producing} — no energy.`, 'FACTORY CONTROL:');
            return true;
        }
        return false;
    }

    decideProduction(room, factory, energyStored, factoryLevel) {
        const batteryStored = room.store(RESOURCE_BATTERY);
        const batteryCost = COMMODITIES[RESOURCE_ENERGY].components[RESOURCE_BATTERY] || 50;

        // Convert batteries to energy if energy is low and batteries are available
        if (!room.energyState && batteryStored >= batteryCost) {
            this.setProduction(factory, RESOURCE_ENERGY, 'low energy');
            return;
        }

        // Make batteries if energy surplus and storage is filling up
        if (room.energyState > 1 && !this.hasStorageSpace(room)) {
            this.setProduction(factory, RESOURCE_BATTERY, 'storage full');
            return;
        }

        // Space guard — don't manufacture if output has nowhere to go
        const totalFree = (room.storage ? room.storage.store.getFreeCapacity() : 0) +
            (room.terminal ? room.terminal.store.getFreeCapacity() : 0);
        if (totalFree < 50000) return;

        // Sort by deficit so the most urgently needed resource is always chosen first.
        // This is deterministic and stable — the same resource wins every re-decision
        // until its cap is reached, preventing oscillation between commodities.
        const deficitSort = (a, b) => {
            const threshA = BASE_MINERALS.includes(a) ? REACTION_AMOUNT * 0.25 : DUMP_AMOUNT * 0.9;
            const threshB = BASE_MINERALS.includes(b) ? REACTION_AMOUNT * 0.25 : DUMP_AMOUNT * 0.9;
            return (threshB - room.store(b)) - (threshA - room.store(a));
        };

        // Try manufactured commodities — highest deficit first
        for (const resource of [...BASE_MINERALS, ...MANUFACTURED_COMMODITIES].sort(deficitSort)) {
            if (this.isValidProductionTarget(resource, room, factoryLevel)) {
                this.setProduction(factory, resource, 'surplus inputs');
                return;
            }
        }

        // Try compression — highest deficit first
        for (const resource of [...COMPRESSED_COMMODITIES].filter(r => r !== RESOURCE_BATTERY).sort(deficitSort)) {
            if (this.isValidProductionTarget(resource, room, factoryLevel)) {
                this.setProduction(factory, resource, 'compressing');
                return;
            }
        }
    }

    isValidProductionTarget(resource, room, factoryLevel) {
        const commodity = COMMODITIES[resource];
        if (!commodity) return false;
        if (commodity.level && commodity.level !== factoryLevel) return false;
        if ([RESOURCE_ENERGY, RESOURCE_BATTERY].includes(resource)) return true;

        const threshold = BASE_MINERALS.includes(resource) ? REACTION_AMOUNT * 0.25 : DUMP_AMOUNT * 0.9;
        if (room.store(resource) >= threshold) return false;

        return Object.keys(commodity.components).every(component => {
            const required = commodity.components[component];
            return room.store(component) >= required &&
                (!COMPRESSED_COMMODITIES.includes(resource) || room.store(component) >= REACTION_AMOUNT * 1.1);
        });
    }

    hasStorageSpace(room) {
        return !(room.storage && room.storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1);
    }
}

profiler.registerClass(FactoryControl, 'FactoryControl');
module.exports = FactoryControl;