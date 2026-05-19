"""LIKE-injection regressions.

The search endpoint escapes %, _, and \\ before building the LIKE pattern.
Without that escaping, a query of "%" would match every row, and "_" would
match any single character. These tests pin that behavior down.
"""


def test_percent_is_literal(client, seed):
    seed([
        ("alice", 1, "o", "100% sure"),
        ("bob",   2, "o", "no special char here"),
        ("carol", 3, "o", "x"),
    ])
    res = client.get("/api/quotes?q=%25")  # %25 = '%' url-encoded
    body = res.json()
    assert body["total"] == 1
    assert body["quotes"][0]["text"] == "100% sure"


def test_underscore_is_literal(client, seed):
    seed([
        ("alice", 1, "o", "foo_bar"),
        ("bob",   2, "o", "fooXbar"),
        ("carol", 3, "o", "fooYbar"),
    ])
    res = client.get("/api/quotes?q=_")
    body = res.json()
    assert body["total"] == 1
    assert body["quotes"][0]["text"] == "foo_bar"


def test_backslash_is_literal(client, seed):
    seed([
        ("alice", 1, "o", "path\\to\\file"),
        ("bob",   2, "o", "no slashes"),
    ])
    res = client.get("/api/quotes", params={"q": "\\"})
    body = res.json()
    assert body["total"] == 1
    assert body["quotes"][0]["text"] == "path\\to\\file"


def test_empty_query_returns_all(client, seed):
    seed([
        ("a", 1, "o", "x"),
        ("b", 2, "o", "y"),
    ])
    res = client.get("/api/quotes?q=")
    assert res.json()["total"] == 2
