export const PRIMARY_SCREEN_NAMES = Object.freeze([
  'Dashboard',
  'Site Editor',
  'Statistics',
  'Settings',
  'Daily Tasks',
]);

export function expectedDocumentTitle(screenName) {
  if (!PRIMARY_SCREEN_NAMES.includes(screenName)) {
    throw new Error(`Unknown RefTrack screen: ${screenName}`);
  }
  return `${screenName} · RefTrack`;
}

export function hasValidScreenResult(result) {
  return (
    result.selected === 'true' &&
    result.visible === true &&
    result.documentTitle === expectedDocumentTitle(result.screen)
  );
}
