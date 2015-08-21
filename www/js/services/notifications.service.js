(function () {
    'use strict';

    angular
        .module('orange')
        .factory('notifications', notifications);

    notifications.$inject = ['$rootScope', '$q', '$state', '$cordovaLocalNotification', 'Patient'];

    /* @ngInject */
    function notifications($rootScope, $q, $state, $cordovaLocalNotification, Patient) {
        var id = 0;

        $rootScope.$on('$cordovaLocalNotification:click', _clickNotifyEvent);
        $rootScope.$on('auth:user:logout', clearNotify);

        return {
            updateNotify: updateNotify,
            clearNotify: clearNotify,
            addNotifyByMedication: addNotifyByMedication
        };

        ////////////////

        //Update notifications
        function updateNotify() {
            if (!($rootScope.isIOS || $rootScope.isAndroid)) {
                return;
            }

            $cordovaLocalNotification.clearAll();
            var patient = Patient.getPatient();
            patient.then(_fetchPatientData);
        }

        function _fetchPatientData(patient) {
            var schedulePromise = patient.all('schedule').getList();
            var medPromise = patient.all('medications').getList();

            $q.all([medPromise, schedulePromise]).then(function(data) {
                var medications = data[0];
                var schedule = data[1];
                _scheduleNotify(medications, schedule);
            });
        }

        function _scheduleNotify(medications, schedule) {
            var notifications = {};
            _.each(schedule, function(item) {
                var date = moment(item.date);
                if (date < moment()) {
                    return;
                }

                var medication = _.find(medications, function(med) {
                    return med.id == item.medication_id
                });

                if (_.isUndefined(medication)) {
                    return;
                }


                var messageText = 'You need to take ' + medication.name + ' at ' +
                    moment(item.date).format('hh:mm A');

                var data = {
                  event: item
                };

                var scheduleOptions = {
                    id: id,
                    title: 'Take ' + medication.name,
                    text: messageText,
                    at: new Date(item.notification),
                    data: JSON.stringify(data)
                };

                //Combine notify by date
                if (!(date.format() in notifications)) {
                    notifications[date.format()] = [];
                }
                notifications[date.format()].push(scheduleOptions);

                id++;
            });

            //Schedule
            _.each(notifications, function(notify) {
                $cordovaLocalNotification.schedule(notify);
            });
        }

        //Clear All Notifications
        function clearNotify() {
            if (!($rootScope.isIOS || $rootScope.isAndroid)) {
                return;
            }

            $cordovaLocalNotification.clearAll();
        }

        function addNotifyByMedication(medication) {
            if (!($rootScope.isIOS || $rootScope.isAndroid)) {
                return;
            }

            var patient = Patient.getPatient();
            patient.then(function(pat) {
                pat.all('schedule').getList().then(function(schedule) {
                    _scheduleNotify([medication], schedule)
                });
            })
        }

        function _clickNotifyEvent (ev, notification, state) {
            if (!$rootScope.initialized) {
                $rootScope.$watch('initialized', function(newValue, oldValue) {
                    if (newValue) {
                        $state.go('app.today.schedule');
                    }

                });
                return;
            }

            var todayPromise = $state.go('app.today.schedule');
            console.log(todayPromise)
        }

    }

    function guid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16).substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }

})();
