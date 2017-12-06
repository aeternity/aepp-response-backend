import app from './app';
import './listener';

const { PORT = 8080 } = process.env;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`)); // eslint-disable-line no-console
