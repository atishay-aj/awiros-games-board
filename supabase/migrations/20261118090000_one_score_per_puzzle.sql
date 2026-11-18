-- A numbered puzzle can only be posted once per player, so the same share can't
-- count on two different days. (Scores without a puzzle number are not affected.)
create unique index scores_one_per_puzzle on public.scores (user_id, game, puzzle) where puzzle is not null;
