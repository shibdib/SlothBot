module.exports.diplomacyOverlord = function () {
    //Manage threats
    if (Game.time % 25 === 0 && Memory._badBoyList) threatManager();
};

function threatManager() {
    let newRating;
    Memory._badBoyArray = [];
    Memory._enemies = [];
    Memory._nuisance = [];
    Memory._threatList = [];
    for (let key in Memory._badBoyList) {
        if (key === MY_USERNAME) {
            delete Memory._badBoyList[key];
            continue;
        }
        let threat = Memory._badBoyList[key];
        if (threat.lastAction + 25 < Game.time) {
            // Scaled threat decrease
            let currentRating = threat.threatRating;
            let decrease = 1;
            if (currentRating > 1000) decrease = 0.5; else if (currentRating > 25) decrease = 0.75;
            newRating = currentRating - decrease;
            if (newRating <= 0) {
                delete Memory._badBoyList[key];
                log.w(key + ' is no longer considered a threat.');
                continue;
            } else {
                Memory._badBoyList[key].threatRating = newRating;
            }
        }
        if (Memory._badBoyList[key].threatRating > 250) {
            Memory._enemies.push(key);
        } else if (Memory._badBoyList[key].threatRating > 25) {
            Memory._nuisance.push(key);
        } else if (Memory._badBoyList[key].threatRating > 5) {
            Memory._threatList.push(key);
        }
        let length = 10 - (Memory._badBoyList[key].threatRating.toString().length + 1);
        let display = key.substring(0, length) + '-' + Memory._badBoyList[key].threatRating;
        Memory._badBoyArray.push(display);
    }
    // Add manual enemies
    Memory._enemies = _.union(Memory._enemies, HOSTILES);
    // If Not Standard/S+ Server everyone except manually specified are hostile
    if (!_.includes(['shard0', 'shard1', 'shard2', 'shard3'], Game.shard.name)) Memory._enemies = _.filter(_.union(Memory._enemies, _.uniq(_.pluck(Memory.roomCache, 'user'))), (p) => !_.includes(MANUAL_FRIENDS, p) && p !== MY_USERNAME);
    // NCP's are always hostile
    if (Memory.ncpArray && Memory.ncpArray.length) Memory._enemies = _.union(Memory._enemies, Memory.ncpArray);
    // Clean up lists
    Memory._badBoyArray = _.uniq(_.filter(Memory._badBoyArray, (p) => p !== null && p !== undefined));
    Memory._enemies = _.uniq(_.filter(Memory._enemies, (p) => p !== null && p !== undefined));
    Memory._nuisance = _.uniq(_.filter(Memory._nuisance, (p) => p !== null && p !== undefined));
    Memory._threatList = _.uniq(_.filter(Memory._threatList, (p) => p !== null && p !== undefined));
}