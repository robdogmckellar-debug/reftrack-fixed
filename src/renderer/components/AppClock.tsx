import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

const CLOCK_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function clockValue(date: Date): string {
  return CLOCK_FORMATTER.format(date);
}

export function AppClock(): JSX.Element {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const update = (): void => setNow(new Date());
    const timeout = window.setTimeout(
      () => {
        update();
        const interval = window.setInterval(update, 1000);
        cleanupInterval = () => window.clearInterval(interval);
      },
      1000 - (Date.now() % 1000),
    );

    let cleanupInterval = (): void => undefined;
    return () => {
      window.clearTimeout(timeout);
      cleanupInterval();
    };
  }, []);

  return (
    <time
      class="app-clock"
      dateTime={now.toISOString()}
      aria-label={`Current time ${clockValue(now)}`}
    >
      {clockValue(now)}
    </time>
  );
}
