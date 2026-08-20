<?php
// log.php — приймає ID та записує у файл

header('Content-Type: application/json');

// Отримуємо JSON з тіла запиту
$input = file_get_contents('php://input');
$data = json_decode($input, true);

// Якщо дані коректні
if ($data && isset($data['userid'])) {
    $userid = $data['userid'];
    $username = $data['username'] ?? 'unknown';
    $script = $data['script'] ?? 'PixelsClient';
    $timestamp = $data['timestamp'] ?? time();
    $game = $data['game'] ?? 'unknown';

    // Форматуємо запис
    $logEntry = date('Y-m-d H:i:s', $timestamp) . " | ID: $userid | Name: $username | Game: $game | Script: $script\n";

    // Записуємо у файл
    file_put_contents('logs.txt', $logEntry, FILE_APPEND | LOCK_EX);

    // Відповідаємо успіхом
    echo json_encode(['status' => 'ok', 'message' => 'Logged']);
} else {
    // Якщо помилка
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid data']);
}
?>
