import type { JSX } from 'preact';

interface IconProps extends JSX.SVGAttributes<SVGSVGElement> {
  size?: number;
}

function IconBase({ size = 18, children, ...props }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function LinkIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function DashboardIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8" />
    </IconBase>
  );
}

export function EditIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M12 20h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function StatisticsIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M5 20V11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M12 20V4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M19 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.39.28.73.63 1 .99.25.35.39.78.4 1.21V11h.2v4h-.09A1.7 1.7 0 0 0 19.4 15Z"
        stroke="currentColor"
        stroke-width="1.45"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function FolderIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="M3.5 6.5A2.5 2.5 0 0 1 6 4h3l2 2h7a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-10Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function ShieldIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="M12 3 19 6v5c0 4.4-2.8 8.1-7 10-4.2-1.9-7-5.6-7-10V6l7-3Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="m8.5 12 2.2 2.2 4.8-5"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function InfoIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
      <path d="M12 11v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </IconBase>
  );
}

export function DatabaseIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="5" rx="7.5" ry="3" stroke="currentColor" stroke-width="1.8" />
      <path
        d="M4.5 5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5M4.5 11v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </IconBase>
  );
}

export function TasksIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="m4 7 2 2 4-4"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12 7h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path
        d="m4 14 2 2 4-4"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M12 14h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M4 21h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </IconBase>
  );
}

export function RefreshIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="M20 11a8 8 0 1 0 2 5.3"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <path
        d="M20 4v7h-7"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function ClipboardIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="6" y="5" width="12" height="16" rx="2" stroke="currentColor" stroke-width="1.8" />
      <path
        d="M9 5.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <path d="M9 10h6M9 14h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="m5 12.5 4.2 4.2L19 7"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function ExternalLinkIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M14 5h5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="m12 12 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path
        d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function ActivityIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
      <path
        d="M12 7v5l3.5 2"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function TrashIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path
        d="M9 7V4h6v3M7 7l1 14h8l1-14"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </IconBase>
  );
}

export function SuccessIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
      <path
        d="m8 12.5 2.6 2.6L16.5 9"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function EarningsIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
      <path
        d="M15.5 8.5c-.7-.7-1.8-1.1-3-1.1-1.7 0-3 .8-3 2s1 1.8 3 2.2 3 1 3 2.3-1.3 2.2-3 2.2c-1.4 0-2.7-.5-3.5-1.4M12 5.5v13"
        stroke="currentColor"
        stroke-width="1.65"
        stroke-linecap="round"
      />
    </IconBase>
  );
}

export function ChevronLeftIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function ChevronRightIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function TrophyIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="M8 4h8v4a4 4 0 0 1-8 0V4Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 12v4M8 20h8M9 16h6"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function CalendarIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" />
      <path
        d="M7 3v4M17 3v4M3 10h18"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </IconBase>
  );
}

export function PlusIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
    </IconBase>
  );
}

export function ImportIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="M5 15v4h14v-4"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12 4v10m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}

export function ChevronDownIcon(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </IconBase>
  );
}
