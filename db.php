<?php
// db.php - MySQL Database Management & Storage Helper for Voltage API

date_default_timezone_set('Asia/Kolkata');

define('DB_HOST', '216.172.184.173');
define('DB_USER', 'sunfra_farms');
define('DB_PASS', 'sunfra_farms');
define('DB_NAME', 'sunfra_farms');
define('DB_FILE', __DIR__ . '/data/db.json');

function getPdo() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_TIMEOUT => 5
            ]);
        } catch (PDOException $e) {
            $pdo = false;
        }
    }
    return $pdo;
}

// Format MAC Address to use hyphens '-' (e.g., 00-1B-44-11-3A-B7)
function formatMacAddress($mac) {
    if (!$mac) return '00-00-00-00-00-00';
    $clean = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', $mac));
    if (strlen($clean) === 12) {
        return implode('-', str_split($clean, 2));
    }
    return strtoupper(str_replace(':', '-', trim($mac)));
}

// Format Timestamp YYYY-MM-DD HH:mm:ss in Indian Standard Time (IST, Asia/Kolkata)
function formatTimestamp($datetime = null) {
    if (!$datetime) {
        return gmdate('Y-m-d H:i:s', time() + 19800);
    }
    
    $trimmed = trim((string)$datetime);
    // If string is already formatted as YYYY-MM-DD HH:MM:SS, it is already an IST timestamp string!
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $trimmed)) {
        return $trimmed;
    }
    
    if (is_numeric($datetime)) {
        return gmdate('Y-m-d H:i:s', (int)$datetime + 19800);
    }

    try {
        $d = new DateTime($datetime);
        $d->setTimezone(new DateTimeZone('Asia/Kolkata'));
        return $d->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        return gmdate('Y-m-d H:i:s', time() + 19800);
    }
}

// Save Local JSON DB Sync
function saveJsonDb($data) {
    if (!file_exists(dirname(DB_FILE))) {
        mkdir(dirname(DB_FILE), 0777, true);
    }
    file_put_contents(DB_FILE, json_encode($data, JSON_PRETTY_PRINT));
}

// Load DB from MySQL with JSON fallback
function loadDb() {
    $pdo = getPdo();
    if ($pdo) {
        try {
            $stmtDev = $pdo->query("SELECT * FROM devices ORDER BY createdAt DESC");
            $devices = $stmtDev->fetchAll();

            $stmtLog = $pdo->query("SELECT * FROM voltage_logs ORDER BY timestamp DESC");
            $logs = $stmtLog->fetchAll();

            $formattedDevs = array_map(function($d) {
                return [
                    'id' => $d['id'],
                    'macAddress' => formatMacAddress($d['macAddress']),
                    'motorId' => $d['motorId'],
                    'location' => isset($d['location']) && $d['location'] ? $d['location'] : 'Main Panel - Motor Station',
                    'deviceType' => isset($d['deviceType']) && $d['deviceType'] ? $d['deviceType'] : 'ESP32 Voltage Sensor',
                    'voltageThreshold' => (float)(isset($d['voltageThreshold']) ? $d['voltageThreshold'] : 180),
                    'createdAt' => $d['createdAt']
                ];
            }, $devices);

            $formattedLogs = array_map(function($l) {
                return [
                    'id' => $l['id'],
                    'timestamp' => formatTimestamp($l['timestamp']),
                    'macAddress' => formatMacAddress($l['macAddress']),
                    'motorId' => $l['motorId'],
                    'location' => isset($l['location']) && $l['location'] ? $l['location'] : 'Main Panel - Motor Station',
                    'deviceType' => isset($l['deviceType']) && $l['deviceType'] ? $l['deviceType'] : 'ESP32 Voltage Sensor',
                    'voltage' => round((float)$l['voltage'], 2),
                    'status' => $l['status']
                ];
            }, $logs);

            $data = ['devices' => $formattedDevs, 'voltageLogs' => $formattedLogs];
            saveJsonDb($data);
            return $data;
        } catch (PDOException $e) {}
    }

    if (file_exists(DB_FILE)) {
        $raw = file_get_contents(DB_FILE);
        $data = json_decode($raw, true);
        if ($data && isset($data['devices'])) return $data;
    }

    return ['devices' => [], 'voltageLogs' => []];
}

// Save / Sync DB to MySQL
function saveDb($data) {
    saveJsonDb($data);
    $pdo = getPdo();
    if (!$pdo) return;

    try {
        // Sync devices
        foreach ($data['devices'] as $d) {
            $stmt = $pdo->prepare("INSERT INTO devices (id, macAddress, motorId, location, deviceType, voltageThreshold)
                VALUES (:id, :mac, :motorId, :loc, :devType, :thresh)
                ON DUPLICATE KEY UPDATE motorId=VALUES(motorId), location=VALUES(location), deviceType=VALUES(deviceType)");
            $stmt->execute([
                ':id' => $d['id'],
                ':mac' => formatMacAddress($d['macAddress']),
                ':motorId' => $d['motorId'],
                ':loc' => isset($d['location']) ? $d['location'] : 'Main Panel - Motor Station',
                ':devType' => isset($d['deviceType']) ? $d['deviceType'] : 'ESP32 Voltage Sensor',
                ':thresh' => isset($d['voltageThreshold']) ? $d['voltageThreshold'] : 180
            ]);
        }

        // Sync logs to MySQL DB
        foreach ($data['voltageLogs'] as $l) {
            $stmt = $pdo->prepare("INSERT IGNORE INTO voltage_logs (id, timestamp, macAddress, motorId, location, deviceType, voltage, status)
                VALUES (:id, :ts, :mac, :motorId, :loc, :devType, :volt, :stat)");
            $stmt->execute([
                ':id' => $l['id'],
                ':ts' => $l['timestamp'],
                ':mac' => formatMacAddress($l['macAddress']),
                ':motorId' => $l['motorId'],
                ':loc' => isset($l['location']) ? $l['location'] : 'Main Panel - Motor Station',
                ':devType' => isset($l['deviceType']) ? $l['deviceType'] : 'ESP32 Voltage Sensor',
                ':volt' => $l['voltage'],
                ':stat' => $l['status']
            ]);
        }
    } catch (PDOException $e) {}
}

function deleteDeviceFromDb($id) {
    $pdo = getPdo();
    if (!$pdo || !$id) return;
    try {
        $formattedMac = formatMacAddress($id);
        $stmt = $pdo->prepare("DELETE FROM devices WHERE id = :id OR macAddress = :id OR macAddress = :mac");
        $stmt->execute([':id' => $id, ':mac' => $formattedMac]);
    } catch (PDOException $e) {}
}

function deleteLogFromDb($id) {
    $pdo = getPdo();
    if (!$pdo || !$id) return;
    try {
        $stmt = $pdo->prepare("DELETE FROM voltage_logs WHERE id = :id");
        $stmt->execute([':id' => $id]);
    } catch (PDOException $e) {}
}
