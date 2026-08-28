/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const {empireOpsPaused} = require('hcReadiness');
const {energyTarget: colonyEnergyTarget} = require('module.colonyProfile');
let tickTracker = {};
let cooldownTracker = {};

const FACTORY_MIN_FREE_SPACE = 50000;
const BATTERY_FEED_STOCK = 300;
const FACTORY_BATTERY_MAX = 2500;
const TERMINAL_BATTERY_SEND_MAX = 2000;

function isUnpackMineral(resource) {
    return resource === RESOURCE_GHODIUM || BASE_MINERALS.includes(resource);
}

function unpackMinerals() {
    return [...BASE_MINERALS, RESOURCE_GHODIUM];
}

function productionCap(resource) {
    return isUnpackMineral(resource) ? REACTION_AMOUNT : DUMP_AMOUNT * 0.9;
}

function compressInputStart() {
    return REACTION_AMOUNT * 1.1;
}

function warehouseMineral(room, resource) {
    let n = 0;
    if (room.storage) n += room.storage.store[resource] || 0;
    if (room.terminal) n += room.terminal.store[resource] || 0;
    return n;
}

function compressionInputStock(room, resource) {
    let n = warehouseMineral(room, resource);
    if (room.factory) n += room.factory.store[resource] || 0;
    return n;
}

class FactoryControl {
    constructor() {
    }

    static energyTarget(room) {
        return colonyEnergyTarget(room);
    }

    static batteryBatchCost() {
        return COMMODITIES[RESOURCE_ENERGY]?.components[RESOURCE_BATTERY] || 50;
    }

    static batteryPackCost() {
        return COMMODITIES[RESOURCE_BATTERY]?.components[RESOURCE_ENERGY] || 600;
    }

    static needsBatteryUnpack(room) {
        const batteryCost = FactoryControl.batteryBatchCost();
        if (room.store(RESOURCE_BATTERY) < batteryCost) return false;
        const target = FactoryControl.energyTarget(room);
        const unpackThreshold = Math.min(10000, target * 0.1);
        return room.rawEnergy < unpackThreshold;
    }

    static batteryUnpackRecovered(room) {
        return room.rawEnergy >= FactoryControl.energyTarget(room) * 0.25;
    }

    static shouldContinueBatteryUnpack(room) {
        if (room.store(RESOURCE_BATTERY) < FactoryControl.batteryBatchCost()) return false;
        return !FactoryControl.batteryUnpackRecovered(room);
    }

    static canExportEnergy(room) {
        if (!room.terminal) return false;
        const terminal = room.terminal;
        const surplus = terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER;
        if (surplus < 5000) return false;
        return MY_ROOMS.some(name => {
            if (name === room.name) return false;
            const dest = Game.rooms[name];
            if (!dest?.terminal) return false;
            if (!FactoryControl.needsBatteryUnpack(dest) && dest.energyState >= 2) return false;
            const amount = Math.min(surplus, 10000);
            return Game.market.calcTransactionCost(amount, room.name, name) < amount * 0.25;
        });
    }

    static hasEnergyStoragePressure(room) {
        if (room.storage && room.storage.store.getFreeCapacity(RESOURCE_ENERGY) < STORAGE_CAPACITY * 0.15) return true;
        const storageFull = room.storage && room.storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1;
        const terminalFull = room.terminal && room.terminal.store.getFreeCapacity() < 10000;
        if (!room.storage) return terminalFull;
        if (!room.terminal) return storageFull;
        return storageFull && terminalFull;
    }

    static rawEnergyMeetsPackThreshold(room) {
        return room.rawEnergy >= FactoryControl.energyTarget(room) * 1.2;
    }

    static hasEnergyPackSurplus(room) {
        const target = FactoryControl.energyTarget(room);
        return room.rawEnergy >= target * 1.25;
    }

    static terminalHasExportableEnergy(room) {
        if (!room.terminal) return false;
        return (room.terminal.store[RESOURCE_ENERGY] || 0) - TERMINAL_ENERGY_BUFFER >= 5000;
    }

    static shouldPackBatteries(room) {
        const packCost = FactoryControl.batteryPackCost();
        if (!FactoryControl.rawEnergyMeetsPackThreshold(room)) return false;
        if (room.rawEnergy < packCost) return false;

        if (FactoryControl.hasEnergyPackSurplus(room)) return true;

        if (!FactoryControl.hasEnergyStoragePressure(room)) return false;

        // Near-full storage: try terminal first only when it already holds exportable energy.
        if (FactoryControl.canExportEnergy(room) && FactoryControl.terminalHasExportableEnergy(room)) {
            return false;
        }
        return true;
    }

    static factoryNeedsBatteryFeed(room, factory) {
        if (!factory) return false;
        try {
            if (!factory.isActive()) return false;
        } catch (e) {
            return false;
        }
        if (!FactoryControl.needsBatteryUnpack(room)) return false;
        return (factory.store[RESOURCE_BATTERY] || 0) < BATTERY_FEED_STOCK;
    }

    static factoryBatteryInboundNeed(room) {
        if (!room?.terminal || !FactoryControl.shouldContinueBatteryUnpack(room)) return 0;
        let need = 0;
        const factory = room.factory;
        if (factory) {
            try {
                if (factory.isActive()) {
                    need = Math.max(need, FACTORY_BATTERY_MAX - (factory.store[RESOURCE_BATTERY] || 0));
                }
            } catch (e) {
            }
        }
        const terminalBats = room.terminal.store[RESOURCE_BATTERY] || 0;
        need = Math.max(need, BATTERY_FEED_STOCK - terminalBats);
        return Math.max(0, need);
    }

    static roomNeedsBatteryInbound(room) {
        return FactoryControl.factoryBatteryInboundNeed(room) >= FactoryControl.batteryBatchCost();
    }

    static terminalBatterySendAmount(surplus, terminalFreeCapacity) {
        const free = terminalFreeCapacity || TERMINAL_BATTERY_SEND_MAX;
        return Math.min(surplus, TERMINAL_BATTERY_SEND_MAX, free);
    }

    _factoryIsActive(factory) {
        try {
            return factory.isActive();
        } catch (e) {
            return false;
        }
    }

    _factoryHasOutputSpace(factory, resource) {
        const commodity = COMMODITIES[resource];
        if (!commodity) return false;
        const outputAmount = commodity.amount || 1;
        return factory.store.getFreeCapacity(resource) >= outputAmount;
    }

    run(room) {
        const factory = room.factory;
        if (!factory || !this._factoryIsActive(factory) || room.nukes.length) return;

        const currentTime = Game.time;
        const factoryLevel = factory.level || 0;

        if (currentTime % 1000 === 0) this._pruneTrackers();

        // Render production label every tick so it stays visible during cooldown
        if (factory.memory.producing && Game.time % 5 === 0 && (!Game.cpu || Game.cpu.bucket >= 5000)) {
            const commodity = COMMODITIES[factory.memory.producing];
            const inputsReady = commodity && Object.keys(commodity.components).every(c => (factory.store[c] || 0) >= commodity.components[c]);
            let status, color;
            if (factory.cooldown) {
                status = `⚙ ${factory.memory.producing} (${factory.cooldown})`;
                color = '#00ff00';
            } else if (inputsReady) {
                status = `⚙ ${factory.memory.producing}`;
                color = '#ffff00';
            } else {
                status = `⏳ ${factory.memory.producing}`;
                color = '#ff8800';
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

        // Continue uses shouldStop only. isValidProductionTarget is the start gate;
        // applying its stockpile cap here would abort unpack at 25% of keep.
        if (factory.memory.producing) {
            if (this.shouldStopProduction(room, factory)) {
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

        // Produce if still selected. Do not re-apply isValid start caps here.
        if (factory.memory.producing) {
            const commodity = COMMODITIES[factory.memory.producing];
            if (!commodity) {
                this.clearProduction(factory);
            } else if (!Object.keys(commodity.components).every(c => (factory.store[c] || 0) >= commodity.components[c])) {
                cooldownTracker[room.name] = 3;
                return;
            } else if (!this._factoryHasOutputSpace(factory, factory.memory.producing)) {
                cooldownTracker[room.name] = 3;
                return;
            } else {
                const result = factory.produce(factory.memory.producing);
                if (result === OK) {
                    cooldownTracker[room.name] = commodity.cooldown + 1;
                    if (commodity.components && commodity.components[RESOURCE_ENERGY]) {
                        const amt = commodity.components[RESOURCE_ENERGY];
                        Memory.factoryEnergyExpense = Memory.factoryEnergyExpense || {};
                        const rn = room.name;
                        Memory.factoryEnergyExpense[rn] = (Memory.factoryEnergyExpense[rn] || 0) + amt;
                    }
                } else {
                    log.w(`${roomLink(room.name)} factory produce() failed for ${factory.memory.producing} (${result}), re-evaluating.`, 'FACTORY CONTROL:');
                    this.clearProduction(factory);
                    cooldownTracker[room.name] = 10;
                }
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

        if (commodity.level && commodity.level !== (factory.level || 0)) {
            log.i(`${roomLink(room.name)} stopping ${producing} — factory level mismatch.`, 'FACTORY CONTROL:');
            return true;
        }

        if (producing === RESOURCE_BATTERY && !FactoryControl.shouldPackBatteries(room)) {
            log.i(`${roomLink(room.name)} stopping battery production — pack no longer needed.`, 'FACTORY CONTROL:');
            return true;
        }
        if (producing === RESOURCE_ENERGY) {
            if (FactoryControl.batteryUnpackRecovered(room)) {
                log.i(`${roomLink(room.name)} stopping battery→energy — usable energy restored.`, 'FACTORY CONTROL:');
                return true;
            }
            if (batteryStored < batteryCost) {
                log.i(`${roomLink(room.name)} stopping battery→energy — batteries exhausted.`, 'FACTORY CONTROL:');
                return true;
            }
            return false;
        }

        if (room.store(producing) >= productionCap(producing)) {
            log.i(`${roomLink(room.name)} stopping ${producing} — cap reached.`, 'FACTORY CONTROL:');
            return true;
        }
        if (commodity.components[RESOURCE_ENERGY] && !room.energyState) {
            log.i(`${roomLink(room.name)} stopping ${producing} — no energy.`, 'FACTORY CONTROL:');
            return true;
        }

        const compressing = COMPRESSED_COMMODITIES.includes(producing);
        const inputFloor = compressing ? REACTION_AMOUNT : 0;
        if (Object.keys(commodity.components).some(r => {
            if (r === RESOURCE_ENERGY) return false;
            const have = compressing ? compressionInputStock(room, r) : (room.store(r) || 0);
            const recipe = commodity.components[r] || 0;
            if (have < recipe) return true;
            return inputFloor && have < inputFloor + recipe;
        })) {
            log.i(`${roomLink(room.name)} stopping ${producing} — input running low.`, 'FACTORY CONTROL:');
            return true;
        }
        return false;
    }

    decideProduction(room, factory, factoryLevel) {
        const opsPaused = empireOpsPaused();

        // Unpack until usable energy recovers (25% target); start threshold is 10% via shouldContinue
        if (FactoryControl.shouldContinueBatteryUnpack(room)) {
            this.setProduction(factory, RESOURCE_ENERGY, 'low usable energy');
            return;
        }

        // Pack when energy is overflowing locally and cannot be sent elsewhere
        if (FactoryControl.shouldPackBatteries(room)) {
            this.setProduction(factory, RESOURCE_BATTERY, 'energy overflow');
            return;
        }

        if (opsPaused) return;

        const totalFree = (room.storage ? room.storage.store.getFreeCapacity() : 0) +
            (room.terminal ? room.terminal.store.getFreeCapacity() : 0);
        const spaceTight = totalFree < FACTORY_MIN_FREE_SPACE;

        // Highest deficit first. Unpack uses keep (REACTION_AMOUNT); bars use dump cap.
        const deficitSort = (a, b) => {
            return (productionCap(b) - room.store(b)) - (productionCap(a) - room.store(a));
        };

        // Unpack needed minerals even when warehouses are tight — labs need the mineral.
        for (const resource of unpackMinerals().sort(deficitSort)) {
            if (this.isValidProductionTarget(resource, room, factoryLevel)) {
                this.setProduction(factory, resource, 'decompressing');
                return;
            }
        }

        // Compression frees space; still run it when storage is tight.
        for (const resource of [...COMPRESSED_COMMODITIES].filter(r => r !== RESOURCE_BATTERY).sort(deficitSort)) {
            if (this.isValidProductionTarget(resource, room, factoryLevel)) {
                this.setProduction(factory, resource, 'compressing');
                return;
            }
        }

        if (spaceTight) return;

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
                if (!this.isValidProductionTarget(component, room, factoryLevel)) continue;
                if (BASE_COMMODITIES.includes(component)) room.memory.neededCommodity = component;
                this.setProduction(factory, component, `component for ${assigned}`);
                return;
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
                    if (name === room.name) return false;
                    const otherRoom = Game.rooms[name];
                    if (!otherRoom || otherRoom.memory.commodityProduction !== commodity) return false;
                    const otherFactory = otherRoom.factory;
                    return otherFactory && this._factoryIsActive(otherFactory);
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
            return FactoryControl.shouldContinueBatteryUnpack(room);
        }
        if (resource === RESOURCE_BATTERY) {
            const needed = FactoryControl.batteryPackCost();
            return FactoryControl.shouldPackBatteries(room) && room.rawEnergy >= needed;
        }

        if (room.store(resource) >= productionCap(resource)) return false;

        // Skip energy-consuming commodities when energy is critically low
        if (!room.energyState && commodity.components[RESOURCE_ENERGY]) return false;

        return Object.keys(commodity.components).every(component => {
            const required = commodity.components[component];
            const compressing = COMPRESSED_COMMODITIES.includes(resource) && component !== RESOURCE_ENERGY;
            const stock = compressing ? compressionInputStock(room, component) : (room.store(component) || 0);
            if (stock < required) return false;
            if (!compressing) return true;
            return stock >= compressInputStart();
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
FactoryControl.BATTERY_FEED_STOCK = BATTERY_FEED_STOCK;
FactoryControl.FACTORY_BATTERY_MAX = FACTORY_BATTERY_MAX;
FactoryControl.TERMINAL_BATTERY_SEND_MAX = TERMINAL_BATTERY_SEND_MAX;
FactoryControl.warehouseMineral = warehouseMineral;
FactoryControl.compressionWarehouseSpare = function (room, resource) {
    return Math.max(0, warehouseMineral(room, resource) - REACTION_AMOUNT);
};
module.exports = FactoryControl;
