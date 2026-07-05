CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, total REAL);
CREATE INDEX idx_orders_user ON orders(user_id);
