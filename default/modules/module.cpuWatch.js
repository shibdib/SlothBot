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

const samples = [];

function notifyEnabled() {
    return typeof CPU_SPIKE_NOTIFY === 'undefined' || !!CPU_SPIKE_NOTIFY;
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

function formatPhases(phases) {
    if (!phases || !phases.length) return '';
    const rows = [];
    let prev = 0;
    for (let i = 0; i < phases.length; i++) {
        const p = phases[i];
        const delta = p.spent != null ? p.spent : p.cpu - prev;
        const label = p.detail ? `${p.name}:${p.detail}` : p.name;
        rows.push({label: label, cpu: p.cpu, delta: delta, i: i});
        prev = p.cpu;
    }
    // Last-N with prev=0 used to attribute the whole tick to the first shown
    // label (e.g. "planner 443(+443)" when planner spent 0.1).
    const keep = new Set();
    keep.add(0);
    for (let i = Math.max(0, rows.length - 4); i < rows.length; i++) keep.add(i);
    const hot = rows.slice().sort((a, b) => b.delta - a.delta);
    for (let i = 0; i < hot.length && keep.size < 12; i++) {
        if (hot[i].delta >= 8) keep.add(hot[i].i);
    }
    const idxs = [...keep].sort((a, b) => a - b);
    const parts = [];
    for (let k = 0; k < idxs.length; k++) {
        const r = rows[idxs[k]];
        if (k && idxs[k] !== idxs[k - 1] + 1) parts.push('…');
        parts.push(`${r.label} ${r.cpu.toFixed(1)}(+${r.delta.toFixed(1)})`);
    }
    return parts.join(' > ');
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
        out.push(`${rows[i].name} ${rows[i].last.toFixed(1)}`);
    }
    return out.join(', ');
}

function plannerBits() {
    try {
        const report = require('planOrchestrator').getLastTickReport();
        if (!report || report.cpu == null || report.cpu < 5) return '';
        let text = `planner ${report.cpu.toFixed(1)}`;
        if (report.room) text += ` ${report.room}`;
        if (report.skipReason) text += ` skip:${report.skipReason}`;
        const phases = report.phases;
        if (phases && phases.length) {
            const heavy = [];
            for (let i = 0; i < phases.length; i++) {
                const p = phases[i];
                if (p && p.cpu >= 3) heavy.push(`${p.phase}:${p.cpu.toFixed(1)}`);
            }
            if (heavy.length) text += ` [${heavy.join(',')}]`;
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
    const bits = [`${rooms} rooms`, `${creepCount()} creeps`, `bucket ${Game.cpu.bucket}`];
    return bits.join(', ');
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

function send(message) {
    const extra = watchMem().suppressed || 0;
    if (extra) {
        message += ` (+${extra} more during cooldown)`;
        watchMem().suppressed = 0;
    }
    if (message.length > EMAIL_LIMIT) message = message.slice(0, EMAIL_LIMIT - 3) + '...';
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
    let msg = `[CPU TIMEOUT] ${missed} tick${missed === 1 ? '' : 's'} killed before ${Game.time}`;
    msg += `. last ok ${lastCpu}/${limit}, bucket then ${lastBucket}, now ${Game.cpu.bucket}`;
    msg += `. ${contextBits()}`;
    if (prevTick === Game.time - missed && prevPhases && prevPhases.length) {
        const last = prevPhases[prevPhases.length - 1];
        const label = last.detail ? `${last.name}:${last.detail}` : last.name;
        msg += `. died after ${label} @ ${last.cpu.toFixed(1)}`;
        const phases = formatPhases(prevPhases);
        if (phases) msg += `. ${phases}`;
    } else {
        msg += '. no phase data (global reset with the timeout)';
    }
    const dump = profilerDump(400);
    if (dump) msg += `\n${dump}`;
    const armed = armProfiler(AUTO_PROFILE_TICKS);
    if (armed) msg += `. armed profiler ${AUTO_PROFILE_TICKS} ticks`;
    send(msg);
}

function reportSpike(kind, used, limit, tickLimit, phases) {
    const sinceReset = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    // Cold-cache ticks after a global reset are expected to spike.
    if (sinceReset <= 15) return;
    if (!canNotify()) return;
    let msg = `[CPU ${kind.toUpperCase()}] tick ${Game.time} used ${used.toFixed(1)}/${limit} (tickLimit ${tickLimit})`;
    const avg = sampleAvg();
    if (avg) msg += ` avg ${avg.toFixed(1)}`;
    msg += `. ${contextBits()}`;
    const rooms = topRooms(6);
    if (rooms) msg += `. rooms ${rooms}`;
    const planText = plannerBits();
    if (planText) msg += `. ${planText}`;
    const phaseText = formatPhases(phases);
    if (phaseText) msg += `. ${phaseText}`;
    const dump = profilerDump(350);
    if (dump) msg += `\n${dump}`;
    const armed = armProfiler(AUTO_PROFILE_TICKS);
    if (armed) msg += `. armed profiler ${AUTO_PROFILE_TICKS} ticks`;
    send(msg);
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
}

module.exports = {
    startTick,
    endTick,
    mark,
    status,
    testNotify,
};
