/**
 * Thin wrappers over `@openai/apps-sdk-ui` Badge/Button.
 * Maps legacy `tone` props used by MRSViewport onto official `color` values.
 */
import {
  Badge as SdkBadge,
  type BadgeProps as SdkBadgeProps,
} from "@openai/apps-sdk-ui/components/Badge";
import {
  Button as SdkButton,
  type ButtonProps as SdkButtonProps,
} from "@openai/apps-sdk-ui/components/Button";
import type { ReactNode } from "react";

export type MrsBadgeTone = "neutral" | "accent" | "warn";

const TONE_TO_COLOR: Record<MrsBadgeTone, NonNullable<SdkBadgeProps["color"]>> = {
  neutral: "secondary",
  accent: "info",
  warn: "warning",
};

export function Badge({
  children,
  tone = "neutral",
  color,
  ...rest
}: Omit<SdkBadgeProps, "children"> & {
  children: ReactNode;
  tone?: MrsBadgeTone;
}) {
  return (
    <SdkBadge color={color ?? TONE_TO_COLOR[tone]} size="sm" variant="soft" {...rest}>
      {children}
    </SdkBadge>
  );
}

export function Button({
  children,
  color = "secondary",
  variant = "outline",
  ...rest
}: SdkButtonProps) {
  return (
    <SdkButton color={color} variant={variant} size="sm" pill={false} {...rest}>
      {children}
    </SdkButton>
  );
}

export { SdkBadge, SdkButton };
