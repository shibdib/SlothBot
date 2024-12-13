/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
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
        const coolDown = cooldownTracker[room.name] || 0;

        if (lastRun + coolDown > currentTime) return;
        tickTracker[room.name] = currentTime;

        if (factory.cooldown) {
            cooldownTracker[room.name] = factory.cooldown + 1;
            return;
        }

        const energyStored = room.store(RESOURCE_ENERGY, true);
        const factoryLevel = factory.level || (factory.effects && factory.effects.length ? 1 : 0);

        // Prioritize battery conversion to energy if needed
        if (energyStored < STORAGE_CAPACITY * 0.1 && room.store(RESOURCE_BATTERY) >= 50) {
            this.setProduction(factory, RESOURCE_ENERGY, 'Converting Battery to Energy');
            return;
        }

        // Stop current production if conditions are met
        if (factory.memory.producing && this.shouldStopProduction(room, factory, energyStored)) {
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
                cooldownTracker[room.name] = COMMODITIES[factory.memory.producing].cooldown * 0.5;
            }
        } else if (factory.memory.producing) {
            log.a('Clearing invalid production target ' + factory.memory.producing + ' in ' + roomLink(room.name), 'FACTORY CONTROL:');
            delete factory.memory.producing;
        }
    }

    setProduction(factory, resource, logMessage) {
        factory.memory.producing = resource;
        log.a(logMessage + ' in ' + roomLink(factory.room.name), 'FACTORY CONTROL:');
    }

    shouldStopProduction(room, factory, energyStored) {
        const producing = factory.memory.producing;
        const commodity = COMMODITIES[producing];
        const batteryStored = room.store(RESOURCE_BATTERY);

        // Stop producing batteries if energy is too low
        if (producing === RESOURCE_BATTERY && energyStored < STORAGE_CAPACITY * 0.1) return true;

        // Stop producing energy if we have enough energy or if we've used up batteries
        if (producing === RESOURCE_ENERGY) {
            return (energyStored > STORAGE_CAPACITY * 0.11 || batteryStored < 50);
        }

        // Stop if we have enough of the commodity (adjusted for different resource types)
        if (producing !== RESOURCE_ENERGY && producing !== RESOURCE_BATTERY) {
            let productionThreshold = BASE_MINERALS.includes(producing) ? REACTION_AMOUNT * 0.25 : DUMP_AMOUNT * 0.9;
            if (room.store(producing) >= productionThreshold) return true;
        }

        // Stop if we lack components for compressed commodities
        if (COMPRESSED_COMMODITIES.includes(producing) &&
            Object.keys(commodity.components).some(resource =>
                resource !== RESOURCE_ENERGY && room.store(resource) < REACTION_AMOUNT * 0.5
            )) return true;

        // Stop if we need energy for production but don't have it
        if (commodity.components[RESOURCE_ENERGY] && !room.energyState) return true;

        return false;
    }

    decideProduction(room, factory, energyStored, factoryLevel) {
        const batteryStored = room.store(RESOURCE_BATTERY);

        // Priority: Convert batteries to energy if energy is low but batteries are available
        if (energyStored < STORAGE_CAPACITY * 0.1 && batteryStored >= 50) {
            this.setProduction(factory, RESOURCE_ENERGY, 'Converting Battery to Energy');
            return;
        }

        // Produce Battery if there's excess energy
        if (energyStored > STORAGE_CAPACITY * 0.5) {
            this.setProduction(factory, RESOURCE_BATTERY, 'Producing Battery');
            return;
        }

        let resources = shuffle([...BASE_MINERALS, ...ALL_COMMODITIES]);
        for (let resource of resources) {
            if (this.isValidProductionTarget(resource, room, factoryLevel)) {
                this.setProduction(factory, resource, 'Producing ' + resource);
                return;
            }
        }
    }

    isValidProductionTarget(resource, room, factoryLevel) {
        const commodity = COMMODITIES[resource];
        if (!commodity) return false; // Commodity doesn't exist
        if (commodity.level && commodity.level !== factoryLevel) return false; // Factory level mismatch

        // Check if we should produce based on current storage levels
        let productionThreshold = BASE_MINERALS.includes(resource) ? REACTION_AMOUNT * 0.25 : DUMP_AMOUNT * 0.9;
        // Adjust thresholds for certain commodities, like batteries or energy
        if (resource === RESOURCE_BATTERY) productionThreshold = STORAGE_CAPACITY * 0.1;
        if (resource === RESOURCE_ENERGY) productionThreshold = STORAGE_CAPACITY * 0.11;  // Assuming this is the threshold to stop producing energy

        if (room.store(resource) >= productionThreshold) return false; // Already have enough

        // Ensure all components are available in sufficient quantity
        return Object.keys(commodity.components).every(component => {
            let requiredAmount = commodity.components[component];
            // Special handling for energy component if producing energy from batteries
            if (resource === RESOURCE_ENERGY && component === RESOURCE_BATTERY) {
                requiredAmount = 50; // Assuming 50 batteries are needed to produce energy
            }
            return room.store(component) >= requiredAmount &&
                (!COMPRESSED_COMMODITIES.includes(resource) || room.store(component) >= REACTION_AMOUNT * 1.1);
        });
    }
}

module.exports = FactoryControl;