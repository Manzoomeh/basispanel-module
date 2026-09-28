<?php
declare(strict_types=1);

namespace Notes;

/**
 * Content files and token substitution.
 *
 *   menu/<device>/menu.json   pages/<device>/<pid>.json   sidebars/<device>/<pid>.json
 *   widgets/<device>/<widgetID>.html
 *
 * Tokens:
 *   JSON      "[##mid##]"  "[##dmnid##]"  [##rkey##]  [##t.<key>##]
 *   widgets   [##cms.cms.rkey|cms.cookie.rkey##]  [##cms.cms.dmnid##]  [##module.baseurl##]
 *             [##module.stylesheet##]  [##module.culture##]  [##module.dir##]  [##t.<key>##]
 */
final class Content
{
    private const ASSET_MIME = [
        'css' => 'text/css; charset=utf-8',
        'js' => 'application/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'svg' => 'image/svg+xml',
    ];
    private const RTL = ['fa', 'ar', 'he', 'ur'];
    private const TRANSLATION = '/\[##t\.([A-Za-z0-9_.]+)##\]/';

    /** @var array<string, array<string, string>> */
    private array $translations = [];

    public function __construct(private readonly Config $config)
    {
    }

    public static function isSegment(string $value): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_-]{1,64}$/', $value);
    }

    public function culture(string $value): string
    {
        $culture = strtolower($value);
        return self::isSegment($culture) && is_file("{$this->config->root}/i18n/{$culture}.json") ? $culture : 'en';
    }

    /** @return array<string, string> */
    private function t(string $culture): array
    {
        return $this->translations[$culture] ??=
            json_decode((string) file_get_contents("{$this->config->root}/i18n/{$culture}.json"), true);
    }

    // Device folders are lower-case; the panel may send "Desktop".
    private function path(string $folder, string $device, string $name): string
    {
        return "{$this->config->root}/{$folder}/" . strtolower($device) . "/{$name}";
    }

    /** Read a JSON content file and substitute its tokens; null when the file is missing. */
    public function json(string $folder, string $device, string $name, array $scope, string $culture): ?array
    {
        $path = $this->path($folder, $device, $name);
        if (!is_file($path)) {
            return null;
        }
        $dictionary = $this->t($culture);
        $text = preg_replace_callback(self::TRANSLATION,
            fn ($m) => substr(json_encode($dictionary[$m[1]] ?? $m[1], JSON_UNESCAPED_UNICODE), 1, -1),
            (string) file_get_contents($path));
        // The quotes are part of the token: the result is a JSON number.
        $text = str_replace(
            ['"[##mid##]"', '"[##dmnid##]"', '[##rkey##]'],
            [(string) $this->config->moduleId, (string) $scope['currentDmnid'], $scope['rkey']],
            $text);
        return json_decode($text, true, 512, JSON_THROW_ON_ERROR);
    }

    /** Read a widget and substitute its tokens; null when the file is missing. */
    public function widget(string $device, string $widgetId, array $scope, string $culture): ?string
    {
        $path = $this->path('widgets', $device, "{$widgetId}.html");
        if (!is_file($path)) {
            return null;
        }
        $dictionary = $this->t($culture);
        $html = preg_replace_callback(self::TRANSLATION,
            fn ($m) => htmlspecialchars($dictionary[$m[1]] ?? $m[1], ENT_QUOTES),
            (string) file_get_contents($path));
        return strtr($html, [
            '[##cms.cms.rkey|cms.cookie.rkey##]' => $scope['rkey'],
            '[##cms.cms.dmnid##]' => (string) $scope['currentDmnid'],
            '[##module.baseurl##]' => $this->config->moduleBaseUrl(),
            '[##module.stylesheet##]' => $this->config->stylesheetUrl ?: $this->config->moduleBaseUrl() . '/asset/notes.css',
            '[##module.culture##]' => $culture,
            '[##module.dir##]' => in_array($culture, self::RTL, true) ? 'rtl' : 'ltr',
        ]);
    }

    /**
     * Single path segment, text types only (css, js, json, svg), never token-processed.
     * @return array{mime:string, content:string}|null
     */
    public function asset(string $fileName): ?array
    {
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $path = "{$this->config->root}/assets/{$fileName}";
        if (!preg_match('/^[A-Za-z0-9_.-]{1,128}$/', $fileName) || !isset(self::ASSET_MIME[$extension]) || !is_file($path)) {
            return null;
        }
        return ['mime' => self::ASSET_MIME[$extension], 'content' => (string) file_get_contents($path)];
    }

    public function devShell(): string
    {
        return str_replace('[##module.baseurl##]', $this->config->moduleBaseUrl(),
            (string) file_get_contents("{$this->config->root}/dev/shell.html"));
    }
}
