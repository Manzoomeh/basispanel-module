<?php
declare(strict_types=1);

namespace Notes;

/**
 * Configuration from environment variables (and an optional .env file in the example root).
 * Registration values (module id, allowed businesses, origins) are platform data: never guessed.
 */
final class Config
{
    public readonly string $root;
    public readonly string $prefix;
    public readonly string $publicBaseUrl;
    public readonly int $moduleId;
    /** @var int[] */
    public readonly array $allowedDmnIds;
    /** @var string[] */
    public readonly array $allowedOrigins;
    public readonly string $checkRkeyApi;
    public readonly bool $mockAuth;
    public readonly bool $devShell;
    public readonly string $stylesheetUrl;
    public readonly string $dbDsn;
    public readonly string $dbUser;
    public readonly string $dbPassword;

    public function __construct(string $root)
    {
        $this->root = $root;
        self::loadDotenv($root . '/.env');

        $this->prefix = self::env('NOTES_PREFIX', 'notes');
        // Absolute base URL the browser uses to reach this service (widget rule R2).
        $this->publicBaseUrl = rtrim(self::env('NOTES_PUBLIC_BASE_URL', 'http://localhost:8794'), '/');
        // Registered module id (mid). 0 = not registered yet.
        $this->moduleId = (int) self::env('NOTES_MODULE_ID', '0');
        // Businesses (currentDmnid) the module answers. Empty = no gate (development only).
        $this->allowedDmnIds = array_map('intval', self::list('NOTES_ALLOWED_DMN_IDS'));
        // Browser origins allowed to call this module (the panel's origin).
        $this->allowedOrigins = self::list('NOTES_ALLOWED_ORIGINS');
        $this->checkRkeyApi = self::env('CHECK_RKEY_API', 'https://api.trust-login.com/checkrkey/');
        // Accept the session key "dev" without calling TrustLogin. Never enable in production.
        $this->mockAuth = self::flag('NOTES_MOCK_AUTH');
        // Serve the local shell simulator at /dev/shell. Never enable in production.
        $this->devShell = self::flag('NOTES_DEV_SHELL');
        // Shared platform stylesheet. Empty = this module's demo stylesheet.
        $this->stylesheetUrl = self::env('NOTES_STYLESHEET_URL', '');

        $host = self::env('NOTES_DB_HOST', '127.0.0.1');
        $port = self::env('NOTES_DB_PORT', '3306');
        $name = self::env('NOTES_DB_NAME', 'notes');
        $this->dbDsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
        $this->dbUser = self::env('NOTES_DB_USER', 'notes');
        $this->dbPassword = self::env('NOTES_DB_PASSWORD', '');
    }

    public function moduleBaseUrl(): string
    {
        return "{$this->publicBaseUrl}/{$this->prefix}";
    }

    private static function env(string $name, string $default): string
    {
        $value = getenv($name);
        return ($value === false || $value === '') ? $default : trim($value);
    }

    private static function flag(string $name): bool
    {
        return in_array(strtolower(self::env($name, '0')), ['1', 'true', 'yes', 'on'], true);
    }

    /** @return string[] */
    private static function list(string $name): array
    {
        $items = preg_split('/[,;]/', self::env($name, '')) ?: [];
        return array_values(array_filter(array_map(fn ($x) => rtrim(trim($x), '/'), $items), 'strlen'));
    }

    private static function loadDotenv(string $path): void
    {
        if (!is_file($path)) {
            return;
        }
        foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode('=', $line, 2));
            if (getenv($key) === false) {
                putenv("{$key}={$value}");
            }
        }
    }
}
