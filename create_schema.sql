CREATE TABLE IF NOT EXISTS quotesdb (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nick  TEXT,
    time  INTEGER,
    owner TEXT,
    text  TEXT
);
