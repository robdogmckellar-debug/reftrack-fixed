import { ApplicationError } from '../services/application-error';

export function validateExternalUrl(value: string): URL {
  const url = parseUrl(value, 'EXTERNAL_URL_REJECTED', 'The link is not a valid URL.');
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new ApplicationError(
      'EXTERNAL_URL_REJECTED',
      'Only credential-free HTTPS links can be opened.',
      { field: 'url', recoverable: true },
    );
  }
  return url;
}

function parseUrl(
  value: string,
  code: 'EXTERNAL_URL_REJECTED' | 'VALIDATION_FAILED',
  message: string,
): URL {
  try {
    return new URL(value);
  } catch (error: unknown) {
    throw new ApplicationError(code, message, {
      field: 'url',
      recoverable: true,
      cause: error,
    });
  }
}
