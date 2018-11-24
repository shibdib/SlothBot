module.exports = function (grunt) {
    let config = require('./.screeps.json');
    let host = grunt.option('host');
    let options = config[host];

    grunt.loadNpmTasks('grunt-screeps');

    if (host !== 'mmo') {
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
    } else {
        grunt.initConfig({
            screeps: {
                options: {
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
    }
};