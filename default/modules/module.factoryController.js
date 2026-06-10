/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const {empireOpsPaused} = require('hcReadiness');
let tickTracker = {};
let cooldownTracker = {};

const FACTORY_MIN_FREE_SPACE = 50000;

class FactoryControl {
    constructor() {
    }

    run(room) {
        const factory = room.factory;
        if (!factory || !factory.isActive() || room.nukes.length) return;

        const currentTime = Game.time;
        const factoryLevel = factory.level || 0;

        if (currentTime % 1000 === 0) this._pruneTrackers();

        // Render production label every tick so it stays visible during cooldown
        if (factory.memory.producing) {
            const commodity = COMMODITIES[factory.memory.producing];
            const inputsReady = commodity && Object.keys(commodity.components).every(c => (factory.store[c] || 0) >= commodity.components[c]);
            let status, color;
            if (factory.cooldown) {
                status = `⚙ ${factory.memory.producing} (${factory.cooldown})`;
                color = '#00ff00'; // green — actively in production cooldown
            } else if (inputsReady) {
                status = `⚙ ${factory.memory.producing}`;
                color = '#ffff00'; // yellow — inputs loaded, ready to produce
            } else {
                status = `⏳ ${factory.memory.producing}`;
                color = '#ff8800'; // orange — waiting for inputs to be loaded
            }
            room.visual.text(status, factory.pos.x, factory.pos.y - 0.6, {
                color, font: 'bold 0.5 Arial', align: 'center', opacity: 0.85
            });
        }

        // Under attack: stop consuming inputs; do not start new production
        if (room.memory.dangerousAttack) {
            if (factory.memory.producing) this.clearProduction(factory);
            return;
        }

        // Re-evaluate stop/invalid targets every tick so labTech and terminal logic stay aligned
        if (factory.memory.producing) {
            if (this.shouldStopProduction(room, factory)) {
                this.clearProduction(factory);
            } else if (!this.isValidProductionTarget(factory.memory.producing, room, factoryLevel)) {
                log.i(`${roomLink(room.name)} clearing invalid production target ${factory.memory.producing}.`, 'FACTORY CONTROL:');
                this.clearProduction(factory);
            }
        }

        const lastRun = tickTracker[room.name] || 0;
        const coolDown = cooldownTracker[room.name] || 10;

        if (lastRun + coolDown > currentTime) return;
        tickTracker[room.name] = currentTime;

        if (factory.cooldown) {
            cooldownTracker[room.name] = factory.cooldown + 1;
            return;
        }

        // Decide on new production if not currently producing
        if (!factory.memory.producing) {
            this.decideProduction(room, factory, factoryLevel);
        }

        // Attempt production only if we have a valid target
        if (factory.memory.producing && this.isValidProductionTarget(factory.memory.producing, room, factoryLevel)) {
            const commodity = COMMODITIES[factory.memory.producing];
            // Confirm inputs are actually loaded into the factory store before calling produce
            if (!Object.keys(commodity.components).every(c => (factory.store[c] || 0) >= commodity.components[c])) {
                cooldownTracker[room.name] = 3;
                return;
            }
            const result = factory.produce(factory.memory.producing);
            if (result === OK) {
                cooldownTracker[room.name] = commodity.cooldown + 1;
            } else {
                log.w(`${roomLink(room.name)} factory produce() failed for ${factory.memory.producing} (${result}), re-evaluating.`, 'FACTORY CONTROL:');
                this.clearProduction(factory);
                cooldownTracker[room.name] = 10;
            }
        }

        // Handle targeted commodity production
        if (!factory.memory.producing) {
            this.commodityProduction(room, factory, factoryLevel);
        }
    }

    clearProduction(factory) {
        const room = factory.room;
        if (room.memory.neededCommodity && factory.memory.producing === room.memory.neededCommodity) {
            delete room.memory.neededCommodity;
        }
        delete factory.memory.producing;
    }

    _pruneTrackers() {
        for (const name of Object.keys(tickTracker)) {
            if (!Game.rooms[name]) {
                delete tickTracker[name];
                delete cooldownTracker[name];
            }
        }
    }

    setProduction(factory, resource, reason) {
        factory.memory.producing = resource;
        const commodity = COMMODITIES[resource];
        const inputs = commodity ? Object.keys(commodity.components).map(c => `${commodity.components[c]}×${c}`).join(', ') : '';
        log.i(`${roomLink(factory.room.name)} producing ${resource}${inputs ? ` (${inputs})` : ''} — ${reason}`, 'FACTORY CONTROL:');
    }

    isEmergencyProduction(resource) {
        return resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY;
    }

    shouldStopProduction(room, factory) {
        if (room.memory.dangerousAttack) return true;

        const producing = factory.memory.producing;
        if (empireOpsPaused() && producing && !this.isEmergencyProduction(producing)) {
            return true;
        }
        const commodity = COMMODITIES[producing];
        if (!commodity) {
            log.w(`${roomLink(room.name)} unknown production target ${producing}, clearing.`, 'FACTORY CONTROL:');
            return true;
        }

        const batteryStored = room.store(RESOURCE_BATTERY);
        const batteryCost = commodity.components[RESOURCE_BATTERY] || 0;

        if (producing === RESOURCE_BATTERY && room.energyState < 2) {
            log.i(`${roomLink(room.name)} stopping battery production — low energy.`, 'FACTORY CONTROL:');
            return true;
        }
        if (producing === RESOURCE_ENERGY) {
            if (room.energyState > 1) {
                log.i(`${roomLink(room.name)} stopping battery→energy — energy restored.`, 'FACTORY CONTROL:');
                return true;
            }
            if (batteryStored < batteryCost) {
                log.i(`${roomLink(room.name)} stopping battery→energy — batteries exhausted.`, 'FACTORY CONTROL:');
                return true;
            }
            return false;
        }
        if (!COMPRESSED_COMMODITIES.includes(producing)) {
            const threshold = BASE_MINERALS.includes(producing) ? REACTION_AMOUNT : DUMP_AMOUNT * 0.9;
            if (room.store(producing) >= threshold) {
                log.i(`${roomLink(room.name)} stopping ${producing} — cap reached.`, 'FACTORY CONTROL:');
                return true;
            }
            if (Object.keys(commodity.components).some(r => r !== RESOURCE_ENERGY && room.store(r) < REACTION_AMOUNT * 0.1)) {
                log.i(`${roomLink(room.name)} stopping ${producing} — input running low.`, 'FACTORY CONTROL:');
                return true;
            }
            return false;
        }
        // Compressed commodity: stop if any non-energy input is running low
        if (Object.keys(commodity.components).some(r => r !== RESOURCE_ENERGY && room.store(r) < REACTION_AMOUNT * 0.5)) {
            log.i(`${roomLink(room.name)} stopping ${producing} — input running low.`, 'FACTORY CONTROL:');
            return true;
        }
        if (commodity.components[RESOURCE_ENERGY] && !room.energyState) {
            log.i(`${roomLink(room.name)} stopping ${producing} — no energy.`, 'FACTORY CONTROL:');
            return true;
        }
        return false;
    }

    decideProduction(room, factory, factoryLevel) {
        const batteryStored = room.store(RESOURCE_BATTERY);
        const batteryCost = COMMODITIES[RESOURCE_ENERGY].components[RESOURCE_BATTERY] || 50;
        const opsPaused = empireOpsPaused();

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

        if (opsPaused) return;

        // Space guard — don't manufacture if output has nowhere to go
        const totalFree = (room.storage ? room.storage.store.getFreeCapacity() : 0) +
            (room.terminal ? room.terminal.store.getFreeCapacity() : 0);
        if (totalFree < FACTORY_MIN_FREE_SPACE) return;

        // Sort by deficit so the most urgently needed resource is always chosen first.
        // This is deterministic and stable — the same resource wins every re-decision
        // until its cap is reached, preventing oscillation between commodities.
        const deficitSort = (a, b) => {
            const threshA = BASE_MINERALS.includes(a) ? REACTION_AMOUNT * 0.25 : DUMP_AMOUNT * 0.9;
            const threshB = BASE_MINERALS.includes(b) ? REACTION_AMOUNT * 0.25 : DUMP_AMOUNT * 0.9;
            return (threshB - room.store(b)) - (threshA - room.store(a));
        };

        // Try compression — highest deficit first
        for (const resource of [...COMPRESSED_COMMODITIES].filter(r => r !== RESOURCE_BATTERY).sort(deficitSort)) {
            if (this.isValidProductionTarget(resource, room, factoryLevel)) {
                this.setProduction(factory, resource, 'compressing');
                return;
            }
        }

        // Try manufactured commodities — highest deficit first
        for (const resource of [...BASE_MINERALS].sort(deficitSort)) {
            if (this.isValidProductionTarget(resource, room, factoryLevel)) {
                this.setProduction(factory, resource, 'surplus inputs');
                return;
            }
        }

        // Try assigned commodity
        if (room.energyState && room.memory.commodityProduction) {
            const assigned = room.memory.commodityProduction;
            if (this.isValidProductionTarget(assigned, room, factoryLevel)) {
                this.setProduction(factory, assigned, 'assigned commodity');
                return;
            }
            const commodity = COMMODITIES[assigned];
            if (!commodity) return;
            // Build intermediate components (factory.produce must target the component resource)
            for (const component of Object.keys(commodity.components)) {
                if (BASE_COMMODITIES.includes(component)) room.memory.neededCommodity = component;
                if (this.isValidProductionTarget(component, room, factoryLevel)) {
                    this.setProduction(factory, component, `component for ${assigned}`);
                    return;
                }
            }
        }
    }

    commodityProduction(room, factory, factoryLevel) {
        if (empireOpsPaused()) return;
        if (!room.mineral || !room.mineral.mineralType) return;
        const roomResource = room.mineral.mineralType;
        if (!room.memory.commodityProduction) {
            for (const commodity in COMMODITY_RESOURCE_TYPES) {
                const alreadyProducing = MY_ROOMS.some(name => {
                    const otherRoom = Game.rooms[name];
                    return otherRoom && otherRoom.memory.commodityProduction === commodity;
                });
                if (alreadyProducing) continue;
                if (COMMODITY_RESOURCE_TYPES[commodity] === roomResource) {
                    room.memory.commodityProduction = commodity;
                    log.a(`${roomLink(room.name)} is producing ${commodity} for tier 0.`, 'FACTORY CONTROL:');
                    return;
                }
            }
        }
    }

    isValidProductionTarget(resource, room, factoryLevel) {
        const commodity = COMMODITIES[resource];
        if (!commodity) return false;
        if (commodity.level && commodity.level !== factoryLevel) return false;

        // Validate battery↔energy conversions against their specific inputs
        if (resource === RESOURCE_ENERGY) {
            const needed = commodity.components[RESOURCE_BATTERY] || 50;
            return room.store(RESOURCE_BATTERY) >= needed;
        }
        if (resource === RESOURCE_BATTERY) {
            const needed = commodity.components[RESOURCE_ENERGY] || 600;
            return room.energyState >= 2 && room.store(RESOURCE_ENERGY, true) >= needed;
        }

        const threshold = BASE_MINERALS.includes(resource) ? REACTION_AMOUNT * 0.25 : DUMP_AMOUNT * 0.9;
        if (room.store(resource) >= threshold) return false;

        // Skip energy-consuming commodities when energy is critically low
        if (!room.energyState && commodity.components[RESOURCE_ENERGY]) return false;

        return Object.keys(commodity.components).every(component => {
            const required = commodity.components[component];
            const requiredAmount = REACTION_AMOUNT * 1.1;
            return room.store(component) >= required &&
                (!COMPRESSED_COMMODITIES.includes(resource) || room.store(component) >= requiredAmount);
        });
    }

    hasStorageSpace(room) {
        const storageFull = room.storage && room.storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1;
        const terminalFull = room.terminal && room.terminal.store.getFreeCapacity() < 10000;
        if (!room.storage) return !terminalFull;
        if (!room.terminal) return !storageFull;
        return !(storageFull && terminalFull);
    }
}

profiler.registerClass(FactoryControl, 'FactoryControl');
module.exports = FactoryControl;
