/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Market sell orders and quick liquidation.
 */

const {getEffectiveSupply} = require('termNetwork');
const {isMarketHub} = require('termMarket');
const {recordMarketEnergyCost, canAffordSend} = require('termBudget');
const {recordTransferEnergyCost, markTerminalsUsed} = require('termTransfers');

const TerminalControl = require('termClass');

const FIRE_SALE_MIN = 100;

Object.assign(TerminalControl.prototype, {

    placeSellOrders(terminal, globalOrders, myOrders) {
        if (!isMarketHub(terminal.room.name)) return false;
        if (Game.market.credits <= 0) return false;

        for (let resource of Object.keys(terminal.store)) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) {
                if (!this.allowEnergySell(terminal)) continue;
                if (resource === RESOURCE_ENERGY && terminal.room.energyState < 3) continue;
            }

            if (this.empireLabPipelineReserve(resource) > 0) continue;
            if (MY_ROOMS.some(name => {
                const room = Game.rooms[name];
                if (!room) return false;
                if (room.memory.neededCommodity === resource) return true;
                if (room.memory.producingBoost === resource) return true;
                return (room.labs || []).some(lab =>
                    lab.memory?.itemNeeded === resource || lab.memory?.neededBoost === resource
                );
            })) continue;
            if (_.some(myOrders, o =>
                o.roomName === terminal.pos.roomName && o.type === ORDER_BUY && o.resourceType === resource
            )) continue;
            if (hasExistingSellOrder(myOrders, terminal, resource)) continue;
            if ((!SELL_BOOSTS || terminal.room.level < 8) && ALL_BOOSTS.includes(resource)) continue;

            if (COMPRESSED_COMMODITIES.includes(resource) && !this.canEmpireSell(resource)) continue;
            if (ALL_BOOSTS.includes(resource) && getEffectiveSupply(resource) < this.getEmpireKeepAmount(resource) * 1.5) continue;

            let sellAmount = this.computeSellableAmount(terminal, resource);
            if (BASE_MINERALS.includes(resource) && sellAmount < REACTION_AMOUNT * 0.5) continue;
            if (sellAmount < 100) continue;

            let price = this.calculatePrice(ORDER_SELL, resource);
            if (resource === RESOURCE_ENERGY) {
                const energyFloor = this.getEnergyValue(globalOrders) * 0.95;
                if (price < energyFloor) price = energyFloor;
            }

            let cost = price * sellAmount * 0.05;
            if (cost > Game.market.credits) {
                sellAmount = Math.floor(Game.market.credits / (price * 0.05));
            }
            if (sellAmount < 100) continue;

            if (createSellOrder(terminal, resource, price, sellAmount)) return true;
        }

        function hasExistingSellOrder(myOrders, terminal, resourceType) {
            return _.some(myOrders, (order) =>
                order.roomName === terminal.pos.roomName && order.resourceType === resourceType && order.type === ORDER_SELL
            );
        }

        function createSellOrder(terminal, resourceType, price, sellAmount) {
            if (Game.market.createOrder({
                type: ORDER_SELL,
                resourceType: resourceType,
                price: price,
                totalAmount: sellAmount,
                roomName: terminal.pos.roomName
            }) === OK) {
                log.w(`New Sell Order: ${resourceType} at/per ${price} in ${roomLink(terminal.room.name)}`, "Market: ");
                return true;
            }
            return false;
        }

        return false;
    },

    quickSell(terminal, globalOrders) {
        const MIN_QUICKSELL_PROFIT = 100;
        if (!this.isCapacityPressured(terminal.room)) return false;

        // Largest stacks first — free capacity is the goal under pressure.
        const sortedKeys = Object.keys(terminal.store).sort((a, b) =>
            (terminal.store[b] || 0) - (terminal.store[a] || 0)
        );

        const transferFactor = roomName => 1 - Math.exp(-Game.map.getRoomLinearDistance(terminal.room.name, roomName) / 30);
        const transactionCost = (amount, roomName) => Math.ceil(amount * transferFactor(roomName));
        const maxAffordable = (energy, roomName) => {
            const factor = transferFactor(roomName);
            if (factor <= 0) return energy;
            return Math.floor(energy / factor);
        };
        const isHostile = roomName => INTEL[roomName] && HOSTILES.includes(INTEL[roomName].user);

        const findBestBuyer = (resourceType, sellAmount) => {
            const orders = globalOrders.filter(o =>
                o.resourceType === resourceType && o.type === ORDER_BUY &&
                o.roomName !== terminal.pos.roomName &&
                !_.includes(MY_ROOMS, o.roomName) &&
                transactionCost(Math.min(sellAmount, o.remainingAmount), o.roomName) < terminal.store[RESOURCE_ENERGY] &&
                !isHostile(o.roomName)
            );
            if (orders.length === 0) return null;

            const energyPrice = this.getEnergyValue(globalOrders);
            const netProfit = o => {
                const amount = Math.min(sellAmount, o.remainingAmount);
                return amount * o.price - transactionCost(amount, o.roomName) * energyPrice;
            };
            const best = _.max(orders, netProfit);
            return netProfit(best) > MIN_QUICKSELL_PROFIT ? best : null;
        };

        const findAnyBuyer = (resourceType, sellAmount) => {
            const orders = globalOrders.filter(o =>
                o.resourceType === resourceType && o.type === ORDER_BUY &&
                o.roomName !== terminal.pos.roomName &&
                !_.includes(MY_ROOMS, o.roomName) &&
                !isHostile(o.roomName) &&
                o.remainingAmount >= FIRE_SALE_MIN
            );
            if (!orders.length) return null;
            return _.max(orders, 'price');
        };

        const handleSale = (buyer, sellAmount, resourceType, fireSale = false) => {
            sellAmount = Math.min(sellAmount, buyer.remainingAmount);
            if (transactionCost(sellAmount, buyer.roomName) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], buyer.roomName);
            }
            if (sellAmount < FIRE_SALE_MIN) return false;
            if (!fireSale && sellAmount * buyer.price < 5) return false;
            const txCost = Game.market.calcTransactionCost(sellAmount, terminal.pos.roomName, buyer.roomName);
            if (!canAffordSend(txCost, {emergency: true})) return false;
            if (Game.market.deal(buyer.id, sellAmount, terminal.pos.roomName) !== OK) return false;
            recordMarketEnergyCost(terminal.room.name, txCost);
            const credits = buyer.price * sellAmount;
            if (fireSale) {
                log.w(`FIRE SALE: Dumped ${sellAmount} ${resourceType} to ${roomLink(buyer.roomName)} for ${credits} credits to clear space in ${roomLink(terminal.room.name)}.`, "Market: ");
            } else {
                log.w(`${terminal.pos.roomName} Sell Off Completed - ${sellAmount} ${resourceType} for ${credits} credits in ${roomLink(terminal.room.name)}`, "Market: ");
            }
            if (Memory._banker) Memory._banker.spendingAccount += credits * 0.75;
            this.recordBankerDeal('sell', resourceType, sellAmount, credits);
            return true;
        };

        const handleAllyDump = (sellAmount, resourceType) => {
            const friendlyRooms = _.filter(MY_ROOMS, name => {
                if (name === terminal.room.name) return false;
                const room = Game.rooms[name];
                return room && room.terminal && room.controller && room.controller.level >= 6
                    && !this.isCapacityPressured(room)
                    && room.terminal.store.getFreeCapacity(resourceType) >= FIRE_SALE_MIN;
            });
            // Also consider visible ally (non-owned) rooms with free terminal space.
            for (const r of _.values(INTEL)) {
                if (!r || !r.name || !r.user || r.user === MY_USERNAME) continue;
                if (!FRIENDLIES.includes(r.user) || (r.level || 0) < 6) continue;
                const room = Game.rooms[r.name];
                if (!room || !room.terminal) continue;
                if (room.terminal.store.getFreeCapacity(resourceType) < FIRE_SALE_MIN) continue;
                friendlyRooms.push(r.name);
            }
            if (!friendlyRooms.length) return false;

            const friend = _.max(friendlyRooms, name => {
                const room = Game.rooms[name];
                return room && room.terminal ? room.terminal.store.getFreeCapacity(resourceType) : 0;
            });
            if (!friend || !Game.rooms[friend] || !Game.rooms[friend].terminal) return false;

            const destFree = Game.rooms[friend].terminal.store.getFreeCapacity(resourceType);
            sellAmount = Math.min(sellAmount, destFree, 25000);
            if (transactionCost(sellAmount, friend) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], friend);
            }
            if (sellAmount < FIRE_SALE_MIN) return false;
            const txCost = Game.market.calcTransactionCost(sellAmount, terminal.pos.roomName, friend);
            const energyCost = (resourceType === RESOURCE_ENERGY ? sellAmount : 0) + txCost;
            if (!canAffordSend(energyCost, {emergency: true})) return false;
            if (terminal.send(resourceType, sellAmount, friend) !== OK) return false;
            recordTransferEnergyCost(terminal, resourceType, sellAmount, friend);
            markTerminalsUsed(terminal.room.name, friend, resourceType);
            log.w(`Dumped ${sellAmount} ${resourceType} to ${roomLink(friend)} to clear space in ${roomLink(terminal.room.name)}.`, "Market: ");
            return true;
        };

        for (const resourceType of sortedKeys) {
            if (resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) {
                if (!this.allowEnergySell(terminal)) continue;
            }

            // Under pressure only protect THIS room's active lab/boost work, not empire soft targets.
            const dumpAmount = this.computePressureDumpAmount(terminal, resourceType);
            if (dumpAmount < FIRE_SALE_MIN) continue;

            const profitable = findBestBuyer(resourceType, dumpAmount);
            if (profitable && handleSale(profitable, dumpAmount, resourceType, false)) return true;

            const anyBuyer = findAnyBuyer(resourceType, dumpAmount);
            if (anyBuyer && handleSale(anyBuyer, dumpAmount, resourceType, true)) return true;

            if (handleAllyDump(dumpAmount, resourceType)) return true;
        }
        return false;
    }

});
