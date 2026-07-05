SELECT name FROM users
WHERE id NOT IN (SELECT user_id FROM orders);
