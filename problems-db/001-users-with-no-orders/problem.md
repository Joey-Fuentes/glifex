# DB 001 · Users With No Orders

## Task
Return the `name` of every user who has never placed an order.

## Order matters
No — the harness compares row sets order-independently unless a problem says otherwise.

## Engines
Runs offline on SQLite (`glifex db test 001`) and on Postgres when hosted.
The schema is dialect-neutral so both engines accept it.
