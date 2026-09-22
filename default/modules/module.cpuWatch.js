/*
 * Offline CPU spike / tick-timeout reporter.
 *
 * A timed-out tick cannot email itself: the VM is killed before Game.notify
 * and Memory serialization. This watchdog:
 *   - records cheap phase marks on the heap during the tick
 *   - emails on completed ticks that spike vs rolling average or near tickLimit
 *   - on the next tick, detects a missing completedTick (timeout) and emails
 *     whatever heap phases survived (global reset wipes phases; Memory gap remains)
 *   - arms Game.profiler.email() for a short window so a repeat yields function data
 */

const profiler = require('tools.profiler');

const SAMPLE_WINDOW = 25;
const MIN_SAMPLES = 10;
const NEAR_TIMEOUT_RATIO = 0.85;
const SPIKE_AVG_RATIO = 1.6;
const SPIKE_LIMIT_RATIO = 1.2;
const NOTIFY_COOLDOWN = 150;
const AUTO_PROFILE_TICKS = 15;
const MAX_PHASES = 40;
const EMAIL_LIMIT = 950;

const ROLE_ABBR = {
    remoteHauler: 'rh', remoteHarvester: 'rm', stationaryHarvester: 'sh',
    drone: 'dr', hauler: 'ha', upgrader: 'up', waller: 'wa', hubManager: 'hm',
    labTech: 'lt', remoteBuilder: 'rb', longbowSquad: 'lq', longbow: 'lb',
    SKAttacker: 'sk', commodityMiner: 'cm', reserver: 'rs', shuttle: 'st',
    roadBuilder: 'rd', explorer: 'ex', scout: 'sc',
};

const PHASE_ABBR = {
    colony: '', colonies: 'cols', military: 'mil', planner: 'pln',
    state: 'st', house: 'hs', start: 'st0', roles: 'rl', et: 'et',
    prof: 'pr', power: 'pw', save: 'sv', end: 'end', world: 'wd',
    tools: 'tl', hc: 'hc', expand: 'ex',
};

const samples = [];

function notifyEnabled() {
    return typeof CPU_SPIKE_NOTIFY === 'undefined' || !!CPU_SPIKE_NOTIFY;
}

function cpuHeadroom() {
    const tickLimit = (Game.cpu && Game.cpu.tickLimit) || 500;
    const used = (Game.cpu && Game.cpu.getUsed) ? Game.cpu.getUsed() : 0;
    return tickLimit - used;
}

let hookTick = -1;
let pfSearches = 0;
let pfOps = 0;
let pfIncomplete = 0;
let pfCpu = 0;
let marketCalls = 0;
let marketCpu = 0;
let roleCpu = null;
let obsNotes = null;
let intelNotes = null;

function resetHookStats() {
    if (hookTick === Game.time) return;
    hookTick = Game.time;
    pfSearches = 0;
    pfOps = 0;
    pfIncomplete = 0;
    pfCpu = 0;
    marketCalls = 0;
    marketCpu = 0;
    roleCpu = Object.create(null);
    obsNotes = [];
    intelNotes = [];
}

function noteRoleCpu(role, spent) {
    if (!(spent > 0)) return;
    resetHookStats();
    const key = role || '?';
    roleCpu[key] = (roleCpu[key] || 0) + spent;
}

function noteMarketCpu(spent) {
    if (!(spent > 0)) return;
    resetHookStats();
    marketCalls++;
    marketCpu += spent;
}

function noteObsCpu(home, target, intelCpu, totalCpu) {
    resetHookStats();
    obsNotes.push({
        h: home,
        t: target,
        i: Math.round(intelCpu),
        tot: Math.round(totalCpu),
    });
}

function noteIntelCpu(room, spent) {
    resetHookStats();
    intelNotes.push({r: room, c: Math.round(spent)});
}

function notePathFinderSearch(result, cpuSpent) {
    resetHookStats();
    pfSearches++;
    if (typeof cpuSpent === 'number' && cpuSpent > 0) pfCpu += cpuSpent;
    if (result) {
        pfOps += result.ops || 0;
        if (result.incomplete) pfIncomplete++;
    }
}

function installHooks() {
    if (global._cpuWatchHooks) return;
    global._cpuWatchHooks = true;
    if (typeof PathFinder !== 'undefined' && PathFinder.search) {
        const origPf = PathFinder.search.bind(PathFinder);
        PathFinder.search = function (origin, goal, opts) {
            resetHookStats();
            const t0 = Game.cpu.getUsed();
            const result = origPf(origin, goal, opts);
            pfCpu += Game.cpu.getUsed() - t0;
            pfSearches++;
            if (result) {
                pfOps += result.ops || 0;
                if (result.incomplete) pfIncomplete++;
            }
            return result;
        };
    }
    if (typeof Game !== 'undefined' && Game.market && Game.market.getAllOrders) {
        const origOrders = Game.market.getAllOrders.bind(Game.market);
        Game.market.getAllOrders = function (filter) {
            resetHookStats();
            const t0 = Game.cpu.getUsed();
            const result = origOrders(filter);
            marketCpu += Game.cpu.getUsed() - t0;
            marketCalls++;
            return result;
        };
    }
}

function abbrRole(role) {
    return ROLE_ABBR[role] || (role ? role.slice(0, 3) : '?');
}

function hookBits() {
    resetHookStats();
    const parts = [];
    if (pfSearches) {
        let text = `pf${pfSearches}/${Math.round(pfOps / 1000)}k`;
        if (pfCpu >= 3) text += ` ${pfCpu.toFixed(0)}c`;
        if (pfIncomplete) text += ` ${pfIncomplete}i`;
        parts.push(text);
    }
    if (marketCalls && marketCpu >= 3) {
        parts.push(`mkt${marketCpu.toFixed(0)}`);
    }
    if (roleCpu) {
        const rows = [];
        for (const role in roleCpu) rows.push({role: role, cpu: roleCpu[role]});
        rows.sort((a, b) => b.cpu - a.cpu);
        const hot = [];
        for (let i = 0; i < rows.length && hot.length < 4; i++) {
            if (rows[i].cpu < 10) break;
            hot.push(`${abbrRole(rows[i].role)}${rows[i].cpu.toFixed(0)}`);
        }
        if (hot.length) parts.push(hot.join(','));
    }
    if (obsNotes && obsNotes.length) {
        obsNotes.sort((a, b) => b.tot - a.tot);
        const n = Math.min(2, obsNotes.length);
        const bits = [];
        for (let i = 0; i < n; i++) {
            if (obsNotes[i].tot < 12) break;
            const o = obsNotes[i];
            bits.push(`${o.h}>${o.t} ${o.i}/${o.tot}`);
        }
        if (bits.length) parts.push(`ob ${bits.join(',')}`);
    }
    if (intelNotes && intelNotes.length) {
        intelNotes.sort((a, b) => b.c - a.c);
        if (intelNotes[0].c >= 20) {
            const n = Math.min(2, intelNotes.length);
            const bits = [];
            for (let i = 0; i < n; i++) {
                if (intelNotes[i].c < 20) break;
                bits.push(`${intelNotes[i].r}:${intelNotes[i].c}`);
            }
            if (bits.length) parts.push(`in ${bits.join(',')}`);
        }
    }
    return parts.join(' ');
}

function watchMem() {
    if (!Memory.cpuWatch) Memory.cpuWatch = {};
    return Memory.cpuWatch;
}

function heap() {
    if (!global._cpuWatchHeap) {
        global._cpuWatchHeap = {tick: 0, phases: [], ended: 0};
    }
    return global._cpuWatchHeap;
}

function mark(name, detail, spent) {
    const h = global._cpuWatchHeap;
    if (!h || h.tick !== Game.time) return;
    const entry = {name: name, cpu: Game.cpu.getUsed()};
    if (detail) entry.detail = detail;
    if (typeof spent === 'number' && isFinite(spent)) entry.spent = spent;
    h.phases.push(entry);
    if (h.phases.length > MAX_PHASES) h.phases.shift();
}

function noteSample(used) {
    samples.push(used);
    if (samples.length > SAMPLE_WINDOW) samples.shift();
}

function sampleAvg() {
    if (!samples.length) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i];
    return sum / samples.length;
}

function classify(used, limit, tickLimit) {
    if (used >= tickLimit * NEAR_TIMEOUT_RATIO) return 'near-timeout';
    if (used >= limit * 2) return 'spike';
    const avg = sampleAvg();
    if (samples.length >= MIN_SAMPLES && avg > 0) {
        const threshold = Math.max(limit * SPIKE_LIMIT_RATIO, avg * SPIKE_AVG_RATIO);
        if (used >= threshold) return 'spike';
    }
    return null;
}

function phaseLabel(p) {
    if (p.name === 'colony' && p.detail) return p.detail;
    const abbr = PHASE_ABBR[p.name];
    const name = abbr !== undefined ? abbr : p.name;
    if (p.detail) return name ? `${name}:${p.detail}` : p.detail;
    return name || p.name;
}

function formatPhases(phases) {
    if (!phases || !phases.length) return '';
    const rows = [];
    let prev = 0;
    for (let i = 0; i < phases.length; i++) {
        const p = phases[i];
        const delta = p.spent != null ? p.spent : p.cpu - prev;
        if (delta >= 10) rows.push({label: phaseLabel(p), delta: delta});
        prev = p.cpu;
    }
    rows.sort((a, b) => b.delta - a.delta);
    const parts = [];
    for (let i = 0; i < rows.length && i < 6; i++) {
        parts.push(`${rows[i].label}+${rows[i].delta.toFixed(0)}`);
    }
    return parts.join(' ');
}

function topRooms(n) {
    const arr = typeof ROOM_CPU_ARRAY !== 'undefined' ? ROOM_CPU_ARRAY : {};
    const rows = [];
    for (const name in arr) {
        const list = arr[name];
        if (!list || !list.length) continue;
        rows.push({name: name, last: list[list.length - 1]});
    }
    rows.sort((a, b) => b.last - a.last);
    const out = [];
    const limit = Math.min(n, rows.length);
    for (let i = 0; i < limit; i++) {
        if (rows[i].last < 8) break;
        out.push(`${rows[i].name}:${rows[i].last.toFixed(0)}`);
    }
    return out.join(', ');
}

function plannerBits() {
    try {
        const report = require('planOrchestrator').getLastTickReport();
        if (!report || report.tick !== Game.time || report.cpu == null || report.cpu < 5) return '';
        let text = `pln${report.cpu.toFixed(0)}`;
        if (report.room) text += ` ${report.room}`;
        const phases = report.phases;
        if (phases && phases.length) {
            const heavy = [];
            for (let i = 0; i < phases.length; i++) {
                const p = phases[i];
                if (p && p.cpu >= 5) heavy.push(`${p.phase}:${p.cpu.toFixed(0)}`);
            }
            if (heavy.length) text += `[${heavy.join(',')}]`;
        }
        return text;
    } catch (e) {
        return '';
    }
}

function creepCount() {
    let n = 0;
    for (const _ in Game.creeps) n++;
    return n;
}

function contextBits() {
    const rooms = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS && MY_ROOMS.length) ? MY_ROOMS.length : 0;
    return `r${rooms} c${creepCount()} b${Game.cpu.bucket}`;
}

function profilerDump(maxLen) {
    try {
        if (!Memory.profiler || !Memory.profiler.enabledTick) return '';
        const text = profiler.output(maxLen);
        if (!text || text === 'Profiler not active.') return '';
        if (text.indexOf('Avg: 0.00') !== -1 && text.indexOf('Total: 0.00') !== -1) return '';
        return text;
    } catch (e) {
        return '';
    }
}

function armProfiler(ticks) {
    if (typeof Game === 'undefined' || !Game.profiler || !Game.profiler.email) return false;
    if (Memory.profiler && Memory.profiler.enabledTick) {
        const type = Memory.profiler.type;
        if (type === 'email' || type === 'profile' || type === 'stream' || type === 'background') {
            return false;
        }
    }
    Game.profiler.email(ticks || AUTO_PROFILE_TICKS);
    return true;
}

function pack(parts) {
    let msg = '';
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        const add = msg ? `. ${part}` : part;
        if (msg.length + add.length > EMAIL_LIMIT) break;
        msg += add;
    }
    return msg;
}

function send(message) {
    const extra = watchMem().suppressed || 0;
    if (extra) {
        const tag = ` +${extra}`;
        if (message.length + tag.length <= EMAIL_LIMIT) message += tag;
        watchMem().suppressed = 0;
    }
    if (message.length > EMAIL_LIMIT) message = message.slice(0, EMAIL_LIMIT);
    Game.notify(message, 0);
    if (typeof log !== 'undefined' && log.a) log.a(message, 'CPU: ');
    else console.log(message);
    watchMem().lastNotify = Game.time;
}

function canNotify() {
    if (!notifyEnabled()) return false;
    const last = watchMem().lastNotify || 0;
    if (last && Game.time - last < NOTIFY_COOLDOWN) {
        watchMem().suppressed = (watchMem().suppressed || 0) + 1;
        return false;
    }
    return true;
}

function reportTimeout(missed, prevPhases, prevTick) {
    if (!canNotify()) return;
    const watch = watchMem();
    const lastCpu = watch.lastCpu != null ? watch.lastCpu.toFixed(1) : '?';
    const lastBucket = watch.lastBucket != null ? watch.lastBucket : '?';
    const limit = Game.cpu.limit || 20;
    const died = (prevTick === Game.time - missed && prevPhases && prevPhases.length)
        ? `${phaseLabel(prevPhases[prevPhases.length - 1])}@${prevPhases[prevPhases.length - 1].cpu.toFixed(0)}`
        : 'noPhase';
    send(pack([
        `[TO] -${missed} before ${Game.time} last ${lastCpu}/${limit} b${lastBucket}->${Game.cpu.bucket} ${contextBits()} died ${died}`,
        formatPhases(prevPhases),
        armProfiler(AUTO_PROFILE_TICKS) ? 'arm15' : '',
    ]));
}

function reportSpike(kind, used, limit, tickLimit, phases) {
    const sinceReset = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    // Cold-cache ticks after a global reset are expected to spike.
    if (sinceReset <= 15) return;
    if (!canNotify()) return;
    const avg = sampleAvg();
    const tag = kind === 'near-timeout' ? 'NT' : 'SP';
    send(pack([
        `[${tag}] t${Game.time} ${used.toFixed(0)}/${limit} a${avg ? avg.toFixed(0) : '?'} ${contextBits()}`,
        hookBits(),
        formatPhases(phases),
        plannerBits(),
        topRooms(3),
        armProfiler(AUTO_PROFILE_TICKS) ? 'arm15' : '',
    ]));
}

function startTick() {
    const watch = watchMem();
    const h = heap();
    const prevTick = h.tick;
    const prevPhases = h.phases;
    const prevEnded = h.ended;

    const sinceReset = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;

    if (watch.completedTick != null && watch.completedTick < Game.time - 1) {
        const missed = Game.time - watch.completedTick - 1;
        const phases = (prevEnded !== prevTick && prevTick > watch.completedTick) ? prevPhases : null;
        // Boot-skip ticks also call start/end. A gap right after a global reset
        // may be the timeout that triggered the reset — stash and email once
        // the boot ticks have completed, otherwise we overwrite completedTick
        // and lose the signal.
        if (sinceReset > 3) {
            reportTimeout(missed, phases, prevTick);
            delete watch.pendingTimeout;
        } else if (!watch.pendingTimeout) {
            watch.pendingTimeout = missed;
        }
    } else if (watch.pendingTimeout && sinceReset > 3) {
        reportTimeout(watch.pendingTimeout, null, 0);
        delete watch.pendingTimeout;
    }

    h.tick = Game.time;
    h.phases = [{name: 'start', cpu: Game.cpu.getUsed()}];
    h.ended = 0;
    watch.startedTick = Game.time;
    installHooks();
    resetHookStats();
}

function endTick() {
    const h = heap();
    if (h.ended === Game.time) return;
    h.ended = Game.time;
    mark('end');

    const used = Game.cpu.getUsed();
    const limit = Game.cpu.limit || 20;
    const tickLimit = (Game.cpu && Game.cpu.tickLimit) || 500;
    const watch = watchMem();
    watch.completedTick = Game.time;
    watch.lastCpu = used;
    watch.lastBucket = Game.cpu.bucket;

    const kind = classify(used, limit, tickLimit);
    noteSample(used);
    if (kind) reportSpike(kind, used, limit, tickLimit, h.phases);
}

function status() {
    const watch = Memory.cpuWatch || {};
    const avg = sampleAvg();
    const h = global._cpuWatchHeap;
    console.log(`cpuWatch: completed ${watch.completedTick || '—'} lastCpu ${watch.lastCpu != null ? watch.lastCpu.toFixed(1) : '—'} avg ${avg.toFixed(1)} bucket ${Game.cpu.bucket} lastNotify ${watch.lastNotify || '—'}`);
    if (h && h.phases && h.phases.length) console.log(`  phases: ${formatPhases(h.phases)}`);
    return watch;
}

function testNotify() {
    const used = Game.cpu.getUsed();
    const limit = Game.cpu.limit || 20;
    const tickLimit = (Game.cpu && Game.cpu.tickLimit) || 500;
    watchMem().lastNotify = 0;
    watchMem().suppressed = 0;
    send(`[CPU SPIKE] test email tick ${Game.time} used ${used.toFixed(1)}/${limit} (tickLimit ${tickLimit}). ${contextBits()}`);
    return 'sent test CPU spike email';
}

if (typeof global !== 'undefined') {
    global.cpuWatchStatus = status;
    global.cpuSpikeTest = testNotify;
    global.noteRoleCpu = noteRoleCpu;
    global.notePathFinderSearch = notePathFinderSearch;
    global.noteObsCpu = noteObsCpu;
    global.noteIntelCpu = noteIntelCpu;
    global.noteMarketCpu = noteMarketCpu;
}

module.exports = {
    startTick,
    endTick,
    mark,
    status,
    testNotify,
    cpuHeadroom,
    noteRoleCpu,
    notePathFinderSearch,
    noteObsCpu,
    noteIntelCpu,
    noteMarketCpu,
};
