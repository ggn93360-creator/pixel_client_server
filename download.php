<?php
// download.php — отдача файлов клиента с правильными заголовками.
//
// Использование:
//   download.php?file=client/Pixels.exe
//   download.php?file=client/Pixels.exe&name=Pixels.exe
//
// Работает на любом PHP-хостинге. На GitHub Pages PHP не исполняется —
// там файл и так отдаётся как application/octet-stream.

declare(strict_types=1);

$ROOT = __DIR__ . '/';

// Белый список: отдавать можно только эти файлы
$ALLOWED = [
    'client/Pixels.exe' => 'application/vnd.microsoft.portable-executable',
];

$file = $_GET['file'] ?? 'client/Pixels.exe';
$file = str_replace('\\', '/', $file);
$file = ltrim($file, '/');

// Защита от path traversal
if (strpos($file, '..') !== false || !isset($ALLOWED[$file])) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Not found";
    exit;
}

$path = $ROOT . $file;
if (!is_file($path)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Not found";
    exit;
}

$size = filesize($path);
$name = isset($_GET['name']) ? basename((string)$_GET['name']) : basename($file);

$mime = $ALLOWED[$file];
$start  = 0;
$end    = $size - 1;

// Поддержка докачки (Range)
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
    if ($m[1] !== '') $start = (int)$m[1];
    if ($m[2] !== '') $end = (int)$m[2];
    if ($start > $end || $start >= $size) {
        http_response_code(416);
        header("Content-Range: bytes */{$size}");
        exit;
    }
    http_response_code(206);
    header("Content-Range: bytes {$start}-{$end}/{$size}");
}

$length = $end - $start + 1;

header('Content-Type: ' . $mime);
header('Content-Disposition: attachment; filename="' . $name . '"');
header('Content-Length: ' . $length);
header('Accept-Ranges: bytes');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=86400');

$fp = fopen($path, 'rb');
fseek($fp, $start);
$remaining = $length;

while ($remaining > 0 && !feof($fp)) {
    $chunk = fread($fp, (int) min(8192, $remaining));
    if ($chunk === false) break;
    echo $chunk;
    $remaining -= strlen($chunk);
    flush();
}
fclose($fp);
exit;
