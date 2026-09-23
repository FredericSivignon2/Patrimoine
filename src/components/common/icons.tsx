import type { ReactNode } from 'react';

interface IconProps {
  className?: string;
}

function Icon({ className = 'size-5', children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
  </Icon>
);

export const WalletIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 7a2 2 0 0 1 2-2h12v4" />
    <path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Z" />
    <circle cx="16.5" cy="14.5" r="1" />
  </Icon>
);

export const ArrowsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 4v14m0 0-3-3m3 3 3-3" />
    <path d="M17 20V6m0 0-3 3m3-3 3 3" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const XIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const CloudIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 0 9H7Z" />
  </Icon>
);

export const PieIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3v9h9a9 9 0 1 1-9-9Z" />
    <path d="M15.5 3.6A9 9 0 0 1 20.4 8.5H15.5V3.6Z" />
  </Icon>
);

export const ShieldIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3 5 6v5.5c0 4.4 2.9 8.2 7 9.5 4.1-1.3 7-5.1 7-9.5V6l-7-3Z" />
    <path d="m9.5 12 1.8 1.8 3.4-3.6" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);

export const BankIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 9.5 12 4l9 5.5" />
    <path d="M5 9.5V18M9.5 9.5V18M14.5 9.5V18M19 9.5V18M3 20h18" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const TrendingUpIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 17 9.5 11 13.5 14 20 6.5" />
    <path d="M15 6.5h5v5" />
  </Icon>
);
