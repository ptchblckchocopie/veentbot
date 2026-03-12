-- Veent Bot Database Schema
-- Requires: PostgreSQL 17+ with pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- FAQ entries with dual embeddings (768 dims = Nomic Embed)
CREATE TABLE IF NOT EXISTS faq_entries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question            TEXT NOT NULL,
    answer              TEXT NOT NULL,
    category            TEXT,
    embedding_combined  vector(768),
    embedding_question  vector(768),
    metadata            JSONB DEFAULT '{}',
    payload_cms_id      TEXT UNIQUE,
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at  TIMESTAMPTZ DEFAULT now(),
    metadata    JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id       UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content          TEXT NOT NULL,
    faq_entry_id     UUID REFERENCES faq_entries(id) ON DELETE SET NULL,
    similarity_score FLOAT,
    tier             TEXT CHECK (tier IN ('exact', 'rag', 'decline')),
    llm_model        TEXT,
    tokens_used      INTEGER DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS semantic_cache (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_embedding vector(768),
    query_text      TEXT NOT NULL,
    response_text   TEXT NOT NULL,
    faq_entry_ids   UUID[],
    created_at      TIMESTAMPTZ DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    hit_count       INTEGER DEFAULT 0
);

-- Continuous learning tables
CREATE TABLE IF NOT EXISTS content_sync_queue (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection   TEXT NOT NULL,
    document_id  TEXT NOT NULL,
    action       TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    payload      JSONB,
    status       TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts     INTEGER DEFAULT 0,
    error        TEXT,
    created_at   TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS content_sync_log (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type         TEXT NOT NULL,
    entries_added     INTEGER DEFAULT 0,
    entries_updated   INTEGER DEFAULT 0,
    entries_removed   INTEGER DEFAULT 0,
    entries_unchanged INTEGER DEFAULT 0,
    duration_ms       INTEGER,
    errors            JSONB DEFAULT '[]',
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id   UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    session_id   UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    rating       TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
    comment      TEXT,
    faq_entry_id UUID REFERENCES faq_entries(id) ON DELETE SET NULL,
    tier         TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faq_gaps (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    representative_question TEXT NOT NULL,
    sample_queries          TEXT[] DEFAULT '{}',
    cluster_size            INTEGER DEFAULT 1,
    priority                TEXT DEFAULT 'low' CHECK (priority IN ('high', 'medium', 'low')),
    suggested_category      TEXT,
    status                  TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
    resolved_faq_id         UUID REFERENCES faq_entries(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ DEFAULT now(),
    reviewed_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS improvement_suggestions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faq_entry_id    UUID NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
    suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('rephrase_question', 'expand_answer', 'create_composite', 'update_stale')),
    suggestion_text TEXT NOT NULL,
    evidence        JSONB DEFAULT '{}',
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    reviewed_at     TIMESTAMPTZ
);

-- Knowledge chunks (documentation / long-form content)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_name   TEXT NOT NULL,
    heading         TEXT,
    content         TEXT NOT NULL,
    chunk_index     INTEGER NOT NULL,
    embedding       vector(768),
    metadata        JSONB DEFAULT '{}',
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Vector indexes (HNSW)
CREATE INDEX IF NOT EXISTS idx_faq_embedding_combined ON faq_entries USING hnsw (embedding_combined vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_faq_embedding_question ON faq_entries USING hnsw (embedding_question vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_cache_embedding ON semantic_cache USING hnsw (query_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text search (hybrid: vector + keyword)
ALTER TABLE faq_entries ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(question, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(answer, '')), 'B')
    ) STORED;
CREATE INDEX IF NOT EXISTS idx_faq_search_vector ON faq_entries USING gin (search_vector);

ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(heading, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'B')
    ) STORED;
CREATE INDEX IF NOT EXISTS idx_chunks_search_vector ON knowledge_chunks USING gin (search_vector);

-- B-tree indexes
CREATE INDEX IF NOT EXISTS idx_faq_category ON faq_entries(category);
CREATE INDEX IF NOT EXISTS idx_faq_active ON faq_entries(is_active);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON semantic_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON content_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_feedback_faq ON feedback(faq_entry_id);
CREATE INDEX IF NOT EXISTS idx_gaps_status ON faq_gaps(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON improvement_suggestions(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_faq_updated_at ON faq_entries;
CREATE TRIGGER trg_faq_updated_at
    BEFORE UPDATE ON faq_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
