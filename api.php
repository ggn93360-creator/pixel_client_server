<?php
/**
 * ============================================================
 *  api.php — Pixels Client API
 *  Полный контракт (совпадает с server.js):
 *
 *  POST /api.php?action=heartbeat   регистрация игрока + его модули
 *  GET  /api.php?action=list        список онлайн-игроков
 *  GET  /api.php?action=player&userid=...  данные одного игрока
 *  GET  /api.php?action=all         все игроки (нужен токен)
 *  GET  /api.php?action=stats       статистика
 *  GET  /api.php?action=script      отдача Luau-скрипта
 *  GET  /api.php?action=whitelist   список whitelist (нужен токен)
 *  POST /api.php?action=whitelist   добавить/убрать из whitelist
 *
 *  Старые action'ы (update / list) поддерживаются для совместимости.
 * ============================================================
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token, X-Pixels-Token');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ------------------------------------------------------------- конфиг
$DATA_FILE   = __DIR__ . '/pixels_users.json';
$WL_FILE     = __DIR__ . '/pixels_whitelist.json';
$TTL         = 120;        // секунд без heartbeat -> игрок офлайн
$ADMIN_TOKEN = getenv('ADMIN_TOKEN') ?: 'CHANGE_ME';
$SCRIPT_FILE = __DIR__ . '/server/payload/loader.luau';
$PUBLIC_URL  = getenv('PUBLIC_URL') ?: '';

// ------------------------------------------------------------- утилиты
function respond(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function readJsonFile(string $file): array
{
    if (!is_file($file)) {
        return [];
    }
    $raw = file_get_contents($file);
    if ($raw === false || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function writeJsonFile(string $file, array $data): void
{
    $tmp = $file . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    rename($tmp, $file);
}

function isAdmin(): bool
{
    global $ADMIN_TOKEN;
    $header = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    $query  = $_GET['token'] ?? '';
    return ($header !== '' && hash_equals($ADMIN_TOKEN, $header))
        || ($query !== '' && hash_equals($ADMIN_TOKEN, $query));
}

function isOnline(array $p): bool
{
    global $TTL;
    return (time() - (int)($p['last_seen'] ?? 0)) <= $TTL;
}

function publicPlayer(array $p): array
{
    return [
        'userid'      => (string)($p['userid'] ?? ''),
        'username'    => (string)($p['username'] ?? ''),
        'displayname' => (string)($p['displayname'] ?? $p['username'] ?? ''),
        'game'        => (string)($p['game'] ?? ''),
        'features'    => array_values($p['features'] ?? []),
        'firstSeen'   => (int)($p['first_seen'] ?? 0),
        'lastSeen'    => (int)($p['last_seen'] ?? 0),
        'hits'        => (int)($p['hits'] ?? 0),
        'online'      => isOnline($p),
    ];
}

// ------------------------------------------------------------- роутинг
$action = $_GET['action'] ?? '';

// ---- heartbeat / update (POST) ----
if ($action === 'heartbeat' || $action === 'update') {
    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input) || !isset($input['userid'])) {
        respond(400, ['status' => 'error', 'message' => 'missing userid']);
    }

    $data = readJsonFile($DATA_FILE);
    $players = $data['players'] ?? [];

    $userid = (string)$input['userid'];
    $now = time();
    $features = [];
    if (isset($input['features']) && is_array($input['features'])) {
        foreach ($input['features'] as $f) {
            if (is_string($f)) {
                $features[] = mb_substr($f, 0, 64);
            }
            if (count($features) >= 64) {
                break;
            }
        }
    }

    $existing = $players[$userid] ?? null;
    $players[$userid] = [
        'userid'      => $userid,
        'username'    => mb_substr((string)($input['username'] ?? $existing['username'] ?? ''), 0, 64),
        'displayname' => mb_substr((string)($input['displayname'] ?? $existing['displayname'] ?? $input['username'] ?? ''), 0, 64),
        'game'        => mb_substr((string)($input['game'] ?? $existing['game'] ?? ''), 0, 64),
        'features'    => $features,
        'hwid'        => mb_substr((string)($input['hwid'] ?? $existing['hwid'] ?? ''), 0, 128),
        'first_seen'  => (int)($existing['first_seen'] ?? $now),
        'last_seen'   => $now,
        'hits'        => (int)($existing['hits'] ?? 0) + 1,
    ];

    // чистим совсем протухшие записи
    foreach ($players as $id => $p) {
        if ($now - (int)($p['last_seen'] ?? 0) > $TTL * 60) {
            unset($players[$id]);
        }
    }

    writeJsonFile($DATA_FILE, ['updated' => date('c'), 'players' => $players]);

    respond(200, [
        'status'    => 'ok',
        'userid'    => $userid,
        'online'    => true,
        'features'  => $features,
        'serverTime' => $now * 1000,
    ]);
}

// ---- list ----
if ($action === 'list') {
    $data = readJsonFile($DATA_FILE);
    $players = $data['players'] ?? [];
    $game = (string)($_GET['game'] ?? '');

    $users = [];
    foreach ($players as $p) {
        if (!isOnline($p)) {
            continue;
        }
        if ($game !== '' && (string)($p['game'] ?? '') !== $game) {
            continue;
        }
        $users[] = publicPlayer($p);
    }
    usort($users, fn($a, $b) => $b['lastSeen'] <=> $a['lastSeen']);

    respond(200, ['status' => 'ok', 'users' => $users, 'count' => count($users)]);
}

// ---- player ----
if ($action === 'player') {
    $userid = (string)($_GET['userid'] ?? '');
    $data = readJsonFile($DATA_FILE);
    $p = $data['players'][$userid] ?? null;
    if ($p === null) {
        respond(404, ['status' => 'error', 'message' => 'not found']);
    }
    respond(200, ['status' => 'ok', 'player' => publicPlayer($p)]);
}

// ---- all (admin) ----
if ($action === 'all') {
    if (!isAdmin()) {
        respond(401, ['status' => 'error', 'message' => 'unauthorized']);
    }
    $data = readJsonFile($DATA_FILE);
    $users = array_values(array_map('publicPlayer', $data['players'] ?? []));
    usort($users, fn($a, $b) => $b['lastSeen'] <=> $a['lastSeen']);
    respond(200, ['status' => 'ok', 'users' => $users]);
}

// ---- stats ----
if ($action === 'stats') {
    $data = readJsonFile($DATA_FILE);
    $players = $data['players'] ?? [];

    $online = 0;
    $hits = 0;
    $features = [];
    foreach ($players as $p) {
        if (isOnline($p)) {
            $online++;
        }
        $hits += (int)($p['hits'] ?? 0);
        foreach (($p['features'] ?? []) as $f) {
            $features[$f] = ($features[$f] ?? 0) + 1;
        }
    }
    arsort($features);
    $top = [];
    foreach (array_slice($features, 0, 12, true) as $name => $count) {
        $top[] = ['name' => $name, 'count' => $count];
    }

    $wl = readJsonFile($WL_FILE);

    respond(200, ['status' => 'ok', 'stats' => [
        'total'       => count($players),
        'online'      => $online,
        'onlineNow'   => $online,
        'totalHits'   => $hits,
        'whitelist'   => count($wl['ids'] ?? []),
        'topFeatures' => $top,
        'serverTime'  => time() * 1000,
    ]]);
}

// ---- script ----
if ($action === 'script') {
    if (!is_file($SCRIPT_FILE)) {
        respond(404, ['status' => 'error', 'message' => 'script not found']);
    }
    $text = file_get_contents($SCRIPT_FILE) ?: '';
    $text = str_replace('__API__', $PUBLIC_URL, $text);
    $text = str_replace('__TOKEN__', getenv('SESSION_SECRET') ?: '', $text);

    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: inline; filename="loader.luau"');
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: no-cache');
    echo $text;
    exit;
}

// ---- whitelist ----
if ($action === 'whitelist') {
    if (!isAdmin()) {
        respond(401, ['status' => 'error', 'message' => 'unauthorized']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input') ?: '', true);
        $userid = (string)($input['userid'] ?? '');
        if ($userid === '') {
            respond(400, ['status' => 'error', 'message' => 'missing userid']);
        }
        $wl = readJsonFile($WL_FILE);
        $ids = $wl['ids'] ?? [];
        if (!empty($input['remove'])) {
            $ids = array_values(array_filter($ids, fn($x) => (string)$x !== $userid));
        } else {
            $ids[] = $userid;
            $ids = array_values(array_unique($ids));
        }
        writeJsonFile($WL_FILE, ['updated' => date('c'), 'ids' => $ids]);
        respond(200, ['status' => 'ok', 'ids' => $ids, 'action' => !empty($input['remove']) ? 'removed' : 'added']);
    }

    $wl = readJsonFile($WL_FILE);
    respond(200, ['status' => 'ok', 'ids' => $wl['ids'] ?? [], 'count' => count($wl['ids'] ?? [])]);
}

respond(400, ['status' => 'error', 'message' => 'Invalid action']);
