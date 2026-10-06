<?php
// voltage_for_interns.php - Accepts URL query params like:
// voltage_for_interns.php?voltage_value=230&mac_address=AA:BB:CC:DD:EE:FF&motor_id=MTR-8001&status=POWER_ON

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/db.php';

// Get parameters from GET query string or POST body
$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true);
if (!$body) {
    $body = $_POST;
}

$rawMac = isset($_GET['mac_address']) ? $_GET['mac_address'] : (isset($_GET['macAddress']) ? $_GET['macAddress'] : (isset($body['mac_address']) ? $body['mac_address'] : (isset($body['macAddress']) ? $body['macAddress'] : '')));

$voltageRaw = isset($_GET['voltage_value']) ? $_GET['voltage_value'] : (isset($_GET['voltage']) ? $_GET['voltage'] : (isset($body['voltage_value']) ? $body['voltage_value'] : (isset($body['voltage']) ? $body['voltage'] : null)));

$statusRaw = isset($_GET['status']) ? $_GET['status'] : (isset($_GET['status_value']) ? $_GET['status_value'] : (isset($body['status']) ? $body['status'] : (isset($body['status_value']) ? $body['status_value'] : '')));

$motorIdRaw = isset($_GET['motor_id']) ? $_GET['motor_id'] : (isset($_GET['motorId']) ? $_GET['motorId'] : (isset($_GET['motor']) ? $_GET['motor'] : (isset($body['motor_id']) ? $body['motor_id'] : (isset($body['motorId']) ? $body['motorId'] : ''))));

$locationRaw = isset($_GET['location']) ? $_GET['location'] : (isset($_GET['loc']) ? $_GET['loc'] : (isset($body['location']) ? $body['location'] : ''));

if (!$rawMac) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'mac_address query parameter or body field is required']);
    exit();
}

$formattedMac = formatMacAddress($rawMac);
$numericVoltage = round((float)($voltageRaw !== null ? $voltageRaw : 0), 2);
$db = loadDb();

$finalMotorId = trim($motorIdRaw) ? trim($motorIdRaw) : '';
$finalLocation = trim($locationRaw) ? trim($locationRaw) : '';

// Find matched registered device by MAC address AND Motor ID
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

// Calculate status: >= 180V = POWER ON, < 80V = POWER OFF or use status parameter if passed
$status = ($numericVoltage >= 180) ? 'POWER ON' : 'POWER OFF';
if ($statusRaw) {
    $cleanStatus = strtoupper(str_replace('_', ' ', trim($statusRaw)));
    if ($cleanStatus === 'ON' || $cleanStatus === 'POWER ON') {
        $status = 'POWER ON';
    } elseif ($cleanStatus === 'OFF' || $cleanStatus === 'POWER OFF') {
        $status = 'POWER OFF';
    } else {
        $status = $cleanStatus;
    }
}

$timestamp = formatTimestamp();

$newLog = [
    'id' => 'LOG-' . substr(time(), -6),
    'timestamp' => $timestamp,
    'macAddress' => $formattedMac,
    'motorId' => $finalMotorId,
    'location' => $finalLocation,
    'deviceType' => $finalDeviceType,
    'voltage' => $numericVoltage,
    'status' => $status
];

array_unshift($db['voltageLogs'], $newLog);
saveDb($db);

http_response_code(201);
echo json_encode([
    'success' => true,
    'message' => 'Voltage reading recorded successfully',
    'log' => $newLog
]);
