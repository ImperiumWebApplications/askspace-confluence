export interface MigrationStep {
  name: string;
  query: string;
}

/**
 * ANSI/MySQL-compatible DDL statements for Atlassian Forge SQL (TiDB/MySQL engine).
 * All statements are idempotent via IF NOT EXISTS.
 */
export const SCHEMA_MIGRATIONS: MigrationStep[] = [
  {
    name: 'v1_create_questions',
    query: `
      CREATE TABLE IF NOT EXISTS askspace_questions (
        id VARCHAR(64) NOT NULL,
        space_key VARCHAR(128) NOT NULL,
        space_id VARCHAR(64) NOT NULL DEFAULT '',
        title VARCHAR(300) NOT NULL,
        body TEXT NOT NULL,
        author_account_id VARCHAR(128) NOT NULL,
        author_name VARCHAR(200) NOT NULL,
        accepted_answer_id VARCHAR(64) NULL,
        vote_score INT NOT NULL DEFAULT 0,
        answers_count INT NOT NULL DEFAULT 0,
        views_count INT NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'open',
        promoted_page_id VARCHAR(64) NULL,
        promoted_page_url VARCHAR(500) NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_questions_space_status (space_key, status),
        INDEX idx_questions_created (created_at),
        INDEX idx_questions_votes (vote_score)
      )
    `,
  },
  {
    name: 'v1_create_answers',
    query: `
      CREATE TABLE IF NOT EXISTS askspace_answers (
        id VARCHAR(64) NOT NULL,
        question_id VARCHAR(64) NOT NULL,
        body TEXT NOT NULL,
        author_account_id VARCHAR(128) NOT NULL,
        author_name VARCHAR(200) NOT NULL,
        is_accepted TINYINT NOT NULL DEFAULT 0,
        accepted_by_account_id VARCHAR(128) NULL,
        accepted_by_name VARCHAR(200) NULL,
        vote_score INT NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_answers_question (question_id),
        INDEX idx_answers_author (author_account_id)
      )
    `,
  },
  {
    name: 'v1_create_votes',
    query: `
      CREATE TABLE IF NOT EXISTS askspace_votes (
        id VARCHAR(64) NOT NULL,
        user_account_id VARCHAR(128) NOT NULL,
        target_type VARCHAR(16) NOT NULL,
        target_id VARCHAR(64) NOT NULL,
        vote_value INT NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_vote_user_target (user_account_id, target_type, target_id),
        INDEX idx_votes_target (target_type, target_id)
      )
    `,
  },
  {
    name: 'v1_create_tags',
    query: `
      CREATE TABLE IF NOT EXISTS askspace_tags (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(64) NOT NULL,
        display_name VARCHAR(80) NOT NULL,
        description VARCHAR(300) NOT NULL DEFAULT '',
        created_by VARCHAR(128) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_tag_name (name)
      )
    `,
  },
  {
    name: 'v1_create_question_tags',
    query: `
      CREATE TABLE IF NOT EXISTS askspace_question_tags (
        question_id VARCHAR(64) NOT NULL,
        tag_id VARCHAR(64) NOT NULL,
        PRIMARY KEY (question_id, tag_id),
        INDEX idx_qtags_tag (tag_id)
      )
    `,
  },
  {
    name: 'v1_create_comments',
    query: `
      CREATE TABLE IF NOT EXISTS askspace_comments (
        id VARCHAR(64) NOT NULL,
        target_type VARCHAR(16) NOT NULL,
        target_id VARCHAR(64) NOT NULL,
        body VARCHAR(2000) NOT NULL,
        author_account_id VARCHAR(128) NOT NULL,
        author_name VARCHAR(200) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_comments_target (target_type, target_id)
      )
    `,
  },
  {
    name: 'v1_create_watchers',
    query: `
      CREATE TABLE IF NOT EXISTS askspace_watchers (
        question_id VARCHAR(64) NOT NULL,
        user_account_id VARCHAR(128) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (question_id, user_account_id),
        INDEX idx_watchers_user (user_account_id)
      )
    `,
  },
  {
    name: 'v1_create_notifications',
    query: `
      CREATE TABLE IF NOT EXISTS askspace_notifications (
        id VARCHAR(64) NOT NULL,
        recipient_account_id VARCHAR(128) NOT NULL,
        question_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(40) NOT NULL,
        message VARCHAR(500) NOT NULL,
        is_read TINYINT NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_notif_recipient_read (recipient_account_id, is_read, created_at)
      )
    `,
  },
  {
    name: 'v1_create_audit_log',
    query: `
      CREATE TABLE IF NOT EXISTS askspace_audit_log (
        id VARCHAR(64) NOT NULL,
        actor_account_id VARCHAR(128) NOT NULL,
        actor_name VARCHAR(200) NOT NULL,
        action_type VARCHAR(64) NOT NULL,
        entity_type VARCHAR(32) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        details VARCHAR(1000) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_audit_created (created_at)
      )
    `,
  },
];
