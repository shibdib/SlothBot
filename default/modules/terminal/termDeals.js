/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Arbitrage and bargain deal finding.

 */


const {canEmpireSell} = require('termNetwork');
const {
    recordMarketEnergyCost,
    canAffordSend,
    getCreditFloor,
    canAffordCredits,
    recordCreditSpend
} = require('termBudget');
const {shouldProcureResource, isCompressedBar, barPriceBeatsRaw} = require('termMarket');

const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    dealFinder(terminal, globalOrders) {
        if (terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.2) return false;

        const energyPrice = this.getEnergyValue(globalOrders);

        for (let mineral of shuffle(_.union(BASE_MINERALS, ALL_BOOSTS, ALL_COMMODITIES))) {
            if (!(terminal.store[mineral] > 0) || !canEmpireSell(mineral)) continue;

            let activeBuys = globalOrders.filter(o => o.resourceType === mineral && o.type === ORDER_BUY && !_.includes(MY_ROOMS, o.roomName)).sort((a, b) => b.price - a.price);
            let activeSells = globalOrders.filter(o => o.resourceType === mineral && o.type === ORDER_SELL && !_.includes(MY_ROOMS, o.roomName)).sort((a, b) => a.price - b.price);

            if (!activeBuys.length || !activeSells.length) continue;

            let highestBuy = activeBuys[0];
            let lowestSell = activeSells[0];

            if (highestBuy.price <= lowestSell.price) continue;

            let spread = highestBuy.price - lowestSell.price;
            let maxAmount = Math.min(highestBuy.remainingAmount, terminal.store[mineral], 1000);
            if (maxAmount < 10) continue;

            let amount = maxAmount;
            while (amount >= 10) {
                if (terminal.store[RESOURCE_ENERGY] >= Game.market.calcTransactionCost(amount, terminal.room.name, highestBuy.roomName)) break;
                amount = Math.floor(amount * 0.75);
            }
            if (amount < 10) continue;

            let costToSell = Game.market.calcTransactionCost(amount, terminal.room.name, highestBuy.roomName) * energyPrice;
            let netProfit = spread * amount - costToSell;

            const minArbitrageProfit = this.getCreditTrend() > 0 ? 100 : 150;
            if (netProfit <= minArbitrageProfit) continue;

            const sellTxCost = Game.market.calcTransactionCost(amount, terminal.room.name, highestBuy.roomName);
            if (!canAffordSend(sellTxCost)) continue;
            if (Game.market.deal(highestBuy.id, amount, terminal.room.name) === OK) {
                recordMarketEnergyCost(terminal.room.name, sellTxCost);
                this.recordBankerDeal('sell', mineral, amount, highestBuy.price * amount);
                return true;
            }
        }

        if (Game.market.credits < getCreditFloor()) return false;

        const procureResources = _.union(BASE_MINERALS, COMPRESSED_COMMODITIES.filter(r => r !== RESOURCE_BATTERY));
        for (let mineral of shuffle(procureResources)) {
            if (!shouldProcureResource(mineral)) continue;

            let marketHistory = latestMarketHistory(mineral);
            const refPrice = parseFloat(marketHistory.median) || parseFloat(marketHistory.avg);
            if (!refPrice || marketHistory.entries < 5) continue;

            let bargainPrice = refPrice * (this.getCreditTrend() > 0 ? 0.4 : 0.5);

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

                if (isCompressedBar(mineral) && !barPriceBeatsRaw(mineral, bestDeal.price, globalOrders)) continue;

                let buyAmount = Math.min(bestDeal.remainingAmount, 1000);
                let cost = (bestDeal.price * buyAmount);
                let transCost = Game.market.calcTransactionCost(buyAmount, terminal.room.name, bestDeal.roomName);

                if (cost < Memory._banker.spendingAccount && transCost < terminal.store[RESOURCE_ENERGY]
                    && canAffordSend(transCost) && canAffordCredits(cost, {allowNegativeTrend: true})) {
                    if (Game.market.deal(bestDeal.id, buyAmount, terminal.room.name) === OK) {
                        recordMarketEnergyCost(terminal.room.name, transCost);
                        recordCreditSpend(cost);
                        log.w(`DEAL FINDER: Bought ${buyAmount} ${mineral} for ${cost} credits (Bargain Price: ${bestDeal.price}) in ${roomLink(terminal.room.name)}`, "Market: ");
                        this.recordBankerDeal('buy', mineral, buyAmount, cost);
                        return true;
                    }
                }
            }
        }
        return false;
    }

});