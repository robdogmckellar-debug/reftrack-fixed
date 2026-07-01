import { render } from 'preact';

import { App } from './app/App';
import './styles/tokens.css';
import './styles/global.css';
import './styles/design-system.css';
import './styles/shell.css';
import './styles/accessibility.css';
import './styles/dashboard.css';
import './styles/dashboard-card-layout.css';
import './styles/site-editor.css';
import './styles/statistics.css';
import './styles/settings.css';
import './styles/daily-tasks.css';

const root = document.getElementById('app-root');
if (!root) throw new Error('RefTrack renderer root was not found.');

render(<App />, root);
