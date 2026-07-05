-- Anti-join; with an index on orders(user_id) the planner avoids a full scan.
SELECT u.name
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);
