/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Arbitrage and bargain deal finding.

 */


const state = require('termState');

const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    dealFinder(terminal, globalOrders) {
        if (Game.market.credits < CREDIT_BUFFER * 2) return false;
        if (terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.2) return false; // Need space

        const energyPrice = this.getEnergyValue(globalOrders);

        // -- ARBITRAGE / SPREAD GAMING --
        // Look for risk-free profit by buying low in one room and selling high elsewhere
        for (let mineral of shuffle(_.union(BASE_MINERALS, ALL_BOOSTS, ALL_COMMODITIES))) {
            let activeBuys = globalOrders.filter(o => o.resourceType === mineral && o.type === ORDER_BUY && !_.includes(MY_ROOMS, o.roomName)).sort((a, b) => b.price - a.price);
            let activeSells = globalOrders.filter(o => o.resourceType === mineral && o.type === ORDER_SELL && !_.includes(MY_ROOMS, o.roomName)).sort((a, b) => a.price - b.price);

            if (!activeBuys.length || !activeSells.length) continue;

            let highestBuy = activeBuys[0];
            let lowestSell = activeSells[0];

            if (highestBuy.price <= lowestSell.price) continue;

            let spread = highestBuy.price - lowestSell.price;
            let maxAmount = Math.min(highestBuy.remainingAmount, lowestSell.remainingAmount, 1000, terminal.store.getFreeCapacity(mineral));
            if (maxAmount < 10) continue;

            const haveMineral = terminal.store[mineral] >= maxAmount;
            const targetRoom = haveMineral ? highestBuy.roomName : lowestSell.roomName;

            // Scale down amount until we can afford the energy for the immediate transaction
            let amount = maxAmount;
            while (amount >= 10) {
                if (terminal.store[RESOURCE_ENERGY] >= Game.market.calcTransactionCost(amount, terminal.room.name, targetRoom)) break;
                amount = Math.floor(amount * 0.75);
            }
            if (amount < 10) continue;

            // Full round-trip cost for profit check (ensures the spread justifies both legs)
            let costToBuy = Game.market.calcTransactionCost(amount, terminal.room.name, lowestSell.roomName) * energyPrice;
            let costToSell = Game.market.calcTransactionCost(amount, terminal.room.name, highestBuy.roomName) * energyPrice;
            let netProfit = spread * amount - costToBuy - costToSell;

            const minArbitrageProfit = this.getCreditTrend() > 0 ? 100 : 150;
            if (netProfit <= minArbitrageProfit) continue;

            if (haveMineral) {
                if (Game.market.deal(highestBuy.id, amount, terminal.room.name) === OK) {
                    const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, highestBuy.roomName);
                    // record hidden energy sink (arbitrage sell deal fee)
                    Memory.terminalEnergyExpense = Memory.terminalEnergyExpense || {};
                    const rn = terminal.room.name;
                    Memory.terminalEnergyExpense[rn] = (Memory.terminalEnergyExpense[rn] || 0) + txCost;
                    this.recordBankerDeal('sell', mineral, amount, highestBuy.price * amount);
                    return true;
                }
            } else if (Game.market.deal(lowestSell.id, amount, terminal.room.name) === OK) {
                const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, lowestSell.roomName);
                // record hidden energy sink (arbitrage buy deal fee)
                Memory.terminalEnergyExpense = Memory.terminalEnergyExpense || {};
                const rn = terminal.room.name;
                Memory.terminalEnergyExpense[rn] = (Memory.terminalEnergyExpense[rn] || 0) + txCost;
                this.recordBankerDeal('buy', mineral, amount, lowestSell.price * amount);
                return true;
            }
        }

        if (this.getCreditTrend() < 0) return false;

        // Look for incredibly cheap sell orders (dumpers) to buy up
        for (let mineral of shuffle(_.union(BASE_MINERALS, ALL_BOOSTS, ALL_COMMODITIES))) {
            let marketHistory = latestMarketHistory(mineral);
            if (!marketHistory.avg || marketHistory.entries < 50) continue;

            let bargainPrice = marketHistory.avg * (this.getCreditTrend() > 0 ? 0.4 : 0.5);

            let cheapSells = globalOrders.filter(order =>
                order.resourceType === mineral &&
                order.type === ORDER_SELL &&
                order.price <= bargainPrice &&
                !_.includes(MY_ROOMS, order.roomName)
            );

            if (cheapSells.length > 0) {
                // Sort by cheapest, considering transaction cost
                let bestDeal = cheapSells.sort((a, b) => {
                    let costA = Game.market.calcTransactionCost(100, terminal.room.name, a.roomName) * energyPrice / 100;
                    let costB = Game.market.calcTransactionCost(100, terminal.room.name, b.roomName) * energyPrice / 100;
                    return (a.price + costA) - (b.price + costB);
                })[0];

                let buyAmount = Math.min(bestDeal.remainingAmount, 1000); // Buy in batches
                let cost = (bestDeal.price * buyAmount);
                let transCost = Game.market.calcTransactionCost(buyAmount, terminal.room.name, bestDeal.roomName);

                if (cost < Memory._banker.spendingAccount && transCost < terminal.store[RESOURCE_ENERGY]) {
                    if (Game.market.deal(bestDeal.id, buyAmount, terminal.room.name) === OK) {
                        // record hidden energy sink (bargain buy deal fee)
                        Memory.terminalEnergyExpense = Memory.terminalEnergyExpense || {};
                        const rn = terminal.room.name;
                        Memory.terminalEnergyExpense[rn] = (Memory.terminalEnergyExpense[rn] || 0) + transCost;
                        log.w(`DEAL FINDER: Bought ${buyAmount} ${mineral} for ${cost} credits (Bargain Price: ${bestDeal.price}) in ${roomLink(terminal.room.name)}`, "Market: ");
                        Memory._banker.spendingAccount -= cost;
                        this.recordBankerDeal('buy', mineral, buyAmount, cost);
                        return true;
                    }
                }
            }
        }
        return false;
    }

});