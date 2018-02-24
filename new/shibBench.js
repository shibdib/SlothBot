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
            let sorted = _.sortBy(Memory._benchmark, 'avg');
            log.e('~~~~~BENCHMARK REPORT~~~~~');
            for (let key in sorted) {
                log.a(key + ' - Was Used ' + sorted[key]['useCount'] + ' times over ' + sorted[key]['tickCount'] + ' ticks. Average CPU Used: ' + sorted[key]['avg']);
            }
            if (Memory.reportBenchNotify) {
                Game.notify('~~~~~BENCHMARK REPORT~~~~~');
                for (let key in sorted) {
                    log.a(key + ' - Was Used ' + sorted[key]['useCount'] + ' times over ' + sorted[key]['tickCount'] + ' ticks. Average CPU Used: ' + sorted[key]['avg']);
                }
            }
            Memory.reportBench = undefined;
            Memory.reportBenchNotify = undefined;
        }
    }
};

