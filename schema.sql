-- ============================================================================
-- Sistema de Medição / Relatório Fotográfico (Medição Pro)
-- Esquema de banco de dados (PostgreSQL)
-- ============================================================================
--
-- IMPORTANTE: o sistema hoje NÃO usa um banco SQL. Ele guarda os dados assim:
--   - Pasta data/ em disco (arquivos .json), quando roda em servidor próprio
--     (é o caso da Hostoo: /public_html/medicao/app/data);
--   - IndexedDB do navegador, quando hospedado na Vercel ou na Netlify (sem
--     servidor com armazenamento persistente).
-- Este arquivo representa, em formato de banco relacional, a mesma estrutura
-- de dados que o sistema já usa (registro -> ocorrências -> anexos). Ele
-- serve como documentação e como ponto de partida caso um dia decidam migrar
-- para um banco de verdade (Postgres, MySQL, SQLite etc.). Hoje o código do
-- sistema (lib/storage.js) não lê nem grava neste esquema.
--
-- Compatibilidade: escrito para PostgreSQL. Para MySQL: trocar TEXT[] por
-- tabela própria (já não é usado aqui), UUID por CHAR(36) ou usar a extensão
-- uuid, e TIMESTAMPTZ por DATETIME. Para SQLite: trocar UUID por TEXT e
-- remover os tipos específicos do Postgres (basta ver os comentários).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensão para gerar UUID (gen_random_uuid). Em Postgres >= 13 normalmente
-- já vem habilitada como pgcrypto ou nativa (gen_random_uuid()).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- USUÁRIOS
-- Corresponde a data/users.json (lib/auth.js). Login por e-mail + senha
-- (hash scrypt), sessão guardada em cookie assinado.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  email         TEXT PRIMARY KEY,              -- normalizado em minúsculas
  name          TEXT NOT NULL,
  role          TEXT,                          -- opcional (ex.: "gestor")
  password_hash TEXT NOT NULL,                 -- formato: scrypt$N$r$p$salt$hash
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ARQUIVOS (fotos e documentos anexados)
-- Corresponde ao que fica em data/files/<id> (meta.json + part-0, part-1...)
-- e é servido por /api/files?id=<id>. O conteúdo binário fica em file_parts
-- (dividido em partes de até 3 MB, do jeito que o sistema já faz upload em
-- pedaços) para não estourar limites de linha/registro do banco.
-- ---------------------------------------------------------------------------
CREATE TABLE files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name     TEXT,                          -- nome original do arquivo
  content_type  TEXT,                          -- ex.: image/jpeg, application/pdf
  total_bytes   BIGINT NOT NULL DEFAULT 0,
  parts_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE file_parts (
  file_id       UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  part_index    INTEGER NOT NULL,
  data          BYTEA NOT NULL,
  PRIMARY KEY (file_id, part_index)
);

-- ---------------------------------------------------------------------------
-- REGISTROS (medições)
-- Corresponde ao objeto "record" salvo em data/records/<id>.json e retornado
-- por /api/records. Os campos abaixo vêm de record.metadata.
-- ---------------------------------------------------------------------------
CREATE TABLE records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia        TEXT,                     -- ex.: "09/2026"
  ordem_servico       TEXT,                     -- OS geral do registro (pode ser sobrescrita por ocorrência)
  contratada         TEXT,
  tipo_manutencao     TEXT,                     -- preventiva / corretiva / emergencial ...
  created_by_email    TEXT REFERENCES users(email) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_exported_at    TIMESTAMPTZ,
  last_export_format  TEXT                      -- pdf | docx | pptx | xlsx
);

-- ---------------------------------------------------------------------------
-- OCORRÊNCIAS (activities)
-- Cada registro tem uma ou mais ocorrências (record.activities[]). Cada
-- ocorrência pode ter até 4 fotos (2 "antes", 2 "depois") com legenda cada.
-- ---------------------------------------------------------------------------
CREATE TABLE activities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id             UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  position              INTEGER NOT NULL,        -- ordem de exibição dentro do registro (0, 1, 2...)

  data_antes            DATE,
  data_depois           DATE,
  ordem_servico          TEXT,                    -- OS específica da ocorrência (pode diferir da do registro)
  responsavel           TEXT,
  atividade             TEXT,                    -- descrição do serviço/ocorrência
  status                TEXT NOT NULL DEFAULT 'concluida'
                           CHECK (status IN ('concluida', 'em-espera')),
  motivo                TEXT,                    -- obrigatório quando status = 'em-espera'

  foto_antes_id          UUID REFERENCES files(id) ON DELETE SET NULL,
  foto_depois_id         UUID REFERENCES files(id) ON DELETE SET NULL,
  foto_antes2_id         UUID REFERENCES files(id) ON DELETE SET NULL,
  foto_depois2_id        UUID REFERENCES files(id) ON DELETE SET NULL,

  legenda_antes          TEXT,
  legenda_depois         TEXT,
  legenda_antes2         TEXT,
  legenda_depois2        TEXT,

  -- Quando uma ocorrência salva individualmente está "vinculada" a uma
  -- ocorrência dentro de outro registro (parentLink no app.js).
  parent_record_id       UUID REFERENCES records(id) ON DELETE SET NULL,
  parent_activity_index  INTEGER,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (record_id, position)
);

CREATE INDEX idx_activities_record_id ON activities(record_id);
CREATE INDEX idx_records_updated_at ON records(updated_at DESC);
CREATE INDEX idx_records_competencia ON records(competencia);

-- ---------------------------------------------------------------------------
-- Trigger simples para manter updated_at em dia (opcional).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
