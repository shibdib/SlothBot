module.exports = function (grunt) {

    grunt.loadNpmTasks('grunt-screeps');

    grunt.initConfig({
        screeps: {
            options: {
                swc: {
                    server: {
                        host: 'swc.screepspl.us',
                        port: 21025,
                        http: true
                    },
                    email: 'e',
                    password: 'pass',
                    branch: 'default',
                    ptr: false
                },
                server1: {
                    server: {
                        host: 'server1.screepspl.us',
                        port: 21025,
                        http: true
                    },
                    email: 'e',
                    password: 'pass',
                    branch: 'default',
                    ptr: false
                }
            },
            dist: {
                src: ['src/*.js']
            }
        }
    });
    grunt.registerTask('upload', ['screeps:options:swc', 'screeps:options:server1']);
};