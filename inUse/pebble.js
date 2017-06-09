"use strict";
const resources = require('resources');

// Feeds information into my Pebble Time Round
// See: https://github.com/bthaase/ScreepsTime
// Call this after Memory.stats is configured!

// We use Memory.pebble and Memory.pebble_meta

// TODOs
// 1. Store the maximum enemy count for the last 10 minutes and show it on the watch
// 2. Store any GCL or RCL changes for the last 2 hours and point it out


// Important data:
// 1. Emergency creeps spawned
// 2. Enemy creeps around
// 3. RCL/GCL changes
// 4. Storage energy reserves low
// 5. CPU bucket used up
// 6. Wall or rampart level low
// 7. Tower energy low

const LAST_ENEMY_TICK = ['pebble_meta', 'last_enemy'];
const LAST_ENEMY_TIME = ['pebble_meta', 'last_enemy_time'];
const ENEMY_TICKS_ALERT = 300; // Alert for 300 ticks

function send_to_pebble() {

    const ris = resources.summarize_rooms();

    // Show our progress to next GCL
    const gclPct = Game.gcl.progress / Game.gcl.progressTotal * 100.0;
    const gclText = "GCL " + gclPct.toFixed(1);

    // Show our progress to next RCL (for closest one)
    const rclPct = _.max(Object.keys(ris).map(k => ris[k].controller_progress / ris[k].controller_needed)) * 100.0;
    const rclText = "RCL " + rclPct.toFixed(1);
    const rclColor = rclPct < 90 ? "#002200" : "#005500";
    // console.log('Pebble RCL:', rclPct, rclText, rclColor);

    // Enemies in the last five minutes
    let lastEnemy = _.get(Memory, LAST_ENEMY_TICK, 0);
    let lastEnemyTime = _.get(Memory, LAST_ENEMY_TIME, "");
    const numEnemies = _.sum(ris, r => r.num_enemies);
    if (numEnemies > 0) {
        lastEnemy = Game.time;
        lastEnemyTime = new Date().toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit'
        });
        console.log('Pebble enemies!', numEnemies, lastEnemy, lastEnemyTime);
    }
    _.set(Memory, LAST_ENEMY_TICK, lastEnemy);
    _.set(Memory, LAST_ENEMY_TIME, lastEnemyTime);

    let enemyText = '';
    let enemyColor = "#000000";
    let enemyColor2 = "#000000"
    let enemyBlink = false;
    let enemyProgress = 0;

    if (lastEnemy + ENEMY_TICKS_ALERT >= Game.time) {
        enemyText = numEnemies + ' EN ' + lastEnemyTime;
        enemyColor = '#7F0000';
        enemyColor2 = '#2F0000';
        enemyBlink = false;
        // Progress from 80% to 20% over those ticks
        enemyProgress = 60 * (1.0 - (Game.time - lastEnemy) / ENEMY_TICKS_ALERT) + 20;
    }


    Memory.pebble = {
        vibrate: 0,
        0: {
            progress: gclPct,
            bold: false,
            blink: false,
            bgColor: "#00007F",
            bgSecondColor: null,
            textColor: "#FFFFFF",
            textSecondColor: null,
            text: gclText
        },
        1: {
            progress: rclPct,
            bold: false,
            blink: false,
            bgColor: rclColor,
            bgSecondColor: null,
            textColor: "#FFFFFF",
            textSecondColor: null,
            text: rclText
        },
        2: {
            progress: enemyProgress,
            bold: false,
            blink: enemyBlink,
            bgColor: enemyColor,
            bgSecondColor: enemyColor2,
            textColor: "#FFFFFF",
            textSecondColor: null,
            text: enemyText
        },
        // 3: { progress: 70, bold: false, blink: false, bgColor: "#0000FF", bgSecondColor: "#000066", textColor: "#CCCCCC", textSecondColor: null, text: "Bucket: 7357" },
        3: {
            progress: 0,
            bold: false,
            blink: false,
            bgColor: '#000000',
            bgSecondColor: null,
            textColor: "#CCCCCC",
            textSecondColor: null,
            text: ""
        },
    };
} // send_to_pebble

module.exports = {
    send_to_pebble,
};