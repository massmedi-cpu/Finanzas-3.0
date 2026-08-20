CREATE TABLE accounts (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 type TEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE source_movements (
 id TEXT PRIMARY KEY,
 source_id TEXT,
 date TEXT,
 account_id TEXT,
 concept TEXT,
 amount NUMERIC,
 balance NUMERIC,
 raw_data JSON
);

CREATE TABLE enriched_movements (
 id TEXT PRIMARY KEY,
 source_movement_id TEXT,
 category TEXT,
 notes TEXT,
 reviewed BOOLEAN DEFAULT FALSE,
 rules JSON
);

CREATE TABLE sync_history (
 id TEXT PRIMARY KEY,
 executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 changes INTEGER
);