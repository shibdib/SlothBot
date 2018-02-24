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
            title: name,
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
            log.e('---------------------------------------------------------------------------');
            log.e('~~~~~BENCHMARK REPORT~~~~~');
            let totalTicks;
            let overallAvg;
            for (let key in sorted) {
                if (sorted[key]['title'] === 'Total') {
                    totalTicks = sorted[key]['tickCount'];
                    overallAvg = sorted[key]['avg'];
                    continue;
                }
                log.a(sorted[key]['title'] + ' - Was Used ' + sorted[key]['useCount'] + ' times. Average CPU Used: ' + sorted[key]['avg']);
            }
            log.e('Ticks Covered - ' + totalTicks + '. Average CPU Used: ' + overallAvg);
            log.e('---------------------------------------------------------------------------');
            if (Memory.reportBenchNotify) {
                Game.notify('~~~~~BENCHMARK REPORT~~~~~');
                for (let key in sorted) {
                    if (sorted[key]['title'] === 'Total') {
                        totalTicks = sorted[key]['tickCount'];
                        overallAvg = sorted[key]['avg'];
                        continue;
                    }
                    Game.notify(sorted[key]['title'] + ' - Was Used ' + sorted[key]['useCount'] + ' times. Average CPU Used: ' + sorted[key]['avg']);
                }
                Game.notify('Ticks Covered - ' + totalTicks + '. Average CPU Used: ' + overallAvg);
            }
            Memory.reportBench = undefined;
            Memory.reportBenchNotify = undefined;
        }
    }
};

