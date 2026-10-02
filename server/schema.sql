CREATE SCHEMA IF NOT EXISTS yamano_prime;
CREATE TABLE IF NOT EXISTS yamano_prime.quiz_sets (
 id text PRIMARY KEY, author_id text NOT NULL, author_name text NOT NULL,
 title text NOT NULL, description text NOT NULL DEFAULT '', tags jsonb NOT NULL DEFAULT '[]',
 visibility text NOT NULL CHECK (visibility IN ('DRAFT','UNLISTED','PUBLIC')),
 default_order text NOT NULL CHECK (default_order IN ('AUTHOR_ORDER','HAND_LEXICOGRAPHIC')),
 current_version_id text, play_count integer NOT NULL DEFAULT 0,
 created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS yamano_prime.quiz_versions (
 id text PRIMARY KEY, quiz_set_id text NOT NULL REFERENCES yamano_prime.quiz_sets(id),
 version_number integer NOT NULL, answer_mode text NOT NULL CHECK (answer_mode IN ('PRIME_ONLY','COMPOSITE_ONLY','BOTH')),
 allow_57 boolean NOT NULL, problem_count integer NOT NULL CHECK (problem_count BETWEEN 1 AND 5000),
 contains_dead boolean NOT NULL, created_at bigint NOT NULL, UNIQUE(quiz_set_id,version_number)
);
CREATE TABLE IF NOT EXISTS yamano_prime.quiz_problems (
 id text PRIMARY KEY, quiz_version_id text NOT NULL REFERENCES yamano_prime.quiz_versions(id),
 author_order integer NOT NULL, canonical_hand jsonb NOT NULL, canonical_hand_key text NOT NULL,
 problem_kind text NOT NULL CHECK (problem_kind IN ('NORMAL','CLAIMED_DEAD')),
 example_solution jsonb, disputed boolean NOT NULL DEFAULT false,
 UNIQUE(quiz_version_id,canonical_hand_key), UNIQUE(quiz_version_id,author_order)
);
CREATE TABLE IF NOT EXISTS yamano_prime.quiz_sessions (
 id text PRIMARY KEY, token_hash text NOT NULL, quiz_set_id text NOT NULL REFERENCES yamano_prime.quiz_sets(id),
 quiz_version_id text NOT NULL REFERENCES yamano_prime.quiz_versions(id), account_id text,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ENDED')),
 score integer NOT NULL DEFAULT 0, correct_count integer NOT NULL DEFAULT 0,
 wrong_count integer NOT NULL DEFAULT 0, dead_choice_count integer NOT NULL DEFAULT 0,
 attempted_count integer NOT NULL DEFAULT 0, total_problem_count integer NOT NULL,
 started_at bigint NOT NULL, first_attempt_at bigint, ended_at bigint,
 counted_as_play boolean NOT NULL DEFAULT false, shuffle_seed text, problem_order jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS yamano_prime.attempts (
 session_id text NOT NULL REFERENCES yamano_prime.quiz_sessions(id),
 problem_id text NOT NULL REFERENCES yamano_prime.quiz_problems(id), request_id text NOT NULL,
 request_hash text NOT NULL, answer jsonb NOT NULL, score integer NOT NULL,
 correct boolean NOT NULL, dead_choice boolean NOT NULL, legal_move boolean NOT NULL,
 created_at bigint NOT NULL, PRIMARY KEY(session_id,problem_id), UNIQUE(session_id,request_id)
);
CREATE TABLE IF NOT EXISTS yamano_prime.problem_stats (
 problem_id text PRIMARY KEY REFERENCES yamano_prime.quiz_problems(id),
 attempt_count integer NOT NULL DEFAULT 0, correct_count integer NOT NULL DEFAULT 0,
 wrong_count integer NOT NULL DEFAULT 0, dead_choice_count integer NOT NULL DEFAULT 0,
 legal_move_count integer NOT NULL DEFAULT 0, invalid_move_count integer NOT NULL DEFAULT 0,
 counterexample_count integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS yamano_prime.likes (
 account_id text NOT NULL, quiz_set_id text NOT NULL REFERENCES yamano_prime.quiz_sets(id),
 created_at bigint NOT NULL, PRIMARY KEY(account_id,quiz_set_id)
);
CREATE TABLE IF NOT EXISTS yamano_prime.dead_problem_disputes (
 problem_id text PRIMARY KEY REFERENCES yamano_prime.quiz_problems(id),
 session_id text NOT NULL REFERENCES yamano_prime.quiz_sessions(id), solution jsonb NOT NULL, created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS yp_sets_public ON yamano_prime.quiz_sets(visibility,created_at);
CREATE INDEX IF NOT EXISTS yp_sets_author ON yamano_prime.quiz_sets(author_id);
CREATE INDEX IF NOT EXISTS yp_sessions_account ON yamano_prime.quiz_sessions(account_id,started_at);
CREATE INDEX IF NOT EXISTS yp_problems_version ON yamano_prime.quiz_problems(quiz_version_id,author_order);
CREATE INDEX IF NOT EXISTS yp_sessions_set_account ON yamano_prime.quiz_sessions(quiz_set_id,account_id,first_attempt_at);
