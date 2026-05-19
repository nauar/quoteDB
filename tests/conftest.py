import sqlite3
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

SCHEMA_PATH = PROJECT_ROOT / "create_schema.sql"


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "quotes.db"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()

    import main
    monkeypatch.setattr(main, "DB_PATH", path)
    main.app.state.limiter.reset()
    return path


@pytest.fixture
def client(db_path):
    import main
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def seed(db_path):
    def _seed(rows):
        conn = sqlite3.connect(db_path)
        conn.executemany(
            "INSERT INTO quotesdb (nick, time, owner, text) VALUES (?, ?, ?, ?)",
            rows,
        )
        conn.commit()
        conn.close()
    return _seed
