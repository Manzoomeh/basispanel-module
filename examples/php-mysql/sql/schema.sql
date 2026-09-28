-- Notes module schema (MySQL 8). Every row belongs to one business (dmnid).
CREATE TABLE IF NOT EXISTS notes (
    id         INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dmnid      INT           NOT NULL,
    ownerid    INT           NOT NULL,
    userid     INT           NOT NULL,
    title      VARCHAR(200)  NOT NULL,
    body       TEXT          NOT NULL,
    created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_notes_dmnid (dmnid, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
