module.exports.shibBench = function (name, start, end) {
    if (!Memory._benchmark.name) Memory._benchmark.name = {};
    let raw = Memory._benchmark.name['raw'] || 0;
    if (raw === 0) {
        Memory._benchmark.name['raw'] = end - start;
    } else {
        let current = end - start;
        let raw = Memory._benchmark.name['raw'];
        Memory._benchmark.name['raw'] = (current + raw) / 2;
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