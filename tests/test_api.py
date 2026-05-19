def test_list_empty(client):
    res = client.get("/api/quotes")
    assert res.status_code == 200
    assert res.json() == {"quotes": [], "total": 0, "page": 1, "per_page": 20, "pages": 0}


def test_list_returns_newest_first(client, seed):
    seed([
        ("alice", 100, "owner1", "first"),
        ("bob",   200, "owner2", "second"),
        ("carol", 300, "owner3", "third"),
    ])
    res = client.get("/api/quotes")
    body = res.json()
    assert body["total"] == 3
    assert [q["text"] for q in body["quotes"]] == ["third", "second", "first"]


def test_pagination_math(client, seed):
    seed([(f"n{i}", i, "o", f"t{i}") for i in range(25)])
    res = client.get("/api/quotes?page=2&per_page=10")
    body = res.json()
    assert body["total"] == 25
    assert body["page"] == 2
    assert body["per_page"] == 10
    assert body["pages"] == 3
    assert len(body["quotes"]) == 10


def test_pagination_last_page_partial(client, seed):
    seed([(f"n{i}", i, "o", f"t{i}") for i in range(25)])
    res = client.get("/api/quotes?page=3&per_page=10")
    assert len(res.json()["quotes"]) == 5


def test_search_matches_text_and_nick(client, seed):
    seed([
        ("alice",  1, "o", "hello world"),
        ("bob",    2, "o", "goodbye"),
        ("hello",  3, "o", "unrelated"),
    ])
    res = client.get("/api/quotes?q=hello")
    body = res.json()
    assert body["total"] == 2
    texts = {q["text"] for q in body["quotes"]}
    assert texts == {"hello world", "unrelated"}


def test_search_is_case_insensitive(client, seed):
    seed([("alice", 1, "o", "Hello World")])
    assert client.get("/api/quotes?q=HELLO").json()["total"] == 1
    assert client.get("/api/quotes?q=hello").json()["total"] == 1


def test_nick_filter_exact_match(client, seed):
    seed([
        ("alice",      1, "o", "x"),
        ("alice2",     2, "o", "y"),
        ("not-alice",  3, "o", "z"),
    ])
    res = client.get("/api/quotes?nick=alice")
    assert res.json()["total"] == 1


def test_nick_filter_case_insensitive(client, seed):
    seed([("Alice", 1, "o", "x")])
    assert client.get("/api/quotes?nick=alice").json()["total"] == 1
    assert client.get("/api/quotes?nick=ALICE").json()["total"] == 1


def test_create_round_trip(client):
    res = client.post("/api/quotes", json={"nick": "alice", "owner": "bob", "text": "hi"})
    assert res.status_code == 201
    body = res.json()
    assert body["nick"] == "alice"
    assert body["owner"] == "bob"
    assert body["text"] == "hi"
    assert isinstance(body["id"], int)
    assert isinstance(body["time"], int)

    fetched = client.get(f"/api/quotes/{body['id']}").json()
    assert fetched == body


def test_create_strips_whitespace(client):
    res = client.post("/api/quotes", json={"nick": "  alice  ", "owner": " bob ", "text": "  hi  "})
    body = res.json()
    assert body["nick"] == "alice"
    assert body["owner"] == "bob"
    assert body["text"] == "hi"


def test_create_rejects_blank_fields(client):
    res = client.post("/api/quotes", json={"nick": "  ", "owner": "bob", "text": "hi"})
    assert res.status_code == 422


def test_create_rejects_oversize_text(client):
    res = client.post("/api/quotes", json={"nick": "a", "owner": "b", "text": "x" * 2001})
    assert res.status_code == 422


def test_create_preserves_newlines(client):
    res = client.post("/api/quotes", json={"nick": "a", "owner": "b", "text": "line1\nline2"})
    assert res.json()["text"] == "line1\nline2"


def test_get_by_id_404(client):
    assert client.get("/api/quotes/9999").status_code == 404


def test_random_when_empty(client):
    assert client.get("/api/quotes/random/one").status_code == 404


def test_random_returns_one(client, seed):
    seed([("a", 1, "o", "only")])
    res = client.get("/api/quotes/random/one")
    assert res.status_code == 200
    assert res.json()["text"] == "only"
