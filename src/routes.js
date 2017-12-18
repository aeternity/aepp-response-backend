import Router from 'express-promise-router';
import memoize from 'memoizee';
import { twitter } from './twitter';

const routes = Router();

const usersSearch = memoize((q, count) => twitter.get('users/search', { q, count }));
const usersShow = memoize(userId =>
  twitter.get('users/show', { user_id: userId, include_entities: false }));

const transformUser = ({
  id_str,
  name,
  screen_name,
  profile_image_url_https,
  verified,
}) => ({
  id: id_str,
  name,
  screenName: screen_name,
  imageUrl: profile_image_url_https.replace('_normal', ''),
  verified,
});

routes.get('/show', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    throw Object.assign(new Error('The "userId" parameter is required'), { status: 400 });
  }

  res.json(transformUser(await usersShow(userId)));
});

routes.get('/search', async (req, res) => {
  const { q, verified } = req.query;

  if (!q) {
    throw Object.assign(new Error('The "q" parameter is required'), { status: 400 });
  }

  const users = (await usersSearch(q, verified ? 20 : 5))
    .filter(user => !+verified || user.verified)
    .map(transformUser)
    .slice(0, 5);

  res.json(users);
});

export default routes;
