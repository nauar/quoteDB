# QuoteDB

A web UI for browsing an IRC quote database backed by SQLite.

## Stack

- **Backend**: Python / FastAPI + uvicorn
- **Frontend**: Vanilla HTML/CSS/JS
- **Database**: SQLite
- **Deps**: managed by [uv](https://github.com/astral-sh/uv)

## Running locally

```bash
uv sync
uv run uvicorn main:app --reload
```

Open `http://localhost:8000`.

## Running with nerdctl / Docker

```bash
nerdctl build -t quotedb .
nerdctl run -d --name quotedb -p 8000:8000 -v $(pwd)/quotes.db:/app/quotes.db quotedb
```

The database is mounted at runtime so data persists outside the container.

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `QUOTEDB_ALLOWED_ORIGINS` | `*` | Comma-separated list of origins allowed by CORS. Set to your frontend URL in production (e.g. `https://quotes.example.com`). |

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/quotes` | Paginated list of quotes |
| `POST` | `/api/quotes` | Create a new quote |
| `GET` | `/api/quotes/{id}` | Single quote by ID |
| `GET` | `/api/quotes/random/one` | Random quote |

### Query parameters for `GET /api/quotes`

| Parameter | Default | Description |
|-----------|---------|-------------|
| `q` | — | Search term (case-insensitive substring match on nick and text) |
| `nick` | — | Filter by exact nick (case-insensitive) |
| `page` | `1` | Page number |
| `per_page` | `20` | Results per page (max 100) |

### Request body for `POST /api/quotes`

```json
{
  "nick": "Samual",
  "owner": "zykure",
  "text": "Trust me, you'll thank me later."
}
```

Returns the created quote with HTTP 201. The `time` field is set to the current Unix timestamp by the server.

Rate limited to **10 requests per minute per IP**. Exceeding the limit returns HTTP 429.

### Example

```
GET /api/quotes?q=trust&page=1&per_page=5
```

```json
{
  "quotes": [...],
  "total": 3,
  "page": 1,
  "per_page": 5,
  "pages": 1
}
```

## Database schema

The relevant table is `quotesdb`:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment primary key |
| `nick` | TEXT | IRC nick of the person quoted |
| `owner` | TEXT | Nick who added the quote |
| `time` | INTEGER | Unix timestamp |
| `text` | TEXT | Quote content |

Multi-line quotes are stored with `\n` line separators and rendered with CSS `white-space: pre-wrap`.
