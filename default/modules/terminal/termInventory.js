/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Keep amounts and sellable surplus calculations.

 */


const {getRoomKeepAmount} = require('termKeep');
const {
    canEmpireSell: empireCanSell,
    getEffectiveSupply,
    getEmpireDemand,
    compressedSellableUnits,
} = require('termNetwork');


const TerminalControl = require('termClass');

Object.assign(TerminalControl.prototype, {

    getEmpireKeepAmount(resource) {
        const ledgerDemand = getEmpireDemand(resource);
        if (ledgerDemand) return ledgerDemand;

        if (ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource)) {
            let need = 0;
            for (const name of MY_ROOMS) {
                const room = Game.rooms[name];
                if (!room) continue;
                if (room.memory.neededCommodity === resource) need += REACTION_AMOUNT;
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
    },

    empireLabPipelineReserve(resource) {
        let reserve = 0;
        for (const name of MY_ROOMS) {
            const room = Game.rooms[name];
            if (!room) continue;
            if (room.memory.producingBoost === resource) {
                reserve += Math.max(0, BOOST_AMOUNT(room, resource) - room.store(resource));
            }
            for (const lab of room.labs || []) {
                if (lab.memory?.itemNeeded === resource) {
                    reserve += Math.max(0, REACTION_AMOUNT - (lab.store[resource] || 0));
                }
                if (lab.memory?.neededBoost === resource) {
                    const amt = lab.memory.amount || BOOST_AMOUNT(room, resource);
                    reserve += Math.max(0, amt - (lab.store[resource] || 0));
                }
            }
        }
        return reserve;
    },

    computeSellableAmount(terminal, resource) {
        const inTerminal = terminal.store[resource] || 0;
        if (!inTerminal) return 0;
        if (!empireCanSell(resource)) return 0;

        if (COMPRESSED_COMMODITIES.includes(resource)) {
            return compressedSellableUnits(resource, inTerminal);
        }

        const empireKeep = this.getEmpireKeepAmount(resource);
        const pipeline = this.empireLabPipelineReserve(resource);
        const total = getEffectiveSupply(resource);
        const surplus = Math.max(0, total - empireKeep - pipeline);
        return Math.min(inTerminal, surplus);
    },

    /**
     * Amount safe to dump when storage/terminal are under capacity pressure.
     * Uses room-level surplus (not empire keep) so a non-hub can clear local piles
     * like hundreds of thousands of UH even if empire stock looks "under target".
     */
    computePressureDumpAmount(terminal, resource) {
        const inTerminal = terminal.store[resource] || 0;
        if (!inTerminal) return 0;
        if (resource === RESOURCE_OPS || resource === RESOURCE_POWER) return 0;

        const room = terminal.room;
        let protect = getRoomKeepAmount(room, resource) || 0;
        for (const lab of room.labs || []) {
            if (lab.memory?.itemNeeded === resource) {
                protect = Math.max(protect, REACTION_AMOUNT);
            }
            if (lab.memory?.neededBoost === resource) {
                const amt = lab.memory.amount || BOOST_AMOUNT(room, resource);
                protect = Math.max(protect, amt);
            }
        }
        if (room.memory.producingBoost === resource) {
            protect = Math.max(protect, BOOST_AMOUNT(room, resource));
        }
        if (room.memory.neededCommodity === resource) {
            protect = Math.max(protect, REACTION_AMOUNT);
        }

        const roomTotal = room.store(resource) || 0;
        // Always leave a small local floor; dump the rest of what is already in the terminal.
        const roomSurplus = Math.max(0, roomTotal - protect);
        if (roomSurplus < 100) return 0;
        // Prefer dumping terminal stock first; leave at least `protect` in the room overall
        // by not emptying terminal below max(0, protect - (roomTotal - inTerminal)).
        const outsideTerminal = Math.max(0, roomTotal - inTerminal);
        const terminalFloor = Math.max(0, protect - outsideTerminal);
        return Math.max(0, Math.min(inTerminal - terminalFloor, roomSurplus, inTerminal));
    },

    isCapacityPressured(room) {
        const terminal = room && room.terminal;
        if (!terminal) return false;
        if (terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.15) return true;
        const storage = room.storage;
        return !!(storage && storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1);
    },

    canEmpireSell(resource) {
        return empireCanSell(resource);
    }, canSellSurplusEnergy(terminal) {
        if (terminal.room.level < 8 || terminal.room.energyState < 3) return false;
        if (terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER + 5000) return false;
        return !_.find(MY_ROOMS, r => {
            const room = Game.rooms[r];
            return room && room.terminal && room.energyState < 2;
        });
    }, allowEnergySell(terminal) {
        if (this.isCapacityPressured(terminal.room)
            && (terminal.store[RESOURCE_ENERGY] || 0) > TERMINAL_ENERGY_BUFFER + 10000) {
            return true;
        }
        if (SELL_ENERGY) {
            return terminal.room.level >= 8 && terminal.room.energyState >= 2
                && !_.find(MY_ROOMS, r => {
                    const room = Game.rooms[r];
                    return room && room.terminal && !room.energyState;
                });
        }
        return this.canSellSurplusEnergy(terminal);
    }, determineKeepAmount(resource) {
        return getRoomKeepAmount(this.room, resource);
    }

});

module.exports.getRoomKeepAmount = getRoomKeepAmount;