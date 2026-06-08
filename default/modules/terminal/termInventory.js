/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Keep amounts and sellable surplus calculations.

 */


const state = require('termState');

const {getDerivedCommodityAmount} = require('termCache');


const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    getEmpireKeepAmount(resource) {
        if (ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource)) {
            let need = 0;
            for (const name of MY_ROOMS) {
                const room = Game.rooms[name];
                if (!room) continue;
                if (room.memory.neededCommodity === resource) need += REACTION_AMOUNT;
                if (state.needsCommodities[name] === resource) need += REACTION_AMOUNT;
                if (room.memory.commodityProduction) {
                    const comm = COMMODITIES[room.memory.commodityProduction];
                    if (comm && comm.components && comm.components[resource]) need += REACTION_AMOUNT;
                }
            }
            return need;
        }
        if (ALL_BOOSTS.includes(resource)) {
            let total = 0;
            for (const name of MY_ROOMS) {
                const room = Game.rooms[name];
                if (room) total += BOOST_AMOUNT(room, resource);
            }
            return total;
        }
        if (BASE_MINERALS.includes(resource)) {
            return REACTION_AMOUNT * MY_ROOMS.filter(r => Game.rooms[r] && Game.rooms[r].terminal).length;
        }
        return this.determineKeepAmount(resource);
    }

    computeSellableAmount(terminal, resource) {
        const inTerminal = terminal.store[resource] || 0;
        if (!inTerminal) return 0;
        const empireKeep = this.getEmpireKeepAmount(resource);
        const surplus = Math.max(0, getResourceTotal(resource) - empireKeep);
        return Math.min(inTerminal, surplus);
    }

    canSellSurplusEnergy(terminal) {
        if (terminal.room.level < 8 || terminal.room.energyState < 3) return false;
        if (terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER + 5000) return false;
        return !_.find(MY_ROOMS, r => {
            const room = Game.rooms[r];
            return room && room.terminal && room.energyState < 2;
        });
    }

    allowEnergySell(terminal) {
        if (SELL_ENERGY) {
            return terminal.room.level >= 8 && terminal.room.energyState >= 2
                && !_.find(MY_ROOMS, r => Game.rooms[r].terminal && !Game.rooms[r].energyState);
        }
        return this.canSellSurplusEnergy(terminal);
    }

    determineKeepAmount(resource) {
        // Dynamically determine keepAmount based on resource type
        if (resource === RESOURCE_OPS || resource === RESOURCE_POWER) {
            return 0;
        }
        if (ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource)) {
            if (this.room.memory.neededCommodity === resource) return REACTION_AMOUNT;
            if (state.needsCommodities[this.room.name] === resource) return REACTION_AMOUNT;
            if (this.room.memory.commodityProduction) {
                const comm = COMMODITIES[this.room.memory.commodityProduction];
                if (comm && comm.components && comm.components[resource]) return REACTION_AMOUNT;
            }
            return 0;
        }
        if (ALL_BOOSTS.includes(resource)) return BOOST_AMOUNT(this.room, resource);
        if (resource === RESOURCE_BATTERY) return 1000;
        if (this.room.commodityProduction && this.room.mineral.mineralType === resource) return REACTION_AMOUNT * 2;
        if (BASE_MINERALS.includes(resource)) return REACTION_AMOUNT;
        if (COMPRESSED_COMMODITIES.includes(resource)) return 1000;
        if (resource === RESOURCE_GHODIUM) return BOOST_AMOUNT(this.room, resource);
        return REACTION_AMOUNT; // Default reaction amount
    }

});