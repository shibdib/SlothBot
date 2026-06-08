/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Market sell orders and quick liquidation.

 */


const state = require('termState');

const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    placeSellOrders(terminal, globalOrders, myOrders) {
        if (Game.market.credits <= 0) return false;

        for (let resource of Object.keys(terminal.store)) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) {
                if (!this.allowEnergySell(terminal)) continue;
                if (resource === RESOURCE_ENERGY && terminal.room.energyState < 3) continue;
            }

            if (MY_ROOMS.some(name => Game.rooms[name].memory.neededCommodity === resource)) continue;
            if (hasExistingSellOrder(myOrders, terminal, resource)) continue;
            if ((!SELL_BOOSTS || terminal.room.level < 8) && ALL_BOOSTS.includes(resource)) continue;

            if (ALL_BOOSTS.includes(resource) && getResourceTotal(resource) < this.getEmpireKeepAmount(resource) * 1.5) continue;

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
        const storageSpace = terminal.room.storage ? terminal.room.storage.store.getFreeCapacity() : 0;
        const spareSpace = terminal.store.getFreeCapacity() + storageSpace;
        const dynamicBuffer = Math.max(CREDIT_BUFFER, Game.market.credits * 0.20);
        const spendingAccount = Memory._banker.spendingAccount || 0;
        const creditTrend = this.getCreditTrend();
        if (spareSpace > STORAGE_CAPACITY * 0.2 && spendingAccount > dynamicBuffer && creditTrend <= 0) return false;

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
            return netProfit(best) > 0 ? best : null;
        };

        const handleSale = (buyer, sellAmount, resourceType) => {
            sellAmount = Math.min(sellAmount, buyer.remainingAmount);
            if (transactionCost(sellAmount, buyer.roomName) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], buyer.roomName);
            }
            if (sellAmount * buyer.price < 5) return false;
            if (Game.market.deal(buyer.id, sellAmount, terminal.pos.roomName) !== OK) return false;
            const credits = buyer.price * sellAmount;
            log.w(`${terminal.pos.roomName} Sell Off Completed - ${sellAmount} ${resourceType} for ${credits} credits in ${roomLink(terminal.room.name)}`, "Market: ");
            Memory._banker.spendingAccount += credits * 0.75;
            this.recordBankerDeal('sell', resourceType, sellAmount, credits);
            return true;
        };

        const handleOffload = (sellAmount, resourceType) => {
            // Fire sale: sell to highest bidder, ignoring price floors
            const fireSaleBuyers = globalOrders.filter(o =>
                o.resourceType === resourceType && o.type === ORDER_BUY &&
                !_.includes(MY_ROOMS, o.roomName) && !isHostile(o.roomName)
            );
            if (fireSaleBuyers.length > 0) {
                const buyer = _.max(fireSaleBuyers, 'price');
                const amount = Math.min(sellAmount, buyer.remainingAmount);
                if (transactionCost(amount, buyer.roomName) < terminal.store[RESOURCE_ENERGY]
                    && Game.market.deal(buyer.id, amount, terminal.pos.roomName) === OK) {
                    log.w(`FIRE SALE: Dumped ${amount} ${resourceType} to ${roomLink(buyer.roomName)} for ${buyer.price * amount} credits to clear space.`, "Market: ");
                    return true;
                }
            }

            // Dump to a friendly ally
            const friendlyRooms = _.filter(INTEL, r => r.user && FRIENDLIES.includes(r.user) && r.level >= 6
                && Game.rooms[r.name] && Game.rooms[r.name].terminal);
            if (friendlyRooms.length === 0) return false;
            const friend = _.sample(friendlyRooms).name;
            if (transactionCost(sellAmount, friend) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], friend);
            }
            if (sellAmount <= 1000) return false;
            if (terminal.send(resourceType, sellAmount, friend) !== OK) return false;
            log.w(`Dumped ${sellAmount} ${resourceType} to Ally ${roomLink(friend)} to clear space.`, "Market: ");
            return true;
        };

        for (const resourceType of sortedKeys) {
            if ((resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) && !this.allowEnergySell(terminal)) continue;

            // Don't sell base minerals if any room is short, or unless we have a large surplus
            if (ALL_BOOSTS.includes(resourceType) && getResourceTotal(resourceType) < this.getEmpireKeepAmount(resourceType) * 1.5) continue;

            const sellAmount = this.computeSellableAmount(terminal, resourceType);
            if (sellAmount < 100) continue;

            const keepAmount = this.determineKeepAmount(resourceType);

            const buyer = findBestBuyer(resourceType, sellAmount);
            if (buyer) {
                if (handleSale(buyer, sellAmount, resourceType)) return true;
            } else if (terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.1 && sellAmount >= keepAmount * 2) {
                if (handleOffload(sellAmount, resourceType)) return true;
            }
        }
        return false;
    }

});