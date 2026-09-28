<?php
declare(strict_types=1);

namespace Notes;

/**
 * The module: the six-route panel contract, the notes data API and the local shell simulator.
 * handle() returns [status, headers, body]; public/index.php writes it out.
 */
final class Module
{
    private readonly Auth $auth;
    private readonly Content $content;
    private readonly Store $store;

    public function __construct(private readonly Config $config)
    {
        $this->auth = new Auth($config);
        $this->content = new Content($config);
        $this->store = new Store($config);
    }

    /** @return array{0:int, 1:array<string,string>, 2:string} */
    public function handle(string $method, string $path, ?string $origin, string $rawBody): array
    {
        $method = strtoupper($method);
        $path = trim($path, '/');
        $segments = explode('/', $path);
        $cors = $this->corsHeaders($origin);

        if ($this->config->devShell && $path === 'dev/shell') {
            return [200, ['Content-Type' => 'text/html; charset=utf-8'], $this->content->devShell()];
        }
        if ($segments[0] !== $this->config->prefix) {
            return $this->error(404, 'route not found', $cors);
        }

        // Assets: no authentication, never token-processed.
        $count = count($segments);
        if (($count === 3 && $segments[1] === 'asset')
            || ($count === 7 && $segments[4] === 'widget' && $segments[5] === 'asset')) {
            $asset = $this->content->asset($segments[$count - 1]);
            return $asset
                ? [200, ['Content-Type' => $asset['mime'], 'Cache-Control' => 'max-age=300'] + $cors, $asset['content']]
                : $this->error(404, 'asset not found', $cors);
        }

        // A browser request from an origin that is not allowed is refused.
        if ($origin !== null && $origin !== '' && $cors === []) {
            return $this->error(403, 'origin not allowed', []);
        }
        if ($method === 'OPTIONS') {
            return [204, $cors, ''];
        }

        try {
            $scope = $this->auth->check($segments[1] ?? '');
        } catch (InvalidRkey) {
            return $this->json(401, ['errorid' => 1, 'message' => 'Invalid rKey'], $cors);
        }

        if (($segments[2] ?? '') === 'api' && ($segments[3] ?? '') === 'notes' && $count <= 5) {
            return $this->api($method, $segments[4] ?? null, $rawBody, $scope, $cors);
        }
        if ($method === 'GET' && $count >= 5) {
            return $this->contract($segments, $scope, $cors);
        }
        return $this->error(404, 'route not found', $cors);
    }

    private function contract(array $segments, array $scope, array $cors): array
    {
        [, , $culture, $device, $kind] = $segments;
        $id = $segments[5] ?? '';
        $culture = $this->content->culture($culture);
        if (!Content::isSegment($device)) {
            return $this->error(404, 'invalid device', $cors);
        }
        $allowed = $this->allowed($scope);

        if ($kind === 'menu' && count($segments) === 5) {
            if (!$allowed) {
                return $this->json(200, ['nodes' => []], $cors);
            }
            $menu = $this->content->json('menu', $device, 'menu.json', $scope, $culture);
            return $menu ? $this->json(200, $menu, $cors) : $this->error(404, 'menu not found', $cors);
        }
        if (count($segments) !== 6 || !Content::isSegment($id)) {
            return $this->error(404, 'route not found', $cors);
        }
        switch ($kind) {
            case 'page':
                if (!$allowed) {
                    return $this->json(200, new \stdClass(), $cors);
                }
                $page = $this->content->json('pages', $device, "{$id}.json", $scope, $culture);
                return $page ? $this->json(200, $page, $cors) : $this->error(404, 'page not found', $cors);
            // The panel calls sidebarMenu with a capital M; accept the lower-case form too.
            case 'sidebarMenu':
            case 'sidebarmenu':
                $sidebar = $allowed ? $this->content->json('sidebars', $device, "{$id}.json", $scope, $culture) : null;
                return $this->json(200, $sidebar ?? ['nodes' => []], $cors); // missing sidebar is normal
            case 'widget':
                if (!$allowed) {
                    return [200, ['Content-Type' => 'text/html; charset=utf-8'] + $cors, ''];
                }
                $html = $this->content->widget($device, $id, $scope, $culture);
                return $html !== null
                    ? [200, ['Content-Type' => 'text/html; charset=utf-8', 'Cache-Control' => 'no-store'] + $cors, $html]
                    : $this->error(404, 'widget not found', $cors);
        }
        return $this->error(404, 'route not found', $cors);
    }

    private function api(string $method, ?string $noteId, string $rawBody, array $scope, array $cors): array
    {
        $dmnid = $scope['currentDmnid'];
        if (!$this->allowed($scope)) {
            return ($method === 'GET' && $noteId === null)
                ? $this->json(200, ['notes' => [], 'count' => 0], $cors)
                : $this->error(404, 'module not available for this business', $cors);
        }
        if ($noteId === null && $method === 'GET') {
            return $this->json(200, ['notes' => $this->store->list($dmnid), 'count' => $this->store->count($dmnid)], $cors);
        }
        if ($noteId === null && $method === 'POST') {
            $body = json_decode($rawBody, true);
            $body = is_array($body) ? $body : [];
            $title = trim((string) ($body['title'] ?? ''));
            $text = trim((string) ($body['body'] ?? ''));
            if (mb_strlen($title) < 1 || mb_strlen($title) > 200) {
                return $this->error(400, 'title must be 1 to 200 characters', $cors);
            }
            if (mb_strlen($text) > 4000) {
                return $this->error(400, 'body must be at most 4000 characters', $cors);
            }
            $note = $this->store->create($dmnid, $scope['currentOwnerid'], $scope['userid'], $title, $text);
            return $this->json(200, ['note' => $note], $cors);
        }
        if ($noteId !== null && $method === 'DELETE') {
            if (!ctype_digit($noteId) || (int) $noteId < 1) {
                return $this->error(400, 'invalid note id', $cors);
            }
            return $this->store->delete($dmnid, (int) $noteId)
                ? $this->json(200, ['deleted' => (int) $noteId], $cors)
                : $this->error(404, 'note not found', $cors);
        }
        return $this->error(405, 'method not allowed', $cors);
    }

    // Soft tenant gate: a business that is not allowed receives empty answers, not errors.
    private function allowed(array $scope): bool
    {
        return $this->config->allowedDmnIds === [] || in_array($scope['currentDmnid'], $this->config->allowedDmnIds, true);
    }

    /** CORS headers for an allowed origin; [] when there is no origin or it is not allowed. */
    private function corsHeaders(?string $origin): array
    {
        $origin = rtrim((string) $origin, '/');
        $allowed = $this->config->allowedOrigins;
        if ($this->config->devShell) {
            $allowed[] = $this->config->publicBaseUrl;
        }
        if ($origin === '' || !in_array($origin, $allowed, true)) {
            return [];
        }
        return [
            'Access-Control-Allow-Origin' => $origin,
            'Vary' => 'Origin',
            'Access-Control-Allow-Methods' => 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers' => 'Content-Type',
        ];
    }

    private function json(int $status, array|object $value, array $headers): array
    {
        return [$status, ['Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'no-store'] + $headers,
            json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)];
    }

    private function error(int $status, string $message, array $headers): array
    {
        return $this->json($status, ['errorCode' => "http-{$status}", 'errorMessage' => $message], $headers);
    }
}
