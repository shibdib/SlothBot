module.exports.shibBench = function (name, start, end = Game.cpu.getUsed()) {
    let key = name;
    let cache = Memory._benchmark || {};
    let tick = Game.time;
    let raw;
    if (cache[key]) {
        raw = ((end - start) + cache[key]['raw']) / 2;
    } else {
        raw = end - start;
    }
    cache[key] = {
        tick: tick,
        raw: raw
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
    mem['avg'] = (avg + raw) / 2;
    mem['count'] += 1;
    Memory._benchmark[key] = mem;
}