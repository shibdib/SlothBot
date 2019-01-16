module.exports.shibBench = function (name, start, end = Game.cpu.getUsed()) {
    let key = name;
    // Totals
    let cache = Memory._benchmark || {};
    let tick = Game.time;
    let raw, max, avg, total, tickUse, tickCount, useCount;
    if (cache[key]) {
        raw = ((end - start) + cache[key]['raw']) / 2;
        max = cache[key]['max'];
        avg = cache[key]['avg'];
        tickUse = (end - start) + cache[key]['tickUse'];
        total = (end - start) + cache[key]['total'];
        tickCount = cache[key]['tickCount'];
        useCount = cache[key]['useCount'] + 1;
    } else {
        raw = end - start;
        useCount = 1;
        tickUse = raw;
        total = raw;
    }
    cache[key] = {
        title: name,
        tick: tick,
        max: max,
        raw: raw,
        avg: avg,
        total: total,
        tickUse: tickUse,
        useCount: useCount,
        tickCount: tickCount
    };
    Memory._benchmark = cache;
};

module.exports.processBench = function () {
    for (let key in Memory._benchmark) {
        let mem = Memory._benchmark[key];
        let max = mem['max'] || 0;
        let total = mem['total'] || 0;
        let tickUse = mem['tickUse'] || 0;
        let count = mem['tickCount'] || 0;
        if (tickUse > max) mem['max'] = tickUse;
        mem['tickUse'] = 0;
        mem['avg'] = total / (count + 1);
        mem['tickCount'] = count + 1;
        Memory._benchmark[key] = mem;
    }
    // Store bucket info
    let bucket = Memory._benchmark['bucket'] || {};
    bucket['title'] = 'bucket';
    bucket['used'] = (bucket['used'] + (10000 - Game.cpu.bucket));
    Memory._benchmark['bucket'] = bucket;
    if (Memory.reportBench) {
        if (Game.time >= Memory.reportBench) {
            let sorted = _.sortBy(Memory._benchmark, 'avg');
            log.e('---------------------------------------------------------------------------');
            log.e('~~~~~BENCHMARK REPORT~~~~~');
            if (Memory.reportBenchNotify) Game.notify('~~~~~BENCHMARK REPORT~~~~~');
            let totalTicks, overallAvg, bucketAvg, bucketTotal;
            let anomalies = [];
            for (let key in sorted) {
                if (sorted[key]['title'] === 'Total') {
                    totalTicks = sorted[key]['tickCount'];
                    overallAvg = sorted[key]['avg'];
                    continue;
                }
                if (sorted[key]['title'] === 'bucket') {
                    bucketAvg = sorted[key]['avg'];
                    bucketTotal = sorted[key]['used'];
                    continue;
                }
                //Track anomalies
                if (sorted[key]['avg'] + (sorted[key]['avg'] * 0.75) < sorted[key]['max'] && sorted[key]['avg'] + (sorted[key]['avg'] * 0.75) > 2) {
                    anomalies.push(sorted[key]['title']);
                    log.w(sorted[key]['title'] + ' - Was Used ' + sorted[key]['useCount'] + ' times. ||| Average CPU Used: ' + _.round(sorted[key]['avg'], 3) + ' ||| Total CPU Used: ' + _.round(sorted[key]['total'], 3) + '. ||| Peak CPU Used: ' + _.round(sorted[key]['max'], 3));
                } else {
                    log.a(sorted[key]['title'] + ' - Was Used ' + sorted[key]['useCount'] + ' times. ||| Average CPU Used: ' + _.round(sorted[key]['avg'], 3) + ' ||| Total CPU Used: ' + _.round(sorted[key]['total'], 3) + '. ||| Peak CPU Used: ' + _.round(sorted[key]['max'], 3));
                }
                if (Memory.reportBenchNotify) Game.notify(sorted[key]['title'] + ' - Was Used ' + sorted[key]['useCount'] + ' times. ||| Average CPU Used: ' + _.round(sorted[key]['avg'], 3) + ' ||| Total CPU Used: ' + _.round(sorted[key]['total'], 3) + '. ||| Peak CPU Used: ' + _.round(sorted[key]['max'], 3));
            }
            log.e('Ticks Covered: ' + totalTicks + '. Average CPU Used: ' + _.round(overallAvg, 3));
            log.e('Total Bucket Used: ' + bucketTotal + '. Current Bucket: ' + Game.cpu.bucket);
            if (anomalies.length) log.w('-- CPU Anomalies Detected --');
            log.e('---------------------------------------------------------------------------');
            if (Memory.reportBenchNotify) Game.notify('Ticks Covered: ' + totalTicks + '. Average CPU Used: ' + _.round(overallAvg, 3));
            if (Memory.reportBenchNotify) Game.notify('Total Bucket Used: ' + bucketTotal + '. Current Bucket: ' + Game.cpu.bucket);
            delete Memory.reportBench;
            delete Memory.reportBenchNotify;
        }
    }
};

