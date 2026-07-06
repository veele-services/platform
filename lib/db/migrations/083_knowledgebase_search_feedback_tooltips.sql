-- Knowledgebase phase 3 search and feedback hardening.
-- Adds lightweight indexes used by autocomplete, keyword search and feedback review.

CREATE INDEX IF NOT EXISTS kb_articles_keywords_gin_idx
  ON kb_articles USING gin (keywords);

CREATE INDEX IF NOT EXISTS kb_articles_smart_terms_gin_idx
  ON kb_articles USING gin (smart_terms);

CREATE INDEX IF NOT EXISTS kb_search_terms_full_text_idx
  ON kb_search_terms USING gin (to_tsvector('simple', term));

CREATE INDEX IF NOT EXISTS kb_article_feedback_article_helpful_idx
  ON kb_article_feedback(article_id, is_helpful, created_at);

CREATE INDEX IF NOT EXISTS kb_tooltips_article_status_idx
  ON kb_tooltips(article_id, status);
