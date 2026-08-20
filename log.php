<?php
// api.php — Pixels Client API
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

$DATA_FILE = 'pixels_users.json';
$TIMEOUT = 120; // секунд (2 хвилини) – через цей час гравець вважається офлайн

function loadData() {
    global $DATA_FILE;
    if (!file_exists($DATA_FILE)) return [];
    $content = file_get_contents($DATA_FILE);
    return json_decode($content, true) ?: [];
}

function saveData($data) {
    global $DATA_FILE;
    file_put_contents($DATA_FILE, json_encode($data, JSON_PRETTY_PRINT));
}

$action = $_GET['action'] ?? '';

// ----- Додати/оновити гравця (POST) -----
if ($action === 'update') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['userid']) || !isset($input['game'])) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing userid or game']);
        exit;
    }

    $data = loadData();
    $userid = $input['userid'];
    $game = $input['game'];
    $username = $input['username'] ?? 'Unknown';
    $timestamp = time();

    $data[$userid] = [
        'username' => $username,
        'game' => $game,
        'last_seen' => $timestamp
    ];

    // Видаляємо застарілі записи
    foreach ($data as $id => $info) {
        if ($timestamp - $info['last_seen'] > $TIMEOUT) {
            unset($data[$id]);
        }
    }

    saveData($data);
    echo json_encode(['status' => 'ok']);
    exit;
}

// ----- Отримати список активних гравців (GET) -----
if ($action === 'list') {
    $game = $_GET['game'] ?? '';
    if (!$game) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing game']);
        exit;
    }

    $data = loadData();
    $now = time();
    $users = [];

    foreach ($data as $id => $info) {
        if ($info['game'] == $game && ($now - $info['last_seen'] <= $TIMEOUT)) {
            $users[] = [
                'userid' => (int)$id,
                'username' => $info['username']
            ];
        }
    }

    echo json_encode(['status' => 'ok', 'users' => $users]);
    exit;
}

// ----- Якщо дія не розпізнана -----
http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Invalid action']);
?>
