module.exports.shibBench = function (name, start, end = Game.cpu.getUsed()) {
    let key = name;
    let cache = Memory._benchmark || {};
    let tick = Game.time;
    let raw;
    let avg;
    let tickCount;
    let useCount;
    if (cache[key]) {
        raw = ((end - start) + cache[key]['raw']) / 2;
        avg = cache[key]['avg'];
        tickCount = cache[key]['tickCount'];
        useCount = cache[key]['useCount'] + 1;
    } else {
        raw = end - start;
        useCount = 1;
    }
    cache[key] = {
        tick: tick,
        raw: raw,
        avg: avg,
        useCount: useCount,
        tickCount: tickCount
    };
    Memory._benchmark = cache;

};

module.exports.processBench = function () {
    for (let key in Memory._benchmark) {
        let mem = Memory._benchmark[key];
        let avg = mem['avg'] || 0;
        let raw = mem['raw'] || 0;
        let count = mem['tickCount'] || 0;
        mem['avg'] = (avg + raw) / 2;
        mem['tickCount'] = count + 1;
        Memory._benchmark[key] = mem;
    }
    if (Memory.reportBench) {
        if (Game.time <= Memory.reportBench) {
            log.a('~~~~~BENCHMARK REPORT~~~~~');
            for (let key in _.sortBy(Memory._benchmark, 'avg')) {
                let entry = Memory._benchmark[key];
                log.a(key + ' - Was Used ' + entry['useCount'] + ' times over ' + entry['tickCount'] + ' ticks. Average CPU Used: ' + entry['avg']);
            }
            if (Memory.reportBenchNotify) {
                Game.notify('~~~~~BENCHMARK REPORT~~~~~');
                for (let key in _.sortBy(Memory._benchmark, 'avg')) {
                    let entry = Memory._benchmark[key];
                    Game.notify(key + ' - Was Used ' + entry['useCount'] + ' times over ' + entry['tickCount'] + ' ticks. Average CPU Used: ' + entry['avg']);
                }
            }
            Memory.reportBench = undefined;
            Memory.reportBenchNotify = undefined;
        }
    }
};

module.exports.requestBench = function (ticks, notify = false) {
    Memory._benchmark = undefined;
    Memory.reportBench = Game.time + ticks;
    Memory.reportBenchNotify = notify;
    log.a('Benchmark Queued');
};

module.exports.currentStats = function (notify = false) {
    log.a('~~~~~BENCHMARK REPORT~~~~~');
    for (let key in _.sortBy(Memory._benchmark, 'avg')) {
        let entry = Memory._benchmark[key];
        log.a(key + ' - Was Used ' + entry['useCount'] + ' times over ' + entry['tickCount'] + ' ticks. Average CPU Used: ' + entry['avg']);
    }
    if (notify) {
        Game.notify('~~~~~BENCHMARK REPORT~~~~~');
        for (let key in _.sortBy(Memory._benchmark, 'avg')) {
            let entry = Memory._benchmark[key];
            Game.notify(key + ' - Was Used ' + entry['useCount'] + ' times over ' + entry['tickCount'] + ' ticks. Average CPU Used: ' + entry['avg']);
        }
    }
};

module.exports.resetBench = function () {
    Memory._benchmark = undefined;
    Memory.reportBench = undefined;
    Memory.reportBenchNotify = undefined;
    log.a('Benchmarks Reset');
};