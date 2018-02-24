module.exports.shibBench = function (name, start, end = Game.cpu.getUsed()) {
    let key = name;
    let cache = Memory._benchmark || {};
    let tick = Game.time;
    let raw;
    let avg;
    let count;
    if (cache[key]) {
        raw = ((end - start) + cache[key]['raw']) / 2;
        avg = cache[key]['avg'];
        count = cache[key]['count'];
    } else {
        raw = end - start;
    }
    cache[key] = {
        tick: tick,
        raw: raw,
        avg: avg
    };
    Memory._benchmark = cache;

};

module.exports.benchAverage = function () {
    for (let key in Memory._benchmark) {
        storeAverage(Memory._benchmark[key], key)
    }
};


function storeAverage(mem, key) {
    let avg = mem['avg'] || 0;
    let raw = mem['raw'] || 0;
    let count = mem['count'] || 0;
    mem['avg'] = (avg + raw) / 2;
    mem['count'] = count + 1;
    Memory._benchmark[key] = mem;
}