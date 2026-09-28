<?php
// Smoke test against a running module started with NOTES_MOCK_AUTH=1.
//
//   php tests/smoke_test.php [base_url]      default: http://localhost:8794/notes
//
// Exercises the six-route contract, the data API, validation, authentication and the origin
// allow list. Needs the curl extension.
declare(strict_types=1);

$base = rtrim($argv[1] ?? 'http://localhost:8794/notes', '/');
$results = [];
$expect = function (string $name, bool $condition) use (&$results): void {
    $results[] = [$condition, $name];
};

function call(string $base, string $method, string $path, ?array $body = null, array $headers = []): array
{
    $curl = curl_init($base . $path);
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $body !== null ? json_encode($body) : null,
        CURLOPT_PROXY => '',
        CURLOPT_NOPROXY => '*',
        CURLOPT_TIMEOUT => 10,
    ]);
    $text = (string) curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    return [$status, $text];
}

[$status, $text] = call($base, 'GET', '/dev/en/Desktop/menu');
$menu = json_decode($text, true) ?? [];
$expect('menu answers 200 with nodes', $status === 200 && !empty($menu['nodes']));
$expect('menu mid is a number', is_int($menu['nodes'][0]['mid'] ?? null));

[$status, $text] = call($base, 'GET', '/dev/fa/Desktop/page/1');
$expect('page 1 answers 200 with widgets', $status === 200 && !empty(json_decode($text, true)['groups'][0]['widgets']));
$expect('unknown page answers 404', call($base, 'GET', '/dev/en/Desktop/page/999')[0] === 404);
$expect('sidebarMenu answers 200', call($base, 'GET', '/dev/en/Desktop/sidebarMenu/1')[0] === 200);
[$status, $text] = call($base, 'GET', '/dev/en/Desktop/sidebarmenu/2');
$expect('missing sidebar answers empty nodes', $status === 200 && $text === '{"nodes":[]}');

[$status, $text] = call($base, 'GET', '/dev/en/Desktop/widget/101');
$expect('widget answers HTML', $status === 200 && str_contains($text, 'id="notesListWidget"'));
$expect('widget tokens are substituted', !str_contains($text, '[##'));
$expect('stylesheet asset answers 200', call($base, 'GET', '/asset/notes.css')[0] === 200);
$expect('unsupported asset answers 404', call($base, 'GET', '/asset/notes.png')[0] === 404);

[$status, $text] = call($base, 'POST', '/dev/api/notes', ['title' => 'smoke test', 'body' => 'created by smoke_test.php']);
$noteId = $status === 200 ? (json_decode($text, true)['note']['id'] ?? null) : null;
$expect('create note answers 200', is_int($noteId));
[$status, $text] = call($base, 'GET', '/dev/api/notes');
$ids = array_column(json_decode($text, true)['notes'] ?? [], 'id');
$expect('list contains the new note', $status === 200 && in_array($noteId, $ids, true));
$expect('empty title answers 400', call($base, 'POST', '/dev/api/notes', ['title' => ''])[0] === 400);
$expect('delete note answers 200', call($base, 'DELETE', "/dev/api/notes/{$noteId}")[0] === 200);
$expect('delete again answers 404', call($base, 'DELETE', "/dev/api/notes/{$noteId}")[0] === 404);

[$status, $text] = call($base, 'GET', '/not-a-session/en/Desktop/menu');
$expect('invalid session answers 401 Invalid rKey', $status === 401 && str_contains($text, 'Invalid rKey'));
$expect('unknown origin answers 403',
    call($base, 'GET', '/dev/api/notes', null, ['Origin: https://unknown.example'])[0] === 403);

$failed = 0;
foreach ($results as [$ok, $name]) {
    echo ($ok ? 'PASS' : 'FAIL') . " {$name}\n";
    $failed += $ok ? 0 : 1;
}
echo (count($results) - $failed) . '/' . count($results) . " passed\n";
exit($failed ? 1 : 0);
