<?php
declare(strict_types=1);

namespace Notes;

use PDO;

/** MySQL storage through PDO. Every query is scoped to the business (dmnid) selected in the session. */
final class Store
{
    private ?PDO $pdo = null;

    public function __construct(private readonly Config $config)
    {
    }

    private function db(): PDO
    {
        return $this->pdo ??= new PDO($this->config->dbDsn, $this->config->dbUser, $this->config->dbPassword, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    public function list(int $dmnid, int $limit = 200): array
    {
        $statement = $this->db()->prepare(
            "SELECT id, userid, title, body, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
               FROM notes WHERE dmnid = ? ORDER BY id DESC LIMIT ?");
        $statement->bindValue(1, $dmnid, PDO::PARAM_INT);
        $statement->bindValue(2, $limit, PDO::PARAM_INT);
        $statement->execute();
        return array_map(fn (array $row) => ['id' => (int) $row['id'], 'userid' => (int) $row['userid']] + $row,
            $statement->fetchAll());
    }

    public function count(int $dmnid): int
    {
        $statement = $this->db()->prepare('SELECT COUNT(*) FROM notes WHERE dmnid = ?');
        $statement->execute([$dmnid]);
        return (int) $statement->fetchColumn();
    }

    /** @return array<string, mixed> */
    public function create(int $dmnid, int $ownerid, int $userid, string $title, string $body): array
    {
        $statement = $this->db()->prepare(
            'INSERT INTO notes (dmnid, ownerid, userid, title, body) VALUES (?, ?, ?, ?, ?)');
        $statement->execute([$dmnid, $ownerid, $userid, $title, $body]);
        $id = (int) $this->db()->lastInsertId();
        $statement = $this->db()->prepare(
            "SELECT id, userid, title, body, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
               FROM notes WHERE id = ?");
        $statement->execute([$id]);
        $row = $statement->fetch();
        return ['id' => (int) $row['id'], 'userid' => (int) $row['userid']] + $row;
    }

    public function delete(int $dmnid, int $id): bool
    {
        $statement = $this->db()->prepare('DELETE FROM notes WHERE id = ? AND dmnid = ?');
        $statement->execute([$id, $dmnid]);
        return $statement->rowCount() > 0;
    }
}
