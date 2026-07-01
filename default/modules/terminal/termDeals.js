/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Arbitrage and bargain deal finding.

 */


const {canEmpireSell, getEffectiveSupply, getEmpireDemand} = require('termNetwork');
const {recordMarketEnergyCost, canAffordSend} = require('termBudget');

const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    dealFinder(terminal, globalOrders) {
        if (Game.market.credits < CREDIT_BUFFER * 2) return false;
        if (terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.2) return false;

        const energyPrice = this.getEnergyValue(globalOrders);

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

            let amount = maxAmount;
            while (amount >= 10) {
                if (terminal.store[RESOURCE_ENERGY] >= Game.market.calcTransactionCost(amount, terminal.room.name, targetRoom)) break;
                amount = Math.floor(amount * 0.75);
            }
            if (amount < 10) continue;

            let costToBuy = Game.market.calcTransactionCost(amount, terminal.room.name, lowestSell.roomName) * energyPrice;
            let costToSell = Game.market.calcTransactionCost(amount, terminal.room.name, highestBuy.roomName) * energyPrice;
            let netProfit = spread * amount - costToBuy - costToSell;

            const minArbitrageProfit = this.getCreditTrend() > 0 ? 100 : 150;
            if (netProfit <= minArbitrageProfit) continue;

            if (haveMineral && !canEmpireSell(mineral)) continue;

            if (haveMineral) {
                const sellTxCost = Game.market.calcTransactionCost(amount, terminal.room.name, highestBuy.roomName);
                if (!canAffordSend(sellTxCost)) continue;
                if (Game.market.deal(highestBuy.id, amount, terminal.room.name) === OK) {
                    recordMarketEnergyCost(terminal.room.name, sellTxCost);
                    this.recordBankerDeal('sell', mineral, amount, highestBuy.price * amount);
                    return true;
                }
            } else {
                const empireDemand = getEmpireDemand(mineral) || REACTION_AMOUNT;
                if (getEffectiveSupply(mineral) >= empireDemand) continue;

                const buyTxCost = Game.market.calcTransactionCost(amount, terminal.room.name, lowestSell.roomName);
                if (!canAffordSend(buyTxCost)) continue;
                if (Game.market.deal(lowestSell.id, amount, terminal.room.name) === OK) {
                    recordMarketEnergyCost(terminal.room.name, buyTxCost);
                    this.recordBankerDeal('buy', mineral, amount, lowestSell.price * amount);
                    return true;
                }
            }
        }

        if (this.getCreditTrend() < 0) return false;

        for (let mineral of shuffle(_.union(BASE_MINERALS, ALL_BOOSTS, ALL_COMMODITIES))) {
            const empireDemand = getEmpireDemand(mineral) || REACTION_AMOUNT;
            if (getEffectiveSupply(mineral) >= empireDemand) continue;

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
                let bestDeal = cheapSells.sort((a, b) => {
                    let costA = Game.market.calcTransactionCost(100, terminal.room.name, a.roomName) * energyPrice / 100;
                    let costB = Game.market.calcTransactionCost(100, terminal.room.name, b.roomName) * energyPrice / 100;
                    return (a.price + costA) - (b.price + costB);
                })[0];

                let buyAmount = Math.min(bestDeal.remainingAmount, 1000);
                let cost = (bestDeal.price * buyAmount);
                let transCost = Game.market.calcTransactionCost(buyAmount, terminal.room.name, bestDeal.roomName);

                if (cost < Memory._banker.spendingAccount && transCost < terminal.store[RESOURCE_ENERGY] && canAffordSend(transCost)) {
                    if (Game.market.deal(bestDeal.id, buyAmount, terminal.room.name) === OK) {
                        recordMarketEnergyCost(terminal.room.name, transCost);
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