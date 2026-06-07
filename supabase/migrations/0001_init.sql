-- OpenBook initial schema (generated from BUILD_SPEC.md §4)
-- Apply via Supabase SQL editor or: supabase db push

-- =====================================================================
-- OpenBook — full Postgres schema (Supabase). Run in order.
-- =====================================================================
create extension if not exists "pgcrypto";
create extension if not exists vector;

-- ---------- enums ----------
create type source_kind  as enum ('pdf','docx','pptx','gdoc','image','code','notebook','markdown','youtube','github','text');
create type doc_status   as enum ('queued','parsing','chunking','embedding','ready','failed');
create type quiz_kind    as enum ('mcq','multi','true_false','short_answer','cloze','locate');
create type room_role    as enum ('host','member');
create type review_grade as enum ('again','hard','good','easy');   -- FSRS 1-4

-- ---------- profiles (1:1 with auth.users) ----------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  prefs        jsonb not null default '{
    "theme":"system","dyslexia":false,"focus":false,"cvd":"none",
    "lens":"off","reduce_motion":false,"line_spacing":"normal",
    "skip_socratic":false,"register":"casual"
  }'::jsonb,                                  -- accessibility + comms-mode prefs (the accommodation follows the student)
  plan         text not null default 'free',
  streak_days  int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create function handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'avatar_url');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- documents (a study workspace) ----------
create table documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  emoji       text,
  status      doc_status not null default 'queued',
  error       text,
  claude_file_id text,                        -- Files API id; reference for citations, never re-upload
  starter_questions jsonb not null default '[]'::jsonb,  -- Haiku-generated empty-state chips
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on documents (owner_id, updated_at desc);

-- ---------- sources (raw inputs attached to a document) ----------
create table sources (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  kind         source_kind not null,
  title        text,
  storage_path text,                          -- private bucket object path
  external_url text,                          -- youtube/github/gdoc url
  byte_size    bigint,
  status       doc_status not null default 'queued',
  meta         jsonb not null default '{}'::jsonb,  -- page count, repo sha, video id, ocr lang...
  created_at   timestamptz not null default now()
);
create index on sources (document_id);
create index on sources (owner_id);

-- ---------- chunks (+ pgvector) — RAG retrieval unit ----------
create table chunks (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references sources(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  ordinal       int  not null,
  content       text not null,
  token_count   int,
  loc           jsonb not null default '{}'::jsonb, -- {page,char_start,char_end,t_start_sec,t_end_sec,file_path,line_start,line_end,slide}
  fts           tsvector generated always as (to_tsvector('english', content)) stored,  -- hybrid re-rank
  embedding     vector(1536),
  created_at    timestamptz not null default now()
);
create index on chunks (source_id, ordinal);
create index on chunks (document_id);
create index chunks_fts_idx on chunks using gin (fts);
create index chunks_embedding_hnsw on chunks
  using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);

-- RLS-safe vector search scoped to a document (security invoker => caller's RLS applies)
create function match_chunks(
  p_document_id uuid, p_query vector(1536), p_match_count int default 8
) returns table (id uuid, source_id uuid, content text, loc jsonb, similarity float)
language sql stable security invoker as $$
  select c.id, c.source_id, c.content, c.loc, 1 - (c.embedding <=> p_query) as similarity
  from chunks c
  where c.document_id = p_document_id
  order by c.embedding <=> p_query
  limit p_match_count;
$$;

-- ---------- concepts (nodes of the per-document concept map) ----------
create table concepts (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references concepts(id) on delete set null,
  label       text not null,
  summary     text,
  source_chunk_ids uuid[] not null default '{}',  -- for item generation
  prereq_concept_ids uuid[] not null default '{}', -- DAG for fan-out weighting / analytics
  graph_x     real, graph_y real,
  exam_date   date,
  created_at  timestamptz not null default now()
);
create index on concepts (document_id, owner_id);

-- per-concept spaced-repetition + mastery (SM-2 + half-life), drives rings, branching, analytics
create table concept_mastery (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  concept_id    uuid not null references concepts(id) on delete cascade,
  mastery       numeric not null default 0,        -- 0..1, Bayesian posterior / Elo
  alpha numeric not null default 1, beta numeric not null default 1,
  state         text not null default 'weak',      -- weak|shaky|solid
  ease          numeric not null default 2.5,
  interval_days int not null default 0,
  reps          int not null default 0,
  half_life_hours numeric,
  recall_prob_now numeric,                          -- cached: 2^(-hrs_since/half_life)
  last_reviewed timestamptz,
  next_review   timestamptz,
  updated_at    timestamptz not null default now(),
  unique (owner_id, concept_id)
);
create index on concept_mastery (owner_id, next_review);

-- ---------- highlights ----------
create table highlights (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  document_id  uuid not null references documents(id) on delete cascade,
  source_id    uuid references sources(id) on delete cascade,
  chunk_id     uuid references chunks(id) on delete set null,
  color        text not null default 'accent',
  loc          jsonb not null,                 -- exact span (+ ~280-char context window stored in meta)
  quote        text not null,
  margin_note  text,
  annotation   text,                           -- Haiku 1-liner "why this matters"
  recall_question text,                         -- Haiku-generated; answer is the highlight itself
  triage       text not null default 'inbox',  -- inbox|got_it|confused|forged|dismissed
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index on highlights (document_id, owner_id);

-- ---------- notes (concept-graph notebook) ----------
create table notes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  title         text,
  body_student  text,                          -- the student's own articulation (proof of authorship)
  body_synth    text,                          -- Claude-refined, student-accepted
  retrieval_prompt text,
  origin_highlight_id uuid references highlights(id) on delete set null,
  embedding     vector(1536),                  -- link-candidate pre-filter
  x real, y real,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on notes (document_id, owner_id);
create index notes_embedding_hnsw on notes using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);

create table note_keypoints (
  id        uuid primary key default gen_random_uuid(),
  note_id   uuid not null references notes(id) on delete cascade,
  owner_id  uuid not null references auth.users(id) on delete cascade,
  text      text not null,
  order_idx int not null default 0
);
create index on note_keypoints (note_id);

create table note_links (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  source_note_id uuid not null references notes(id) on delete cascade,
  target_note_id uuid not null references notes(id) on delete cascade,
  relation      text not null,                 -- relates_to|contradicts|example_of|prerequisite_of
  rationale     text,
  status        text not null default 'suggested', -- suggested|confirmed|rejected
  created_at    timestamptz not null default now(),
  unique (source_note_id, target_note_id, relation)
);
create index on note_links (document_id, owner_id);

create table note_schedule (                    -- SM-2 per note (Quick Recall)
  note_id        uuid primary key references notes(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  next_review_at timestamptz not null default now(),
  interval_days  int not null default 0,
  ease           numeric not null default 2.5,
  last_reviewed_at timestamptz
);
create index on note_schedule (owner_id, next_review_at);

-- ---------- quizzes ----------
create table quizzes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  scope       text not null default 'whole_doc',  -- whole_doc|chapter|concept_set
  scope_ref   jsonb not null default '{}'::jsonb,
  status      text not null default 'calibrating', -- calibrating|active|completed|abandoned
  score       numeric,
  started_at  timestamptz not null default now(),
  completed_at timestamptz
);
create table quiz_items (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references quizzes(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  concept_id  uuid references concepts(id) on delete set null,
  chunk_id    uuid references chunks(id) on delete set null,
  kind        quiz_kind not null,
  stem        text not null,
  options     jsonb,                            -- [{id,text}]
  correct     jsonb not null,
  supporting_span jsonb not null default '{}'::jsonb, -- {chunk_id,char_start,char_end} (unresolvable => dropped server-side)
  target_misconception text,
  explanation text,
  difficulty  smallint not null default 3,
  is_followup boolean not null default false,
  interleave_after smallint,
  ordinal     int not null default 0,
  model       text
);
create index on quiz_items (quiz_id, ordinal);
create table quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  quiz_item_id uuid not null references quiz_items(id) on delete cascade,
  answer      jsonb,
  confidence  smallint,                         -- 0 guessing, 1 unsure, 2 confident
  is_correct  boolean,
  partial_credit numeric,
  misconception_label text,
  ai_feedback text,
  latency_ms  int,
  repaired    boolean not null default false,   -- took the 10-sec micro-retry & got it
  created_at  timestamptz not null default now()
);
create index on quiz_attempts (owner_id, quiz_item_id);

-- ---------- flashcards (FSRS) ----------
create table decks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  title       text not null,
  description text,
  card_count  int not null default 0,
  retention_pct numeric,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table flashcards (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  deck_id      uuid not null references decks(id) on delete cascade,
  document_id  uuid references documents(id) on delete set null,
  card_type    text not null default 'qa',      -- cloze|qa|term_def|visual
  front        text not null,
  back         text not null,
  cloze_text   text,
  citations    jsonb not null default '[]'::jsonb,
  source_chunk_id uuid references chunks(id) on delete set null,
  origin       text not null default 'ai_generated', -- ai_generated|quiz_miss|highlight|manual|rescue_subcard
  parent_card_id uuid references flashcards(id) on delete set null, -- laddered rescue sub-cards
  -- FSRS state (ts-fsrs)
  fsrs_state   text not null default 'new',      -- new|learning|review|relearning
  due          timestamptz not null default now(),
  stability    double precision not null default 0,
  difficulty   double precision not null default 0,
  reps         int not null default 0,
  lapses       int not null default 0,
  last_review  timestamptz,
  is_leech     boolean not null default false,
  is_suspended boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on flashcards (owner_id, due);      -- "due cards" is the hot query
create index on flashcards (deck_id);
create table flashcard_reviews (                 -- immutable log → analytics + FSRS optimizer + calibration
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  session_id   uuid,
  grade        review_grade not null,
  predicted_confidence smallint,                  -- self-rating before reveal (calibration)
  recall_mode  text not null default 'typed',     -- typed|self_graded
  typed_answer text,
  ai_verdict   text,                              -- correct|partial|incorrect
  ai_suggested_grade smallint,
  reveal_latency_ms int,
  elapsed_ms   int,
  prev_due     timestamptz, next_due timestamptz,
  prev_stability double precision,
  reviewed_at  timestamptz not null default now()
);
create index on flashcard_reviews (owner_id, reviewed_at desc);
create table card_seeds (                         -- proven weak spots (quiz misses, highlights)
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  deck_id     uuid references decks(id) on delete cascade,
  seed_type   text not null,                      -- quiz_miss|highlight|note
  source_quiz_item_id uuid references quiz_items(id) on delete set null,
  source_chunk_id uuid references chunks(id) on delete set null,
  content     text,
  consumed    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on card_seeds (owner_id, consumed);
create table rescue_artifacts (                   -- persisted leech re-teaching (reusable, not re-billed)
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  diagnosis   text, explanation text, mnemonic text,
  generated_subcard_ids uuid[],
  model       text not null default 'claude-opus-4-8',
  created_at  timestamptz not null default now()
);

-- ---------- mindmaps (connected concept nodes, student-grown) ----------
create table mind_maps (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  title         text,
  central_topic text,
  source_checksum text,                          -- invalidate anchors/cache if doc changes
  seed_model    text,
  layout        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table source_anchors (                     -- hidden grading ground-truth from SEED pass
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references mind_maps(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  quote       text not null,
  char_start  int, char_end int,
  embedding   vector(1536)
);
create index source_anchors_embedding_hnsw on source_anchors using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create table mind_map_nodes (
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references mind_maps(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references mind_map_nodes(id) on delete set null,
  label       text,                              -- student-authored
  canonical_text text,                            -- Claude's precise phrasing (null until graded)
  kind        text not null default 'concept',    -- central|concept|subconcept
  status      text not null default 'ghost',      -- ghost|unverified|confirmed|partial|off_source|misconception
  authored_by text not null default 'student',    -- claude_seed|student
  source_anchor_id uuid references source_anchors(id) on delete set null,
  x real, y real,
  created_at  timestamptz not null default now()
);
create index on mind_map_nodes (map_id);
create table mind_map_edges (
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references mind_maps(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  source_node_id uuid not null references mind_map_nodes(id) on delete cascade,
  target_node_id uuid not null references mind_map_nodes(id) on delete cascade,
  relation    text not null,                      -- causes|is_part_of|contrasts_with|depends_on|example_of|leads_to
  status      text not null default 'unverified', -- unverified|confirmed|partial|invalid
  student_defense text,                            -- Socratic one-liner answer
  created_at  timestamptz not null default now()
);
create table node_reviews (                        -- SM-2 per node
  id          uuid primary key default gen_random_uuid(),
  node_id     uuid not null references mind_map_nodes(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  ease        real not null default 2.5,
  interval_days int not null default 0,
  due_at      timestamptz,
  last_grade  text,                               -- again|hard|good|easy
  reps        int not null default 0,
  last_recalled_at timestamptz
);
create index on node_reviews (owner_id, due_at);

-- ---------- summary "Study Ladder" ----------
create table summaries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  thesis      text,
  spine       jsonb not null default '{"nodes":[],"edges":[]}'::jsonb, -- key-idea nodes + bullets + source chips
  teach_back  text,                               -- student's own end-of-ladder summary (the saved artifact)
  created_at  timestamptz not null default now()
);

-- ---------- dictionary-on-hover vocab deck ----------
create table lookups (                             -- raw hover event log
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  chunk_id    uuid references chunks(id) on delete set null,
  word text, lemma text, char_start int, char_end int,
  sentence_text text, contextual_definition text, plain_gloss text,
  sense_tag text, pos text, difficulty text,
  guessed boolean, guess_correct boolean,
  created_at  timestamptz not null default now()
);
create table vocab_items (                         -- SM-2-lite vocab deck
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  lemma text, sense_tag text,
  first_seen_document_id uuid references documents(id) on delete set null,
  example_sentence text, plain_gloss text,
  ease_factor numeric not null default 2.5,
  interval_days int not null default 0,
  repetitions int not null default 0,
  due_at timestamptz, last_reviewed_at timestamptz,
  mastered boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, lemma, sense_tag)
);
create table definition_cache (                    -- dedupe common words across users on public docs
  id          uuid primary key default gen_random_uuid(),
  lemma text, sense_hash text, context_fingerprint text,
  payload jsonb, model text, hit_count int not null default 0,
  created_at  timestamptz not null default now(),
  unique (lemma, context_fingerprint)
);

-- ---------- communication mode (persisted voice register) ----------
create table communication_registers (            -- seeded reference data (NOT user-scoped; no RLS owner col)
  id text primary key,                             -- 'formal'|'casual'|'gen_z'|'gen_alpha'
  display_name text, emoji text,
  style_block_md text,                             -- the cached system-prompt style prefix (load-bearing)
  reading_level text, max_sentence_words int,
  version int not null default 1, is_active boolean not null default true
);
create table user_communication_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_register_id text references communication_registers(id),
  calibrated_at timestamptz, locked boolean not null default false,
  ab_winner_register_id text references communication_registers(id),
  ab_completed boolean not null default false,
  global_override boolean not null default true,
  updated_at timestamptz not null default now()
);
create table register_recall_events (             -- authoritative A/B ledger
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid references concepts(id) on delete set null,
  register_id text references communication_registers(id),
  prompt_phrasing_register text,
  correct boolean, gist_match_score numeric, latency_ms int, reexplain_count int,
  source text,                                     -- calibration|stress_test|ab_test|in_feature|register_flip
  created_at timestamptz not null default now()
);
create index on register_recall_events (owner_id, register_id, created_at);

-- ---------- study sessions / chat / analytics / rooms / usage ----------
create table study_sessions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  document_id  uuid references documents(id) on delete cascade,
  room_id      uuid,
  mode         text not null,                     -- tutor|quiz|flashcards|read|mindmap|summary|notes
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  focus_seconds int not null default 0,           -- ADHD focus time on task
  calibration_score numeric,
  meta         jsonb not null default '{}'::jsonb
);
create index on study_sessions (owner_id, started_at desc);

create table chat_messages (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references study_sessions(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  role         text not null,                     -- user|assistant|check|system
  content      text not null,
  intent       text,                              -- factual|conceptual|problem|off_material|meta
  stance       text,
  retrieval_confidence real,
  citations    jsonb not null default '[]'::jsonb, -- [{label,chunk_id,page,char_start,char_end,quoted_text}]
  tokens_in int, tokens_out int, cache_read int, model text,
  created_at   timestamptz not null default now()
);
create index on chat_messages (session_id, created_at);

-- understanding-checks (the retention engine for the tutor)
create table understanding_checks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  message_id  uuid references chat_messages(id) on delete cascade,
  concept_id  uuid references concepts(id) on delete set null,
  chunk_id    uuid references chunks(id) on delete set null,
  check_type  text not null,                      -- free_response|mcq
  prompt text, options jsonb, model_answer text,
  student_response text,
  verdict text,                                    -- correct|partial|misconception
  gap text, reexplanation text,
  created_at  timestamptz not null default now()
);
create index on understanding_checks (owner_id, created_at desc);

create table analytics_events (
  id           bigint generated always as identity primary key,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  document_id  uuid references documents(id) on delete set null,
  name         text not null,                     -- 'card_reviewed','quiz_completed','span_explained','focus_started'...
  props        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index on analytics_events (owner_id, created_at desc);
create index on analytics_events (name, created_at desc);

create table daily_moves (                         -- analytics "Today's Move" forced-decision card
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  concept_id  uuid references concepts(id) on delete set null,
  rank        smallint, rationale text, urgency_label text, modality text,
  est_minutes smallint,
  status      text not null default 'pending',     -- pending|started|completed|snoozed
  snooze_reason text,                              -- already_know|no_time|too_hard
  recall_prob_at_creation numeric,
  generated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on daily_moves (owner_id, generated_at desc);
create table calibration_weekly (                  -- weekly Opus coaching synthesis
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  week_start date,
  brier_score numeric, overconfidence_bias numeric,
  topic_biases jsonb, coaching_note text,
  scheduling_weight_adjustments jsonb,
  created_at  timestamptz not null default now()
);

create table study_rooms (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  name        text not null,
  is_public   boolean not null default false,
  invite_code text unique default encode(gen_random_bytes(6),'hex'),
  created_at  timestamptz not null default now()
);
create index on study_rooms (host_id);
create table study_room_members (
  room_id uuid not null references study_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    room_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table ai_usage (                            -- cost + abuse ledger (service-role writes only)
  id           bigint generated always as identity primary key,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  route        text not null, model text not null,
  input_tokens int, output_tokens int, cache_read int, cache_creation int,
  cost_usd     numeric(10,6),
  created_at   timestamptz not null default now()
);
create index on ai_usage (owner_id, created_at desc);

-- =====================================================================
-- ROW LEVEL SECURITY — owner-scoped everywhere; rooms add a membership path
-- =====================================================================
alter table profiles            enable row level security;
alter table documents           enable row level security;
alter table sources             enable row level security;
alter table chunks              enable row level security;
alter table concepts            enable row level security;
alter table concept_mastery     enable row level security;
alter table highlights          enable row level security;
alter table notes               enable row level security;
alter table note_keypoints      enable row level security;
alter table note_links          enable row level security;
alter table note_schedule       enable row level security;
alter table quizzes             enable row level security;
alter table quiz_items          enable row level security;
alter table quiz_attempts       enable row level security;
alter table decks               enable row level security;
alter table flashcards          enable row level security;
alter table flashcard_reviews   enable row level security;
alter table card_seeds          enable row level security;
alter table rescue_artifacts    enable row level security;
alter table mind_maps           enable row level security;
alter table source_anchors      enable row level security;
alter table mind_map_nodes      enable row level security;
alter table mind_map_edges      enable row level security;
alter table node_reviews        enable row level security;
alter table summaries           enable row level security;
alter table lookups             enable row level security;
alter table vocab_items         enable row level security;
alter table user_communication_prefs enable row level security;
alter table register_recall_events   enable row level security;
alter table study_sessions      enable row level security;
alter table chat_messages       enable row level security;
alter table understanding_checks enable row level security;
alter table analytics_events    enable row level security;
alter table daily_moves         enable row level security;
alter table calibration_weekly  enable row level security;
alter table study_rooms         enable row level security;
alter table study_room_members  enable row level security;
alter table ai_usage            enable row level security;

-- profiles + comms prefs: self only
create policy "profiles_self" on profiles for all using (id=auth.uid()) with check (id=auth.uid());
create policy "comm_prefs_self" on user_communication_prefs for all using (user_id=auth.uid()) with check (user_id=auth.uid());

-- generic owner-scoped tables (one policy each)
create policy "own_documents"  on documents        for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_sources"    on sources          for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_chunks"     on chunks           for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_concepts"   on concepts         for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_cmastery"   on concept_mastery  for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_highlights" on highlights       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_notes"      on notes            for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_keypoints"  on note_keypoints   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_notelinks"  on note_links       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_notesched"  on note_schedule    for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_quizzes"    on quizzes          for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_quizitems"  on quiz_items       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_attempts"   on quiz_attempts    for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_decks"      on decks            for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_cards"      on flashcards       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_reviews"    on flashcard_reviews for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_seeds"      on card_seeds       for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_rescue"     on rescue_artifacts for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_maps"       on mind_maps        for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_anchors"    on source_anchors   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_nodes"      on mind_map_nodes   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_edges"      on mind_map_edges   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_noderev"    on node_reviews     for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_summaries"  on summaries        for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_lookups"    on lookups          for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_vocab"      on vocab_items      for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_regevents"  on register_recall_events for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_sessions"   on study_sessions   for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_chat"       on chat_messages    for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_checks"     on understanding_checks for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_events"     on analytics_events for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_moves"      on daily_moves      for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_calib"      on calibration_weekly for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "own_usage"      on ai_usage         for select using (owner_id=auth.uid());  -- writes via service role only

-- communication_registers: read-only reference data for all authed users
create policy "registers_read" on communication_registers for select using (auth.role() = 'authenticated');

-- study rooms: host manages; members + public read
create policy "rooms_select" on study_rooms for select
  using (is_public or host_id=auth.uid()
         or exists (select 1 from study_room_members m where m.room_id=study_rooms.id and m.user_id=auth.uid()));
create policy "rooms_host_write" on study_rooms for all using (host_id=auth.uid()) with check (host_id=auth.uid());
create policy "members_self" on study_room_members for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "members_host_read" on study_room_members for select
  using (exists (select 1 from study_rooms r where r.id=room_id and r.host_id=auth.uid()));

-- =====================================================================
-- STORAGE (private bucket) — RLS keys objects to {uid}/...
-- =====================================================================
insert into storage.buckets (id,name,public) values ('sources','sources',false) on conflict do nothing;
create policy "storage_own_read"  on storage.objects for select
  using (bucket_id='sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage_own_write" on storage.objects for insert
  with check (bucket_id='sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage_own_del"   on storage.objects for delete
  using (bucket_id='sources' and (storage.foldername(name))[1] = auth.uid()::text);
