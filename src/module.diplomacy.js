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
        let threat = Memory._badBoyList[key];
        if (threat.lastAction + 25 < Game.time) {
            newRating = threat.threatRating - 2;
            if (newRating <= 0) {
                delete Memory._badBoyList[key];
                log.w(key + ' is no longer considered a threat.');
                continue;
            } else {
                Memory._badBoyList[key].threatRating = newRating;
            }
        }
        if (Memory._badBoyList[key].threatRating > 1000) {
            Memory._enemies.push(key);
        } else {
            Memory._enemies = _.filter(Memory._enemies, (e) => e !== key);
        }
        if (Memory._badBoyList[key].threatRating > 25) {
            Memory._nuisance.push(key);
        } else {
            Memory._nuisance = _.filter(Memory._nuisance, (e) => e !== key);
        }
        if (Memory._badBoyList[key].threatRating > 5) {
            Memory._threatList.push(key);
        } else {
            Memory._threatList = _.filter(Memory._threatList, (e) => e !== key);
        }
        let length = 10 - (Memory._badBoyList[key].threatRating.toString().length + 1);
        let display = key.substring(0, length) + '-' + Memory._badBoyList[key].threatRating;
        Memory._badBoyArray.push(display);
    }
    if (Game.time % 100 === 0) {
        log.a('Current Enemies: ' + Memory._enemies);
        log.a('Current Nuisances: ' + Memory._nuisance);
        log.a('Current Threats: ' + Memory._threatList);
    }
}