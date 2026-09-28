<?php
declare(strict_types=1);

namespace Notes;

final class InvalidRkey extends \RuntimeException
{
}

/**
 * Session validation through TrustLogin (checkrkey).
 * The module never logs anyone in: the panel passes the session key (rkey) in the URL and the
 * module asks TrustLogin who the caller is and which company/business is selected right now.
 */
final class Auth
{
    public function __construct(private readonly Config $config)
    {
    }

    /**
     * @return array{rkey:string,userid:int,currentOwnerid:int,currentDmnid:int,lid:int,roles:array}
     */
    public function check(string $rkey): array
    {
        if (!preg_match('/^[A-Za-z0-9-]{1,128}$/', $rkey)) {
            throw new InvalidRkey();
        }
        if ($this->config->mockAuth && $rkey === 'dev') {
            return ['rkey' => 'dev', 'userid' => 1, 'currentOwnerid' => 1, 'currentDmnid' => 1, 'lid' => 1, 'roles' => []];
        }

        $cacheKey = 'notes.rkey.' . $rkey;
        if (function_exists('apcu_fetch')) {
            $cached = apcu_fetch($cacheKey, $found);
            if ($found) {
                return $cached;
            }
        }

        $curl = curl_init($this->config->checkRkeyApi . rawurlencode($rkey));
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);
        if ($body === false || $status !== 200) {
            throw new InvalidRkey(); // network failure: fail closed
        }
        $data = json_decode((string) $body, true);
        if (!is_array($data) || empty($data['checked'])) {
            throw new InvalidRkey();
        }

        // Always scope by the CURRENT selection, never by the user's home company/business.
        $scope = [
            'rkey' => $rkey,
            'userid' => (int) ($data['userid'] ?? 0),
            'currentOwnerid' => (int) ($data['currentOwnerid'] ?? 0),
            'currentDmnid' => (int) ($data['currentDmnid'] ?? 0),
            'lid' => (int) ($data['lid'] ?? 0),
            'roles' => is_array($data['userroles'] ?? null) ? $data['userroles'] : [],
        ];
        if (function_exists('apcu_store')) {
            apcu_store($cacheKey, $scope, 60);
        }
        return $scope;
    }
}
