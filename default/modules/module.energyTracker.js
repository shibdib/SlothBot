/*
 * Event-log-based energy flow tracker.
 *
 * Per-room rolling ring buffers (WINDOW ticks) of:
 *   - income  (EVENT_HARVEST on a source)
 *   - expense (EVENT_UPGRADE_CONTROLLER + EVENT_BUILD + EVENT_REPAIR + tower EVENT_ATTACK)
 *   - upgrade (EVENT_UPGRADE_CONTROLLER only — used for upgrader duty-cycle feedback)
 *
 * Per-colony ring buffer of summed (home + remotes) spareIncome per tick, so trend
 * detection works against a stable colony-aggregated signal rather than a single room's
 * noisy slice.
 *
 * State lives in module-heap (lost on global reset; refills over WINDOW ticks).
 */

const profiler = require("tools.profiler");

const WINDOW = 50;
const TRACKER = {};
const COLONY = {};

function getOrInit(roomName) {
    let s = TRACKER[roomName];
    if (!s) {
        s = TRACKER[roomName] = {
            income: new Array(WINDOW).fill(0),
            expense: new Array(WINDOW).fill(0),
            upgrade: new Array(WINDOW).fill(0),
            // Theoretical upgrade WORK at each tick — averaged on the same window as `upgrade`
            // so duty cycle compares aligned signals (prevents the ~25-tick phase mismatch
            // after upgrader resizes).
            upgradeWork: new Array(WINDOW).fill(0),
            sumIncome: 0,
            sumExpense: 0,
            sumUpgrade: 0,
            sumUpgradeWork: 0,
            idx: 0,
            samples: 0,
        };
    }
    return s;
}

function colonyGetOrInit(homeName) {
    let c = COLONY[homeName];
    if (!c) {
        c = COLONY[homeName] = {
            spareIncome: new Array(WINDOW).fill(0),
            sum: 0,
            idx: 0,
            samples: 0,
        };
    }
    return c;
}

function tickRoom(room) {
    const events = room.getEventLog();
    let inc = 0;
    let exp = 0;
    let upg = 0;

    if (events.length) {
        // room.sources / room.towers / room.links are themselves cached on the Room object — cheap.
        const sourceIds = new Set();
        for (const src of room.sources) sourceIds.add(src.id);
        const towerIds = new Set();
        const towers = room.towers;
        if (towers) for (const t of towers) towerIds.add(t.id);
        // Link IDs are needed to attribute EVENT_TRANSFER loss correctly — a creep→link
        // transfer doesn't lose anything, only a link→link transfer does.
        const linkIds = new Set();
        const links = room.links;
        if (links) for (const l of links) linkIds.add(l.id);

        for (let i = 0; i < events.length; i++) {
            const e = events[i];
            const d = e.data;
            if (!d) continue;
            // `|| 0` guards against undefined / NaN slipping into the sum — once it does,
            // the running totals stay poisoned forever (NaN propagates through -=/+=).
            switch (e.event) {
                case EVENT_HARVEST:
                    if (sourceIds.has(d.targetId)) inc += d.amount || 0;
                    break;
                case EVENT_UPGRADE_CONTROLLER: {
                    const es = d.energySpent || 0;
                    exp += es;
                    upg += es;
                    break;
                }
                case EVENT_BUILD:
                    exp += d.energySpent || 0;
                    break;
                case EVENT_REPAIR:
                    exp += d.energySpent || 0;
                    break;
                case EVENT_ATTACK:
                    if (towerIds.has(e.objectId)) exp += TOWER_ENERGY_COST;
                    break;
                case EVENT_TRANSFER:
                    // Link → link transfers lose LINK_LOSS_RATIO of the amount. Only count when
                    // both ends are links — creep→link or link→creep transfers are lossless.
                    if (d.resourceType === RESOURCE_ENERGY &&
                        linkIds.has(e.objectId) && linkIds.has(d.targetId)) {
                        exp += (d.amount || 0) * LINK_LOSS_RATIO;
                    }
                    break;
            }
        }
    }

    // Snapshot theoretical upgrader WORK at this tick. Only meaningful in owned rooms;
    // remotes never have upgraders so we skip the iteration there.
    let theoryUpg = 0;
    if (room.controller && room.controller.my) {
        const creeps = room.myCreeps;
        for (let i = 0; i < creeps.length; i++) {
            if (creeps[i].memory.role === 'upgrader') {
                theoryUpg += creeps[i].getActiveBodyparts(WORK);
            }
        }
    }

    // Belt-and-braces: if anything above produced a non-finite value, zero it. This
    // keeps a single bad event from poisoning the running sum.
    if (!isFinite(inc)) inc = 0;
    if (!isFinite(exp)) exp = 0;
    if (!isFinite(upg)) upg = 0;
    if (!isFinite(theoryUpg)) theoryUpg = 0;

    // Advance the ring buffer even on zero-event ticks — otherwise the average
    // is biased toward "active" ticks.
    const s = getOrInit(room.name);
    // If a prior bug poisoned the running sum, recover by re-summing the ring.
    if (!isFinite(s.sumIncome)) s.sumIncome = s.income.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
    if (!isFinite(s.sumExpense)) s.sumExpense = s.expense.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
    if (!isFinite(s.sumUpgrade)) s.sumUpgrade = s.upgrade.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
    if (!isFinite(s.sumUpgradeWork)) s.sumUpgradeWork = s.upgradeWork.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
    s.sumIncome -= s.income[s.idx];
    s.sumExpense -= s.expense[s.idx];
    s.sumUpgrade -= s.upgrade[s.idx];
    s.sumUpgradeWork -= s.upgradeWork[s.idx];
    s.income[s.idx] = inc;
    s.expense[s.idx] = exp;
    s.upgrade[s.idx] = upg;
    s.upgradeWork[s.idx] = theoryUpg;
    s.sumIncome += inc;
    s.sumExpense += exp;
    s.sumUpgrade += upg;
    s.sumUpgradeWork += theoryUpg;
    s.idx = (s.idx + 1) % WINDOW;
    if (s.samples < WINDOW) s.samples++;

    return {inc, exp};
}

function snapshot(roomName) {
    const s = TRACKER[roomName];
    if (!s || s.samples === 0) {
        return {income: 0, expense: 0, upgrade: 0, upgradeWork: 0, spareIncome: 0, samples: 0};
    }
    // Final sanitiser — callers (HUD, stateManager, bodyGenerator) must never see NaN.
    const safe = v => (isFinite(v) ? v : 0);
    const income = safe(s.sumIncome) / s.samples;
    const expense = safe(s.sumExpense) / s.samples;
    const upgrade = safe(s.sumUpgrade) / s.samples;
    const upgradeWork = safe(s.sumUpgradeWork) / s.samples;
    return {
        income,
        expense,
        upgrade,
        upgradeWork,
        spareIncome: income - expense,
        samples: s.samples,
    };
}

// Aggregate a colony's flow: home room + all its remote rooms.
function colonySnapshot(homeName) {
    const home = snapshot(homeName);
    let income = home.income;
    let expense = home.expense;

    const remotes = global.ROOM_REMOTE_TARGETS && global.ROOM_REMOTE_TARGETS[homeName];
    if (remotes && remotes.length) {
        const seen = new Set();
        for (let i = 0; i < remotes.length; i++) {
            const r = remotes[i].room;
            if (seen.has(r)) continue;
            seen.add(r);
            const rs = snapshot(r);
            income += rs.income;
            expense += rs.expense;
        }
    }

    return {income, expense, spareIncome: income - expense};
}

// Per-tick change in colony spareIncome — average of (recent half) − (older half) of the
// per-tick ring. Returns 0 until the buffer has filled, to avoid acting on noise during
// warmup. A negative slope means we're trending toward going net-negative and consumers
// should pre-emptively shrink.
function colonyTrend(homeName) {
    const c = COLONY[homeName];
    if (!c || c.samples < WINDOW) return 0;
    const half = Math.floor(WINDOW / 2);
    let recent = 0;
    let older = 0;
    for (let i = 0; i < half; i++) {
        const recentIdx = (c.idx - 1 - i + WINDOW) % WINDOW;
        const olderIdx = (c.idx - 1 - half - i + WINDOW) % WINDOW;
        const r = c.spareIncome[recentIdx];
        const o = c.spareIncome[olderIdx];
        if (isFinite(r)) recent += r;
        if (isFinite(o)) older += o;
    }
    const t = (recent - older) / half;
    return isFinite(t) ? t : 0;
}

function aggregateColonyTick(homeName, inc, exp) {
    const c = colonyGetOrInit(homeName);
    let sp = inc - exp;
    if (!isFinite(sp)) sp = 0;
    if (!isFinite(c.sum)) c.sum = c.spareIncome.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
    c.sum -= c.spareIncome[c.idx];
    c.spareIncome[c.idx] = sp;
    c.sum += sp;
    c.idx = (c.idx + 1) % WINDOW;
    if (c.samples < WINDOW) c.samples++;
}

// Drop tracker state for rooms we no longer own or scout. Runs occasionally rather than
// every tick — the cost of stale entries is just a few hundred bytes apiece.
function pruneStale() {
    if (Game.time % 100 !== 0) return;
    if (!global.MY_ROOMS) return;

    const alive = new Set(global.MY_ROOMS);
    if (global.ROOM_REMOTE_TARGETS) {
        for (let i = 0; i < global.MY_ROOMS.length; i++) {
            const remotes = global.ROOM_REMOTE_TARGETS[global.MY_ROOMS[i]];
            if (!remotes) continue;
            for (let j = 0; j < remotes.length; j++) alive.add(remotes[j].room);
        }
    }
    for (const name in TRACKER) if (!alive.has(name)) delete TRACKER[name];
    for (const name in COLONY) if (!alive.has(name)) delete COLONY[name];
}

// Called once per game tick from main.world.js before stateManager runs.
function runAll() {
    if (!global.MY_ROOMS) return;

    pruneStale();

    const colonyInc = {};
    const colonyExp = {};
    const seen = new Set();

    // Home rooms first — they always tick if we have any presence.
    for (let i = 0; i < global.MY_ROOMS.length; i++) {
        const name = global.MY_ROOMS[i];
        const room = Game.rooms[name];
        if (!room) continue;
        try {
            const flow = tickRoom(room);
            colonyInc[name] = (colonyInc[name] || 0) + flow.inc;
            colonyExp[name] = (colonyExp[name] || 0) + flow.exp;
        } catch (e) {
            log.e(`energyTracker.tickRoom failed for ${name}: ${e.stack || e}`);
        }
        seen.add(name);
    }

    // Then visible remotes, attributed to their owning colony.
    if (global.ROOM_REMOTE_TARGETS) {
        for (let i = 0; i < global.MY_ROOMS.length; i++) {
            const home = global.MY_ROOMS[i];
            const remotes = global.ROOM_REMOTE_TARGETS[home];
            if (!remotes) continue;
            for (let j = 0; j < remotes.length; j++) {
                const rName = remotes[j].room;
                if (seen.has(rName)) continue;
                seen.add(rName);
                const room = Game.rooms[rName];
                if (!room) continue;
                try {
                    const flow = tickRoom(room);
                    colonyInc[home] = (colonyInc[home] || 0) + flow.inc;
                    colonyExp[home] = (colonyExp[home] || 0) + flow.exp;
                } catch (e) {
                    log.e(`energyTracker.tickRoom failed for remote ${rName}: ${e.stack || e}`);
                }
            }
        }
    }

    // Push aggregated values to per-colony rings. Advance every colony every tick,
    // even with zero flow — keeps the trend window aligned with wall-clock ticks.
    for (let i = 0; i < global.MY_ROOMS.length; i++) {
        const home = global.MY_ROOMS[i];
        aggregateColonyTick(home, colonyInc[home] || 0, colonyExp[home] || 0);
    }
}

profiler.registerObject({tickRoom, snapshot, colonySnapshot, colonyTrend, runAll}, 'EnergyTracker');

module.exports = {tickRoom, snapshot, colonySnapshot, colonyTrend, runAll};
