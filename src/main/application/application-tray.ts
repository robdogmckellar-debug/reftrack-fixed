import path from 'node:path';

import { app, Menu, Tray } from 'electron';
import type { BrowserWindow } from 'electron';

import { focusMainWindow } from './single-instance';

export function createApplicationTray(getMainWindow: () => BrowserWindow | null): Tray {
  const tray = new Tray(path.join(app.getAppPath(), 'assets', 'icon.png'));
  const openRefTrack = (): void => focusMainWindow(getMainWindow());

  tray.setToolTip('RefTrack');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open RefTrack', click: openRefTrack },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
  tray.on('click', openRefTrack);

  return tray;
}
