import logging
import os
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

logging.basicConfig(
    level=os.environ.get("QUOTEDB_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("quotedb")

DB_PATH = Path(__file__).parent / "quotes.db"

allowed_origins = [
    o.strip() for o in os.environ.get("QUOTEDB_ALLOWED_ORIGINS", "*").split(",") if o.strip()
]

limiter = Limiter(key_func=get_remote_address)


def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    logger.warning(
        "rate_limit_exceeded ip=%s method=%s path=%s",
        get_remote_address(request), request.method, request.url.path,
    )
    return _rate_limit_exceeded_handler(request, exc)


app = FastAPI(title="QuoteDB")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
    nick: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
):
    offset = (page - 1) * per_page

    with get_db() as conn:
        if nick:
            rows = conn.execute(
                """
                SELECT id, nick, owner, time, text FROM quotesdb
                WHERE LOWER(nick) = LOWER(?)
                ORDER BY id DESC LIMIT ? OFFSET ?
                """,
                (nick, per_page, offset),
            ).fetchall()
            total = conn.execute(
                "SELECT COUNT(*) FROM quotesdb WHERE LOWER(nick) = LOWER(?)",
                (nick,),
            ).fetchone()[0]
        elif q:
            escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like_q = f"%{escaped}%"
            rows = conn.execute(
                """
                SELECT id, nick, owner, time, text FROM quotesdb
                WHERE LOWER(nick) LIKE LOWER(?) ESCAPE '\\' OR LOWER(text) LIKE LOWER(?) ESCAPE '\\'
                ORDER BY id DESC LIMIT ? OFFSET ?
                """,
                (like_q, like_q, per_page, offset),
            ).fetchall()
            total = conn.execute(
                "SELECT COUNT(*) FROM quotesdb WHERE LOWER(nick) LIKE LOWER(?) ESCAPE '\\' OR LOWER(text) LIKE LOWER(?) ESCAPE '\\'",
                (like_q, like_q),
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
        conn.commit()
        row = conn.execute(
            "SELECT id, nick, owner, time, text FROM quotesdb WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()

    logger.info(
        "quote_created id=%s nick=%r owner=%r ip=%s",
        row["id"], row["nick"], row["owner"], get_remote_address(request),
    )
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
