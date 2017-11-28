import { Router } from 'express';
import twitter from './twitter';

const routes = Router();

routes.get('/search', async (req, res, next) => {
  const { q, verified } = req.query;

  if (!q) {
    const error = new Error('The "q" parameter is required');
    error.status = 400;
    next(error);
    return;
  }

  const users = (await twitter.get('users/search', { q, count: verified ? 20 : 5 }))
    .filter(user => !verified || user.verified)
    .map(({ name, screen_name }) => ({ name, screen_name }));

  res.json(users);
});

export default routes;
