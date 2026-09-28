<?php
// Notes — a BasisPanel module in PHP with MySQL. Front controller: every request comes here
// (Apache rewrite in .htaccess, or `php -S localhost:8794 public/index.php`).
declare(strict_types=1);

$root = dirname(__DIR__);
spl_autoload_register(static function (string $class) use ($root): void {
    if (str_starts_with($class, 'Notes\\')) {
        $file = $root . '/src/' . substr($class, 6) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});
// Auth.php also declares InvalidRkey.
require_once $root . '/src/Auth.php';

$config = new Notes\Config($root);
$module = new Notes\Module($config);

try {
    [$status, $headers, $body] = $module->handle(
        $_SERVER['REQUEST_METHOD'] ?? 'GET',
        rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH)),
        $_SERVER['HTTP_ORIGIN'] ?? null,
        (string) file_get_contents('php://input'),
    );
} catch (Throwable $error) {
    error_log('notes module: ' . $error);
    [$status, $headers, $body] = [500, ['Content-Type' => 'application/json; charset=utf-8'],
        '{"errorCode":"http-500","errorMessage":"internal error"}'];
}

http_response_code($status);
foreach ($headers as $name => $value) {
    header("{$name}: {$value}");
}
echo $body;
