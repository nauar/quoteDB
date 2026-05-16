import sqlite3
from contextlib import contextmanager
from pathlib import Path

import time

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

DB_PATH = Path(__file__).parent / "db.sqlite"

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="QuoteDB")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


class Quote(BaseModel):
    id: int
    nick: str
    owner: str
    time: int
    text: str


class CreateQuote(BaseModel):
    nick: str = Field(max_length=100)
    owner: str = Field(max_length=100)
    text: str = Field(max_length=2000)


class QuotesResponse(BaseModel):
    quotes: list[Quote]
    total: int
    page: int
    per_page: int
    pages: int


@app.get("/api/quotes", response_model=QuotesResponse)
@limiter.limit("30/minute")
def list_quotes(
    request: Request,
    q: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
):
    offset = (page - 1) * per_page

    with get_db() as conn:
        if q:
            rows = conn.execute(
                """
                SELECT q.id, q.nick, q.owner, q.time, q.text
                FROM quotesdb q
                JOIN quotesdb_fts fts ON q.rowid = fts.rowid
                WHERE quotesdb_fts MATCH ?
                LIMIT ? OFFSET ?
                """,
                (q, per_page, offset),
            ).fetchall()
            total = conn.execute(
                """
                SELECT COUNT(*) FROM quotesdb q
                JOIN quotesdb_fts fts ON q.rowid = fts.rowid
                WHERE quotesdb_fts MATCH ?
                """,
                (q,),
            ).fetchone()[0]
        else:
            rows = conn.execute(
                "SELECT id, nick, owner, time, text FROM quotesdb ORDER BY id DESC LIMIT ? OFFSET ?",
                (per_page, offset),
            ).fetchall()
            total = conn.execute("SELECT COUNT(*) FROM quotesdb").fetchone()[0]

    quotes = [Quote(**dict(row)) for row in rows]
    pages = (total + per_page - 1) // per_page

    return QuotesResponse(quotes=quotes, total=total, page=page, per_page=per_page, pages=pages)


@app.post("/api/quotes", response_model=Quote, status_code=201)
@limiter.limit("10/minute")
def create_quote(request: Request, body: CreateQuote):
    if not body.nick.strip() or not body.owner.strip() or not body.text.strip():
        raise HTTPException(status_code=422, detail="nick, owner, and text are required")

    ts = int(time.time())
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO quotesdb (nick, owner, time, text) VALUES (?, ?, ?, ?)",
            (body.nick.strip(), body.owner.strip(), ts, body.text.strip()),
        )
        conn.execute(
            "INSERT INTO quotesdb_fts (rowid, nick, text) VALUES (?, ?, ?)",
            (cur.lastrowid, body.nick.strip(), body.text.strip()),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, nick, owner, time, text FROM quotesdb WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()

    return Quote(**dict(row))


@app.get("/api/quotes/random/one", response_model=Quote)
def random_quote():
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, nick, owner, time, text FROM quotesdb ORDER BY RANDOM() LIMIT 1"
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="No quotes found")

    return Quote(**dict(row))


@app.get("/api/quotes/{quote_id}", response_model=Quote)
def get_quote(quote_id: int):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, nick, owner, time, text FROM quotesdb WHERE id = ?",
            (quote_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Quote not found")

    return Quote(**dict(row))


app.mount("/", StaticFiles(directory=Path(__file__).parent, html=True), name="static")
