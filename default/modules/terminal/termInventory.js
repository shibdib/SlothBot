/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Keep amounts and sellable surplus calculations.

 */


const {getRoomKeepAmount, getPressureProtectAmount} = require('termKeep');
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
     * When storage itself is critically full, generic keep floors are dropped so
     * the terminal can evacuate and take the warehouse pile (e.g. 776k K).
     */
    computePressureDumpAmount(terminal, resource) {
        const inTerminal = terminal.store[resource] || 0;
        if (!inTerminal) return 0;

        const protect = getPressureProtectAmount(terminal.room, resource);
        if (!isFinite(protect)) return 0;

        const roomTotal = terminal.room.store(resource) || 0;
        const roomSurplus = Math.max(0, roomTotal - protect);
        if (roomSurplus < 100) return 0;
        const outsideTerminal = Math.max(0, roomTotal - inTerminal);
        const terminalFloor = Math.max(0, protect - outsideTerminal);
        return Math.max(0, Math.min(inTerminal - terminalFloor, roomSurplus, inTerminal));
    },

    /**
     * Bulk overstock only. Storage is the primary warehouse; terminal is a distribution
     * buffer. Terminal-only congestion with free storage is a labTech rebalance
     * (terminal → storage), not an empire pressure dump / fire-sale.
     */
    isCapacityPressured(room) {
        if (!room) return false;
        const storage = room.storage;
        if (storage) {
            return storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1;
        }
        // No storage: terminal is the only bulk store.
        const terminal = room.terminal;
        if (!terminal) return false;
        return terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.15;
    },

    /**
     * True when another owned room can accept energy (free terminal space, not pressured).
     * Market energy dumps must never run while this is true.
     */
    empireCanReceiveEnergy(excludeRoomName, minFree = 100) {
        return !!_.find(MY_ROOMS, name => {
            if (name === excludeRoomName) return false;
            const room = Game.rooms[name];
            if (!room?.terminal || !room.controller || room.controller.level < 6) return false;
            if (this.isCapacityPressured(room)) return false;
            return room.terminal.store.getFreeCapacity(RESOURCE_ENERGY) >= minFree;
        });
    },

    canEmpireSell(resource) {
        return empireCanSell(resource);
    }, canSellSurplusEnergy(terminal) {
        if (terminal.room.level < 8 || terminal.room.energyState < 3) return false;
        if (terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER + 5000) return false;
        if (this.empireCanReceiveEnergy(terminal.room.name)) return false;
        return !_.find(MY_ROOMS, r => {
            const room = Game.rooms[r];
            return room && room.terminal && room.energyState < 2;
        });
    }, allowEnergySell(terminal) {
        // Never market-sell energy while any owned room can still take it.
        if (this.empireCanReceiveEnergy(terminal.room.name)) return false;

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