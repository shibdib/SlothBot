/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Credit trend tracking and banker deal stats.
 */

const {getSpendingAccount} = require('termBudget');

const TerminalControl = require('termClass');

Object.assign(TerminalControl.prototype, {

    recordBankerDeal(type, resourceType, amount, credits) {
        if (!Memory._banker.stats) Memory._banker.stats = {};
        const key = `${type}_${resourceType}`;
        if (!Memory._banker.stats[key]) Memory._banker.stats[key] = {count: 0, amount: 0, credits: 0};
        const stat = Memory._banker.stats[key];
        stat.count++;
        stat.amount += amount;
        stat.credits += credits;
    },

    updateSpendingMoney() {
        if (!Memory._banker) Memory._banker = {};

        if (Memory._banker.lastCredits === undefined) Memory._banker.lastCredits = Game.market.credits;
        if (Memory._banker.creditTrend === undefined) Memory._banker.creditTrend = 0;

        if (!Memory._banker.lastTrendUpdate || Memory._banker.lastTrendUpdate + 1000 < Game.time) {
            const difference = Game.market.credits - Memory._banker.lastCredits;
            Memory._banker.creditTrend = (Memory._banker.creditTrend * 0.9) + (difference * 0.1);
            Memory._banker.lastCredits = Game.market.credits;
            Memory._banker.lastTrendUpdate = Game.time;
        }

        Memory._banker.spendingAccount = getSpendingAccount();
    },

    getEnergyValue(globalOrders) {
        if (this._energyValue) return this._energyValue;
        const history = latestMarketHistory(RESOURCE_ENERGY);
        const avg = parseFloat(history.median) || parseFloat(history.avg) || 0.05;
        const buyOrders = globalOrders.filter(o => o.resourceType === RESOURCE_ENERGY && o.type === ORDER_BUY && (o.remainingAmount || o.amount) >= 1000);
        if (buyOrders.length) {
            this._energyValue = _.max(buyOrders, 'price').price;
        } else {
            this._energyValue = avg;
        }
        return this._energyValue;
    },

});