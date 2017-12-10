import Router from 'express-promise-router';
import memoize from 'memoizee';
import { twitter } from './twitter';

const routes = Router();
const usersSearch = memoize((q, count) => twitter.get('users/search', { q, count }));

routes.get('/search', async (req, res) => {
  const { q, verified } = req.query;

  if (!q) {
    throw Object.assign(new Error('The "q" parameter is required'), { status: 400 });
  }

  const users = (await usersSearch(q, verified ? 20 : 5))
    .filter(user => !+verified || user.verified)
    .map(({ name, screen_name }) => ({ name, screen_name }))
    .slice(0, 5);

  res.json(users);
});

export default routes;
