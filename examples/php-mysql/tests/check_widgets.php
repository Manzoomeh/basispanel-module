<?php
// Check every widget against the seven widget rules and the content-file contract.
//
//   php tests/check_widgets.php
//
// Runs without the service, the database or the platform. Exit code 0 = all checks passed.
declare(strict_types=1);

$root = dirname(__DIR__);
$failures = [];
$fail = function (string $where, string $rule, string $detail) use (&$failures): void {
    $failures[] = "{$where}: {$rule} - {$detail}";
};

function topLevelDeclarations(string $script): array
{
    $cleaned = preg_replace('~//[^\n]*|/\*.*?\*/|\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*"|`(?:\\\\.|[^`\\\\])*`~s', "''", $script);
    preg_match_all('/[{}]|\b(?:const|let)\s+[A-Za-z_$][\w$]*/', (string) $cleaned, $matches);
    $depth = 0;
    $found = [];
    foreach ($matches[0] as $token) {
        if ($token === '{') {
            $depth++;
        } elseif ($token === '}') {
            $depth--;
        } elseif ($depth === 0) {
            $found[] = $token;
        }
    }
    return $found;
}

$widgets = glob("{$root}/widgets/desktop/*.html") ?: [];
foreach ($widgets as $path) {
    $where = 'widgets/desktop/' . basename($path);
    $html = (string) file_get_contents($path);
    preg_match_all('~<script[^>]*>(.*?)</script>~is', $html, $scriptMatches);
    $scripts = implode("\n", $scriptMatches[1]);
    $markup = (string) preg_replace('~<script[^>]*>.*?</script>~is', '', $html);

    if (preg_match('/<style\b/i', $markup)) {
        $fail($where, 'R1', '<style> block present');
    }
    preg_match_all('/(?:src|href)\s*=\s*"([^"]+)"/', $markup, $urls);
    foreach ($urls[1] as $url) {
        if (!preg_match('~^(https?://|\[##|#|mailto:)~', $url)) {
            $fail($where, 'R2', "relative URL '{$url}'");
        }
    }
    if (preg_match('/fonts\.googleapis|fonts\.gstatic|cdnjs|jsdelivr|unpkg/i', $html)) {
        $fail($where, 'R3', 'external asset host');
    }
    foreach (topLevelDeclarations($scripts) as $declaration) {
        $fail($where, 'R4', "top-level '{$declaration}'");
    }
    if (!preg_match('/<div[^>]*\bid="([^"]+)"/', $markup, $rootMatch)) {
        $fail($where, 'R5', 'no root element with an id');
    } elseif (trim($scripts) !== '' && !str_contains($scripts, "'#{$rootMatch[1]}'")) {
        $fail($where, 'R5', "script does not query from root #{$rootMatch[1]}");
    }
    if (trim($scripts) !== '' && !preg_match('/window\.[A-Z0-9_]+_BUILD\s*=/', $scripts)) {
        $fail($where, 'R6', 'no build marker window.<NAME>_BUILD');
    }
    if (preg_match('/<basis\b(?![^>]*run="AtClient")[^>]*triggers=/i', $html)) {
        $fail($where, 'R7', 'client-side <basis> command without run="AtClient"');
    }
    if (preg_match('/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i', $html)) {
        $fail($where, 'security', 'literal GUID (possible session key) in the file');
    }
}

// Content consistency: every menu node uses the mid token, every pid has a page, every
// widget in a page has a file, and moduleid equals the menu mid.
$menu = json_decode((string) file_get_contents("{$root}/menu/desktop/menu.json"), true);
$pids = [];
$walk = function (array $nodes) use (&$walk, &$pids, $fail): void {
    foreach ($nodes as $node) {
        if (($node['mid'] ?? null) !== '[##mid##]') {
            $fail('menu/desktop/menu.json', 'mid', "node '" . ($node['title'] ?? '?') . "' must use \"[##mid##]\"");
        }
        if (isset($node['pid'])) {
            $pids[(string) $node['pid']] = true;
        }
        $walk($node['nodes'] ?? []);
    }
};
$walk($menu['nodes'] ?? []);
foreach (array_keys($pids) as $pid) {
    $pagePath = "{$root}/pages/desktop/{$pid}.json";
    if (!is_file($pagePath)) {
        $fail('menu/desktop/menu.json', 'pid', "page {$pid} has no pages/desktop/{$pid}.json");
        continue;
    }
    $page = json_decode((string) file_get_contents($pagePath), true);
    foreach ($page['groups'] ?? [] as $group) {
        foreach ($group['widgets'] ?? [] as $widget) {
            if (($widget['moduleid'] ?? null) !== '[##mid##]') {
                $fail("pages/desktop/{$pid}.json", 'moduleid', 'must equal the menu mid token');
            }
            if (!is_file("{$root}/widgets/desktop/{$widget['id']}.html")) {
                $fail("pages/desktop/{$pid}.json", 'widget', "widget {$widget['id']} has no file");
            }
        }
    }
}

echo 'checked ' . count($widgets) . " widgets\n";
foreach ($failures as $line) {
    echo "FAIL {$line}\n";
}
echo $failures ? count($failures) . " problem(s)\n" : "OK\n";
exit($failures ? 1 : 0);
