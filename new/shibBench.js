module.exports.shibBench = function (name, start, end) {
    let benchCache = Memory._benchmark || [];
    let raw = benchCache[name]['raw'] || 0;
    if (raw === 0) {
        benchCache[name]['raw'] = end - start;
    } else {
        let current = end - start;
        let raw = benchCache[name]['raw'];
        benchCache[name]['raw'] = (current + raw) / 2;
    }

};

module.exports.benchAverage = function () {
    for (let key in Memory._benchmark) {
        storeAverage(Memory._benchmark[key])
    }
};


function storeAverage(mem) {
    let avg = mem['avg'] || 0;
    let count = mem['count'] || 0;
    let raw = mem['raw'] || 0;
    mem['avg'] = (avg + raw) / 2;
    mem['count'] = count + 1;
}