<?php
// api.php - REST API Router for Voltage Sensor & Motor Monitoring

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/db.php';

// Determine URI / Route Endpoint
$uri = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'];

// Parse route from GET parameter or PATH_INFO
$endpoint = isset($_GET['endpoint']) ? $_GET['endpoint'] : '';
if (!$endpoint && isset($_SERVER['PATH_INFO'])) {
    $endpoint = trim($_SERVER['PATH_INFO'], '/');
}
if (!$endpoint) {
    // Check request URL path
    $path = parse_url($uri, PHP_URL_PATH);
    if (strpos($path, 'voltage-logs') !== false) {
        $endpoint = 'voltage-logs';
    } elseif (strpos($path, 'devices') !== false) {
        $endpoint = 'devices';
    } elseif (strpos($path, 'simulate') !== false) {
        $endpoint = 'simulate';
    } elseif (strpos($path, 'stats') !== false) {
        $endpoint = 'stats';
    }
}

// Get JSON Input Body
$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true);
if (!$body) {
    $body = $_POST;
}

// -------------------------------------------------------------
// REST API ROUTING
// -------------------------------------------------------------

switch ($endpoint) {

    // =========================================================
    // 1. DEVICES ENDPOINTS (GET & POST & DELETE)
    // =========================================================
    case 'devices':
        if ($method === 'GET') {
            $db = loadDb();
            echo json_encode(['success' => true, 'count' => count($db['devices']), 'devices' => $db['devices']]);
            exit();
        } 
        
        if ($method === 'POST') {
            $macAddress = isset($body['macAddress']) ? $body['macAddress'] : (isset($body['mac']) ? $body['mac'] : '');
            $location = isset($body['location']) ? $body['location'] : 'Default Location';
            $deviceType = isset($body['deviceType']) ? $body['deviceType'] : 'Standard Voltage Sensor';
            $motorId = isset($body['motorId']) ? $body['motorId'] : '';
            $voltageThreshold = isset($body['voltageThreshold']) ? (float)$body['voltageThreshold'] : 180;

            if (!$macAddress) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'MAC Address is required']);
                exit();
            }

            $formattedMac = formatMacAddress($macAddress);
            $db = loadDb();

            if (!$motorId || !trim($motorId)) {
                $motorId = 'MTR-' . rand(1000, 9999);
            }

            // Check if device already exists
            $existingIndex = -1;
            foreach ($db['devices'] as $idx => $d) {
                if ($d['macAddress'] === $formattedMac) {
                    $existingIndex = $idx;
                    break;
                }
            }

            if ($existingIndex >= 0) {
                // Update
                $db['devices'][$existingIndex]['location'] = $location;
                $db['devices'][$existingIndex]['deviceType'] = $deviceType;
                $db['devices'][$existingIndex]['motorId'] = $motorId;
                $db['devices'][$existingIndex]['voltageThreshold'] = $voltageThreshold;
                $db['devices'][$existingIndex]['updatedAt'] = date('Y-m-d H:i:s');
                $deviceRecord = $db['devices'][$existingIndex];
            } else {
                // Create
                $deviceRecord = [
                    'id' => 'DEV-' . substr(time(), -4),
                    'macAddress' => $formattedMac,
                    'location' => $location,
                    'deviceType' => $deviceType,
                    'motorId' => $motorId,
                    'voltageThreshold' => $voltageThreshold,
                    'createdAt' => date('c')
                ];
                $db['devices'][] = $deviceRecord;

                // Auto-create initial log entry
                $initialLog = [
                    'id' => 'LOG-' . substr(time(), -6),
                    'timestamp' => formatTimestamp(),
                    'macAddress' => $formattedMac,
                    'motorId' => $motorId,
                    'location' => $location,
                    'deviceType' => $deviceType,
                    'voltage' => 230.0,
                    'status' => 'POWER ON'
                ];
                array_unshift($db['voltageLogs'], $initialLog);
            }

            saveDb($db);
            http_response_code(201);
            echo json_encode([
                'success' => true,
                'message' => $existingIndex >= 0 ? 'Device updated successfully' : 'Device created successfully',
                'device' => $deviceRecord
            ]);
            exit();
        }

        if ($method === 'DELETE') {
            $id = isset($_GET['id']) ? $_GET['id'] : '';
            $db = loadDb();
            $initialCount = count($db['devices']);
            $db['devices'] = array_values(array_filter($db['devices'], function($d) use ($id) {
                return $d['id'] !== $id && $d['macAddress'] !== $id;
            }));

            if (count($db['devices']) === $initialCount) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Device not found']);
                exit();
            }

            deleteDeviceFromDb($id);
            saveDb($db);
            echo json_encode(['success' => true, 'message' => 'Device deleted successfully']);
            exit();
        }
        break;

    // =========================================================
    // 2. MAIN VOLTAGE SENSOR CREATE API (POST /api/voltage-logs)
    // =========================================================
    case 'voltage-logs':
        if ($method === 'POST' || (isset($_GET['mac_address']) && isset($_GET['voltage_value']))) {
            $rawMac = isset($_GET['mac_address']) ? $_GET['mac_address'] : (isset($_GET['macAddress']) ? $_GET['macAddress'] : (isset($body['macAddress']) ? $body['macAddress'] : (isset($body['mac_address']) ? $body['mac_address'] : '')));
            $voltageRaw = isset($_GET['voltage_value']) ? $_GET['voltage_value'] : (isset($_GET['voltage']) ? $_GET['voltage'] : (isset($body['voltage']) ? $body['voltage'] : (isset($body['voltage_value']) ? $body['voltage_value'] : 0.0)));
            $statusRaw = isset($_GET['status']) ? $_GET['status'] : (isset($_GET['status_value']) ? $_GET['status_value'] : (isset($body['status']) ? $body['status'] : (isset($body['status_value']) ? $body['status_value'] : '')));
            $motorIdRaw = isset($_GET['motor_id']) ? $_GET['motor_id'] : (isset($_GET['motorId']) ? $_GET['motorId'] : (isset($_GET['motor']) ? $_GET['motor'] : (isset($body['motor_id']) ? $body['motor_id'] : (isset($body['motorId']) ? $body['motorId'] : ''))));
            $locationRaw = isset($_GET['location']) ? $_GET['location'] : (isset($_GET['loc']) ? $_GET['loc'] : (isset($body['location']) ? $body['location'] : ''));

            if (!$rawMac) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'MAC Address is required']);
                exit();
            }

            $formattedMac = formatMacAddress($rawMac);
            $numericVoltage = round((float)$voltageRaw, 2);
            $db = loadDb();

            $finalMotorId = trim($motorIdRaw) ? trim($motorIdRaw) : '';
            $finalLocation = trim($locationRaw) ? trim($locationRaw) : '';

            // Look up associated registered device by MAC address AND Motor ID
            $matchedIndex = -1;
            foreach ($db['devices'] as $idx => $d) {
                if ($d['macAddress'] === $formattedMac && ($finalMotorId ? strcasecmp($d['motorId'], $finalMotorId) === 0 : true)) {
                    $matchedIndex = $idx;
                    break;
                }
            }

            if ($matchedIndex >= 0) {
                if (!$finalMotorId) $finalMotorId = $db['devices'][$matchedIndex]['motorId'];
                if (!$finalLocation) $finalLocation = $db['devices'][$matchedIndex]['location'];
                $finalDeviceType = $db['devices'][$matchedIndex]['deviceType'];
            } else {
                // Auto-register new motor binding for this MAC address
                if (!$finalMotorId) $finalMotorId = 'Motor 1';
                if (!$finalLocation) $finalLocation = 'Farm Station';
                $finalDeviceType = 'ESP32 Voltage Sensor';

                $newDev = [
                    'id' => 'DEV-' . substr(time(), -5) . rand(10, 99),
                    'macAddress' => $formattedMac,
                    'motorId' => $finalMotorId,
                    'location' => $finalLocation,
                    'deviceType' => $finalDeviceType,
                    'voltageThreshold' => 180,
                    'createdAt' => date('Y-m-d H:i:s')
                ];
                $db['devices'][] = $newDev;
            }

            // Status Rule: >= 180V is POWER ON, < 80V is POWER OFF or use passed status
            $calculatedStatus = ($numericVoltage >= 180) ? 'POWER ON' : 'POWER OFF';
            if ($statusRaw) {
                $cleanStatus = strtoupper(str_replace('_', ' ', trim($statusRaw)));
                if ($cleanStatus === 'ON' || $cleanStatus === 'POWER ON') {
                    $calculatedStatus = 'POWER ON';
                } elseif ($cleanStatus === 'OFF' || $cleanStatus === 'POWER OFF') {
                    $calculatedStatus = 'POWER OFF';
                } else {
                    $calculatedStatus = $cleanStatus;
                }
            }

            $timestamp = formatTimestamp();

            $logRecord = [
                'id' => 'LOG-' . substr(time(), -6) . rand(10, 99),
                'timestamp' => $timestamp,
                'macAddress' => $formattedMac,
                'motorId' => $finalMotorId,
                'location' => $finalLocation,
                'deviceType' => $finalDeviceType,
                'voltage' => $numericVoltage,
                'status' => $calculatedStatus
            ];

            array_unshift($db['voltageLogs'], $logRecord);
            saveDb($db);

            http_response_code(201);
            echo json_encode([
                'success' => true,
                'message' => 'Voltage sensor reading recorded successfully in database',
                'log' => $logRecord
            ]);
            exit();
        }

        if ($method === 'GET') {
            $db = loadDb();
            $logs = $db['voltageLogs'];

            $startDate = isset($_GET['startDate']) ? $_GET['startDate'] : '';
            $endDate = isset($_GET['endDate']) ? $_GET['endDate'] : '';
            $macAddress = isset($_GET['macAddress']) ? $_GET['macAddress'] : '';
            $motorId = isset($_GET['motorId']) ? $_GET['motorId'] : '';
            $status = isset($_GET['status']) ? $_GET['status'] : '';
            $search = isset($_GET['search']) ? strtolower($_GET['search']) : '';

            // Apply Start Date Filter
            if ($startDate) {
                $startMs = strtotime($startDate . ' 00:00:00');
                $logs = array_values(array_filter($logs, function($l) use ($startMs) {
                    return strtotime($l['timestamp']) >= $startMs;
                }));
            }

            // Apply End Date Filter
            if ($endDate) {
                $endMs = strtotime($endDate . ' 23:59:59');
                $logs = array_values(array_filter($logs, function($l) use ($endMs) {
                    return strtotime($l['timestamp']) <= $endMs;
                }));
            }

            // Apply MAC Filter
            if ($macAddress && $macAddress !== 'ALL') {
                $formattedFilterMac = formatMacAddress($macAddress);
                $logs = array_values(array_filter($logs, function($l) use ($formattedFilterMac) {
                    return $l['macAddress'] === $formattedFilterMac;
                }));
            }

            // Apply Motor Filter
            if ($motorId && $motorId !== 'ALL') {
                $logs = array_values(array_filter($logs, function($l) use ($motorId) {
                    return stripos($l['motorId'], $motorId) !== false;
                }));
            }

            // Apply Status Filter
            if ($status && $status !== 'ALL') {
                $logs = array_values(array_filter($logs, function($l) use ($status) {
                    return strcasecmp($l['status'], $status) === 0;
                }));
            }

            // Apply Search Query Filter
            if ($search) {
                $logs = array_values(array_filter($logs, function($l) use ($search) {
                    return (
                        stripos($l['macAddress'], $search) !== false ||
                        stripos($l['motorId'], $search) !== false ||
                        stripos($l['location'], $search) !== false ||
                        stripos($l['deviceType'], $search) !== false ||
                        stripos((string)$l['voltage'], $search) !== false ||
                        stripos($l['status'], $search) !== false ||
                        stripos($l['timestamp'], $search) !== false
                    );
                }));
            }

            echo json_encode([
                'success' => true,
                'totalRecords' => count($logs),
                'filtersApplied' => compact('startDate', 'endDate', 'macAddress', 'motorId', 'status', 'search'),
                'logs' => array_values($logs)
            ]);
            exit();
        }

        if ($method === 'PUT' || ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'update')) {
            $id = isset($_GET['id']) ? $_GET['id'] : (isset($body['id']) ? $body['id'] : '');
            $db = loadDb();
            
            $logIndex = -1;
            foreach ($db['voltageLogs'] as $idx => $l) {
                if ($l['id'] === $id) {
                    $logIndex = $idx;
                    break;
                }
            }

            if ($logIndex === -1) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Voltage log record not found']);
                exit();
            }

            $existing = $db['voltageLogs'][$logIndex];
            $macAddress = isset($body['macAddress']) ? $body['macAddress'] : $existing['macAddress'];
            $motorId = isset($body['motorId']) ? $body['motorId'] : $existing['motorId'];
            $location = isset($body['location']) ? $body['location'] : $existing['location'];
            $voltage = isset($body['voltage']) ? (float)$body['voltage'] : $existing['voltage'];
            $timestamp = isset($body['timestamp']) ? $body['timestamp'] : $existing['timestamp'];
            
            $status = isset($body['status']) ? $body['status'] : (($voltage >= 180) ? 'POWER ON' : 'POWER OFF');

            $db['voltageLogs'][$logIndex] = [
                'id' => $existing['id'],
                'timestamp' => $timestamp,
                'macAddress' => formatMacAddress($macAddress),
                'motorId' => $motorId,
                'location' => $location,
                'deviceType' => isset($existing['deviceType']) ? $existing['deviceType'] : 'Voltage Sensor',
                'voltage' => round((float)$voltage, 2),
                'status' => $status
            ];

            saveDb($db);
            echo json_encode([
                'success' => true,
                'message' => 'Voltage record updated successfully',
                'log' => $db['voltageLogs'][$logIndex]
            ]);
            exit();
        }

        if ($method === 'DELETE') {
            $id = isset($_GET['id']) ? $_GET['id'] : '';
            $db = loadDb();
            $initialCount = count($db['voltageLogs']);
            $db['voltageLogs'] = array_values(array_filter($db['voltageLogs'], function($l) use ($id) {
                return $l['id'] !== $id;
            }));

            if (count($db['voltageLogs']) === $initialCount) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Log record not found']);
                exit();
            }

            deleteLogFromDb($id);
            saveDb($db);
            echo json_encode(['success' => true, 'message' => 'Voltage log deleted successfully']);
            exit();
        }
        break;

    // =========================================================
    // 3. SIMULATE READINGS ENDPOINT (POST /api/simulate)
    // =========================================================
    case 'simulate':
        if ($method === 'POST') {
            $db = loadDb();
            if (empty($db['devices'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'No devices registered']);
                exit();
            }

            $targetMac = isset($body['macAddress']) ? formatMacAddress($body['macAddress']) : null;
            $device = null;
            if ($targetMac) {
                foreach ($db['devices'] as $d) {
                    if ($d['macAddress'] === $targetMac) {
                        $device = $d;
                        break;
                    }
                }
            }

            if (!$device) {
                $device = $db['devices'][array_rand($db['devices'])];
            }

            // Voltage generator logic (>= 180V for ON, < 80V for OFF)
            if (isset($body['forcePowerOn']) && $body['forcePowerOn']) {
                $voltageVal = round(185 + (mt_rand(0, 600) / 10), 1);
            } elseif (isset($body['forcePowerOff']) && $body['forcePowerOff']) {
                $voltageVal = round(mt_rand(0, 750) / 10, 1);
            } else {
                // 70% ON, 30% OFF
                $voltageVal = (mt_rand(1, 10) > 3) ? round(185 + (mt_rand(0, 600) / 10), 1) : round(mt_rand(0, 750) / 10, 1);
            }

            $status = ($voltageVal >= 180) ? 'POWER ON' : 'POWER OFF';

            $timestamp = formatTimestamp();

            $logRecord = [
                'id' => 'LOG-' . substr(time(), -6) . rand(10, 99),
                'timestamp' => $timestamp,
                'macAddress' => $device['macAddress'],
                'motorId' => $device['motorId'],
                'location' => $device['location'],
                'deviceType' => $device['deviceType'],
                'voltage' => $voltageVal,
                'status' => $status
            ];

            array_unshift($db['voltageLogs'], $logRecord);
            saveDb($db);

            http_response_code(201);
            echo json_encode([
                'success' => true,
                'message' => 'Simulated POST request successfully executed',
                'log' => $logRecord
            ]);
            exit();
        }
        break;

    // =========================================================
    // 4. STATS SUMMARY ENDPOINT (GET /api/stats)
    // =========================================================
    case 'stats':
        $db = loadDb();
        $latestMap = [];
        foreach ($db['voltageLogs'] as $l) {
            if (!isset($latestMap[$l['macAddress']])) {
                $latestMap[$l['macAddress']] = $l['status'];
            }
        }

        $powerOn = 0;
        $powerOff = 0;
        foreach ($latestMap as $s) {
            if ($s === 'POWER ON') $powerOn++;
            else $powerOff++;
        }

        echo json_encode([
            'success' => true,
            'totalDevices' => count($db['devices']),
            'totalLogs' => count($db['voltageLogs']),
            'activePowerOn' => $powerOn,
            'activePowerOff' => $powerOff,
            'lastUpdate' => !empty($db['voltageLogs']) ? $db['voltageLogs'][0]['timestamp'] : 'No logs'
        ]);
        exit();
        break;

    default:
        // Default response for endpoint root
        echo json_encode([
            'success' => true,
            'service' => 'Voltage Sensor & Motor Telemetry PHP API',
            'status' => 'ONLINE',
            'endpoints' => [
                'POST /api.php?endpoint=voltage-logs' => 'Create Voltage Telemetry Record',
                'GET /api.php?endpoint=voltage-logs' => 'Fetch Logs with Selection of Dates',
                'POST /api.php?endpoint=devices' => 'Register New Sensor / Device',
                'GET /api.php?endpoint=devices' => 'List All Devices',
                'POST /api.php?endpoint=simulate' => 'Simulate Sensor Reading',
                'GET /api.php?endpoint=stats' => 'Get Summary Stats'
            ]
        ]);
        exit();
}
