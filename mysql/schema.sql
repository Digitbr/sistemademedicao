-- ============================================================================
-- Sistema de Medição / Relatório Fotográfico (Medição Pro)
-- Esquema de banco de dados (MySQL / MariaDB)
-- ============================================================================
--
-- IMPORTANTE: o sistema hoje NÃO usa um banco SQL. Ele guarda os dados assim:
--   - Pasta data/ em disco (arquivos .json), quando roda em servidor próprio
--     (é o caso da Hostoo: /public_html/medicao/app/data);
--   - IndexedDB do navegador, quando hospedado na Vercel ou na Netlify (sem
--     servidor com armazenamento persistente).
-- Este arquivo é a versão MySQL/MariaDB de ../schema.sql (que é a versão
-- PostgreSQL). Representa, em formato de banco relacional, a mesma estrutura
-- de dados que o sistema já usa (registro -> ocorrências -> anexos). Serve
-- como documentação e como ponto de partida caso um dia decidam migrar para
-- um banco de verdade. Hoje o código do sistema (lib/storage.js) NÃO lê nem
-- grava neste esquema — é só referência/backup, igual ao schema.sql da raiz.
--
-- Testado em MariaDB 10.11 (compatível com MySQL 8.0+).
-- Principais diferenças em relação à versão PostgreSQL:
--   - UUID              -> CHAR(36)
--   - gen_random_uuid()  -> UUID() (gerado pela aplicação/script, não default)
--   - TIMESTAMPTZ        -> DATETIME
--   - BYTEA              -> LONGBLOB
--   - decode(x,'base64') -> FROM_BASE64(x)
--   - trigger/plpgsql    -> DELIMITER + trigger nativo do MySQL
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- USUÁRIOS
-- Corresponde a data/users.json (lib/auth.js). Login por e-mail + senha
-- (hash scrypt), sessão guardada em cookie assinado.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  email         VARCHAR(255) PRIMARY KEY,      -- normalizado em minúsculas
  name          TEXT NOT NULL,
  role          TEXT,                          -- opcional (ex.: "gestor")
  password_hash TEXT NOT NULL,                 -- formato: scrypt$N$r$p$salt$hash
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- ARQUIVOS (fotos e documentos anexados)
-- Corresponde ao que fica em data/files/<id> (meta.json + part-0, part-1...)
-- e é servido por /api/files?id=<id>. O conteúdo binário fica em file_parts
-- (dividido em partes de até 3 MB, do jeito que o sistema já faz upload em
-- pedaços) para não estourar limites de linha/registro do banco.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS file_parts;
DROP TABLE IF EXISTS files;
CREATE TABLE files (
  id            CHAR(36) PRIMARY KEY,          -- gerar com UUID() na aplicação
  file_name     TEXT,                          -- nome original do arquivo
  content_type  TEXT,                          -- ex.: image/jpeg, application/pdf
  total_bytes   BIGINT NOT NULL DEFAULT 0,
  parts_count   INT NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE file_parts (
  file_id       CHAR(36) NOT NULL,
  part_index    INT NOT NULL,
  data          LONGBLOB NOT NULL,
  PRIMARY KEY (file_id, part_index),
  CONSTRAINT fk_file_parts_file
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- REGISTROS (medições)
-- Corresponde ao objeto "record" salvo em data/records/<id>.json e retornado
-- por /api/records. Os campos abaixo vêm de record.metadata.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS records;
CREATE TABLE records (
  id                  CHAR(36) PRIMARY KEY,     -- gerar com UUID() na aplicação
  competencia         TEXT,                     -- ex.: "09/2026"
  ordem_servico        TEXT,                     -- OS geral do registro (pode ser sobrescrita por ocorrência)
  contratada          TEXT,
  tipo_manutencao      TEXT,                     -- preventiva / corretiva / emergencial ...
  created_by_email     VARCHAR(255),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_exported_at     DATETIME,
  last_export_format   TEXT,                     -- pdf | docx | pptx | xlsx
  CONSTRAINT fk_records_created_by
    FOREIGN KEY (created_by_email) REFERENCES users(email) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- OCORRÊNCIAS (activities)
-- Cada registro tem uma ou mais ocorrências (record.activities[]). Cada
-- ocorrência pode ter até 4 fotos (2 "antes", 2 "depois") com legenda cada.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS activities;
CREATE TABLE activities (
  id                     CHAR(36) PRIMARY KEY,   -- gerar com UUID() na aplicação
  record_id              CHAR(36) NOT NULL,
  position               INT NOT NULL,           -- ordem de exibição dentro do registro (0, 1, 2...)

  data_antes             DATE,
  data_depois            DATE,
  ordem_servico           TEXT,                   -- OS específica da ocorrência (pode diferir da do registro)
  responsavel            TEXT,
  atividade              TEXT,                   -- descrição do serviço/ocorrência
  status                 VARCHAR(20) NOT NULL DEFAULT 'concluida',

  motivo                 TEXT,                   -- obrigatório quando status = 'em-espera'

  foto_antes_id           CHAR(36),
  foto_depois_id          CHAR(36),
  foto_antes2_id          CHAR(36),
  foto_depois2_id         CHAR(36),

  legenda_antes           TEXT,
  legenda_depois          TEXT,
  legenda_antes2          TEXT,
  legenda_depois2         TEXT,

  -- Quando uma ocorrência salva individualmente está "vinculada" a uma
  -- ocorrência dentro de outro registro (parentLink no app.js).
  parent_record_id        CHAR(36),
  parent_activity_index   INT,

  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_activities_record_position (record_id, position),

  CONSTRAINT chk_activities_status CHECK (status IN ('concluida', 'em-espera')),

  CONSTRAINT fk_activities_record
    FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE,
  CONSTRAINT fk_activities_foto_antes
    FOREIGN KEY (foto_antes_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_activities_foto_depois
    FOREIGN KEY (foto_depois_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_activities_foto_antes2
    FOREIGN KEY (foto_antes2_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_activities_foto_depois2
    FOREIGN KEY (foto_depois2_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_activities_parent_record
    FOREIGN KEY (parent_record_id) REFERENCES records(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_activities_record_id ON activities(record_id);
CREATE INDEX idx_records_updated_at ON records(updated_at DESC);
CREATE INDEX idx_records_competencia ON records(competencia(191));

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Observação sobre updated_at: as colunas já usam
-- "ON UPDATE CURRENT_TIMESTAMP" acima, que é o jeito nativo do MySQL/MariaDB
-- de manter esse campo em dia — não precisa de trigger para isso (diferente
-- do Postgres, que não tem essa cláusula). Os triggers abaixo existem só
-- para quem preferir explícito/compatível com bancos mais antigos.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_records_updated_at;
DROP TRIGGER IF EXISTS trg_activities_updated_at;

DELIMITER $$

CREATE TRIGGER trg_records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
BEGIN
  SET NEW.updated_at = CURRENT_TIMESTAMP;
END$$

CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW
BEGIN
  SET NEW.updated_at = CURRENT_TIMESTAMP;
END$$

DELIMITER ;
