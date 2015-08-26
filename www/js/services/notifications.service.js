(function () {
    'use strict';

    angular
        .module('orange')
        .factory('notifications', notifications);

    notifications.$inject = ['$rootScope', '$q', '$timeout', '$state', '$cordovaLocalNotification', 'Patient', '$localstorage'];

    /* @ngInject */
    function notifications($rootScope, $q, $timeout, $state, $cordovaLocalNotification, Patient, $localstorage) {
        var id = 0;

        $rootScope.$on('$cordovaLocalNotification:click', _clickNotifyEvent);
        $rootScope.$on('$cordovaLocalNotification:trigger', _triggerNotifyEvent);
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

            function _cancelCurrent() {
                var patient = Patient.getPatient();
                patient.then(_fetchPatientData);

                var triggeredEvents = $localstorage.getObject('triggeredEvents');
                $cordovaLocalNotification.getAllIds().then(function(ids) {
                    var clearIds = ids;
                    if (!_.isUndefined(triggeredEvents)) {
                        clearIds = _.filter(ids, function(id) {
                            return _.isUndefined(_.find(triggeredEvents, function(event) {
                                return event.id == id
                            }))
                        });
                    }

                    $cordovaLocalNotification.clear(clearIds);
                    $cordovaLocalNotification.cancel(clearIds).then(function() {
                    });
                });
            }

            if ($rootScope.isAndroid) {
                _cancelCurrent();
                return;
            }

            $cordovaLocalNotification.hasPermission().then(function(result) {
                if (!result) {
                    var registerPromise = $cordovaLocalNotification.promptForPermission();
                    registerPromise.then(function() {
                        updateNotify();
                    });
                    return;
                }

                _cancelCurrent();
            });
        }

        function _fetchPatientData(patient) {
            var schedulePromise = patient.all('schedule').getList({
                end_date: moment().date(moment().date() + 1).format('YYYY-MM-DD')
            });
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
                if (date < moment() || item.dose_id) {
                    return;
                }

                //Check medication
                var medication = _.find(medications, function(med) {
                    return med.id == item.medication_id
                });

                if (_.isUndefined(medication)) {
                    return;
                }

                //Check if already triggered
                if (_checkTriggered(item)) {
                    return;
                }

                //Set Text
                var messageText = 'You need to take ' + medication.name + ' at ' +
                    moment(item.date).format('hh:mm A');

                var data = {
                  event: item
                };

                var schDate = new Date(item.notification);
                var scheduleOptions = {
                    id: id,
                    title: 'Take ' + medication.name,
                    text: messageText,
                    at: schDate,
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
            if ($rootScope.isIOS) {
                _schNotify(notifications);
                return;
            }

            _.each(notifications, function(notify) {
                $cordovaLocalNotification.schedule(notify)
            });
        }

        function _checkTriggered(event) {
            var triggeredEvents = $localstorage.getObject('triggeredEvents');
            return !_.isUndefined(_.find(triggeredEvents, function(triggered) {
                return triggered.date == event.date &&
                    triggered.scheduled == event.scheduled &&
                    triggered.medication_id == event.medication_id
            }))
        }

        function _schNotify(notifications) {
            var firstKey = _.keys(notifications)[0];
            if (!_.isUndefined(firstKey)) {
                $cordovaLocalNotification.schedule(notifications[firstKey]).finally(function() {
                    delete notifications[firstKey];
                    _schNotify(notifications);
                })
            }
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
                pat.all('schedule').getList({
                    medication_id: medication.id,
                    end_date: moment().date(moment().date() + 1).format('YYYY-MM-DD')
                }).then(function(schedule) {
                    _scheduleNotify([medication], schedule)
                });
            })
        }

        function _clickNotifyEvent (ev, notification, state) {
            $cordovaLocalNotification.clear([notification.id]);

            if (!$rootScope.initialized) {
                $rootScope.$watch('initialized', function(newValue, oldValue) {
                    if (newValue) {
                        $state.go('app.today.schedule');

                        //Success init today listener
                        $rootScope.$on('$stateChangeSuccess',  function(event, toState, toParams, fromState, fromParams) {
                            if (toState.name == 'app.today.schedule') {
                                //Delay for init today
                                $timeout(function() {
                                    $rootScope.$emit('today:click:notification', notification);
                                    $rootScope.$$listeners['action2@$stateChangeSuccess'] = [];
                                })
                            }
                        })
                    }

                });
                return;
            }

            $state.go('app.today.schedule').finally(function() {
                $rootScope.$emit('today:click:notification', notification);
            });
        }

        function _triggerNotifyEvent (ev, notification, state) {
            console.log('Triggered:', notification);
            var event = JSON.parse(notification.data).event;
            var triggered = [{
                id: notification.id,
                date: event.date,
                scheduled: event.scheduled,
                medication_id: event.medication_id
            }];

           var triggeredEvents = $localstorage.getObject('triggeredEvents');
            if (_.isUndefined(triggeredEvents)) {
                $localstorage.setObject('triggeredEvents', triggered);
                return;
            }
            $localstorage.setObject('triggeredEvents', _.union(triggered, triggeredEvents));
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

