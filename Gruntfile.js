module.exports = function (grunt) {
    let config = require('./.screeps.json');
    let host = grunt.option('host') || 'swc';
    let options = config[host];

    grunt.loadNpmTasks('grunt-screeps');

    grunt.initConfig({
        screeps: {
            options: {
                server: {
                    host: options.host,
                    port: 21025,
                    http: true
                },
                email: options.email,
                password: options.password,
                branch: options.branch,
                ptr: options.ptr
            },
            dist: {
                src: ['src/*.js']
            }
        }
    });
};