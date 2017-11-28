import { Router } from 'express';
import memoize from 'memoizee';
import twitter from './twitter';

const routes = Router();
const usersSearch = memoize((q, count) => twitter.get('users/search', { q, count }));

routes.get('/search', async (req, res, next) => {
  const { q, verified } = req.query;

  if (!q) {
    const error = new Error('The "q" parameter is required');
    error.status = 400;
    next(error);
    return;
  }

  const users = (await usersSearch(q, verified ? 20 : 5))
    .filter(user => !verified || user.verified)
    .map(({ name, screen_name }) => ({ name, screen_name }))
    .slice(0, 5);

  res.json(users);
});

export default routes;
