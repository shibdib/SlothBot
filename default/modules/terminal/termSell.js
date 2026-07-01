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
    }, quickSell(terminal, globalOrders) {
        const MIN_QUICKSELL_PROFIT = 100;
        const storage = terminal.room.storage;
        const terminalPressure = terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.1;
        const storagePressure = storage && storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1;
        if (!terminalPressure && !storagePressure) return false;

        const sortedKeys = Object.keys(terminal.store).sort((a, b) => terminal.store[a] - terminal.store[b]);

        const transferFactor = roomName => 1 - Math.exp(-Game.map.getRoomLinearDistance(terminal.room.name, roomName) / 30);
        const transactionCost = (amount, roomName) => Math.ceil(amount * transferFactor(roomName));
        const maxAffordable = (energy, roomName) => Math.floor(energy / transferFactor(roomName));
        const isHostile = roomName => INTEL[roomName] && HOSTILES.includes(INTEL[roomName].user);

        const findBestBuyer = (resourceType, sellAmount) => {
            const orders = globalOrders.filter(o =>
                o.resourceType === resourceType && o.type === ORDER_BUY &&
                o.roomName !== terminal.pos.roomName &&
                transactionCost(sellAmount, o.roomName) < terminal.store[RESOURCE_ENERGY] &&
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

        const handleSale = (buyer, sellAmount, resourceType) => {
            sellAmount = Math.min(sellAmount, buyer.remainingAmount);
            if (transactionCost(sellAmount, buyer.roomName) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], buyer.roomName);
            }
            if (sellAmount * buyer.price < 5) return false;
            const txCost = Game.market.calcTransactionCost(sellAmount, terminal.pos.roomName, buyer.roomName);
            if (!canAffordSend(txCost)) return false;
            if (Game.market.deal(buyer.id, sellAmount, terminal.pos.roomName) !== OK) return false;
            recordMarketEnergyCost(terminal.room.name, txCost);
            const credits = buyer.price * sellAmount;
            log.w(`${terminal.pos.roomName} Sell Off Completed - ${sellAmount} ${resourceType} for ${credits} credits in ${roomLink(terminal.room.name)}`, "Market: ");
            if (Memory._banker) Memory._banker.spendingAccount += credits * 0.75;
            this.recordBankerDeal('sell', resourceType, sellAmount, credits);
            return true;
        };

        const handleOffload = (sellAmount, resourceType) => {
            const fireSaleBuyers = globalOrders.filter(o =>
                o.resourceType === resourceType && o.type === ORDER_BUY &&
                !_.includes(MY_ROOMS, o.roomName) && !isHostile(o.roomName)
            );
            if (fireSaleBuyers.length > 0) {
                const buyer = _.max(fireSaleBuyers, 'price');
                const amount = Math.min(sellAmount, buyer.remainingAmount);
                const fireTxCost = Game.market.calcTransactionCost(amount, terminal.pos.roomName, buyer.roomName);
                if (transactionCost(amount, buyer.roomName) < terminal.store[RESOURCE_ENERGY]
                    && canAffordSend(fireTxCost)
                    && Game.market.deal(buyer.id, amount, terminal.pos.roomName) === OK) {
                    recordMarketEnergyCost(terminal.room.name, fireTxCost);
                    log.w(`FIRE SALE: Dumped ${amount} ${resourceType} to ${roomLink(buyer.roomName)} for ${buyer.price * amount} credits to clear space.`, "Market: ");
                    return true;
                }
            }

            const friendlyRooms = _.filter(INTEL, r => r.user && FRIENDLIES.includes(r.user) && r.level >= 6
                && Game.rooms[r.name] && Game.rooms[r.name].terminal);
            if (friendlyRooms.length === 0) return false;
            const friend = _.sample(friendlyRooms).name;
            if (transactionCost(sellAmount, friend) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], friend);
            }
            if (sellAmount <= 1000) return false;
            const txCost = Game.market.calcTransactionCost(sellAmount, terminal.pos.roomName, friend);
            const energyCost = (resourceType === RESOURCE_ENERGY ? sellAmount : 0) + txCost;
            if (!canAffordSend(energyCost)) return false;
            if (terminal.send(resourceType, sellAmount, friend) !== OK) return false;
            recordTransferEnergyCost(terminal, resourceType, sellAmount, friend);
            markTerminalsUsed(terminal.room.name, friend, resourceType);
            log.w(`Dumped ${sellAmount} ${resourceType} to Ally ${roomLink(friend)} to clear space.`, "Market: ");
            return true;
        };

        for (const resourceType of sortedKeys) {
            if ((resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) && !this.allowEnergySell(terminal)) continue;

            if (this.empireLabPipelineReserve(resourceType) > 0) continue;
            if (MY_ROOMS.some(name => {
                const room = Game.rooms[name];
                if (!room) return false;
                if (room.memory.neededCommodity === resourceType) return true;
                if (room.memory.producingBoost === resourceType) return true;
                return (room.labs || []).some(lab =>
                    lab.memory?.itemNeeded === resourceType || lab.memory?.neededBoost === resourceType
                );
            })) continue;

            if (COMPRESSED_COMMODITIES.includes(resourceType) && !this.canEmpireSell(resourceType)) continue;
            if (ALL_BOOSTS.includes(resourceType) && getEffectiveSupply(resourceType) < this.getEmpireKeepAmount(resourceType) * 1.5) continue;

            const sellAmount = this.computeSellableAmount(terminal, resourceType);
            if (sellAmount < 100) continue;

            const keepAmount = this.determineKeepAmount(resourceType);

            const buyer = findBestBuyer(resourceType, sellAmount);
            if (buyer) {
                if (handleSale(buyer, sellAmount, resourceType)) return true;
            } else if (sellAmount >= keepAmount * 2) {
                if (handleOffload(sellAmount, resourceType)) return true;
            }
        }
        return false;
    }

});