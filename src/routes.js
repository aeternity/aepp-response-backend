import Router from 'express-promise-router';
import { usersSearch, usersShow } from './twitter';

const routes = Router();

const transformUser = ({
  id_str: id,
  name,
  screen_name: screenName,
  profile_image_url_https: imageUrl,
  verified,
}) => ({
  id,
  name,
  screenName,
  imageUrl: imageUrl.replace('_normal', ''),
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
